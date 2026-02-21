import neo4j, { Driver } from 'neo4j-driver';
import type { ParsedComponent, ParsedDependency, ParsedModule } from './types.js';

let driver: Driver | null = null;

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
}

export async function initDatabase(config: Neo4jConfig): Promise<Driver> {
  driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password));
  // Verify connection
  await driver.getServerInfo();
  // Ensure constraints exist
  await ensureSchema(config.database);
  return driver;
}

export function getDriver(): Driver {
  if (!driver) throw new Error('Database not initialized. Call initDatabase first.');
  return driver;
}

async function ensureSchema(database?: string): Promise<void> {
  const d = getDriver();
  await d.executeQuery(
    'CREATE CONSTRAINT component_filepath IF NOT EXISTS FOR (c:Component) REQUIRE c.filePath IS UNIQUE',
    {},
    { database }
  );
  await d.executeQuery(
    'CREATE CONSTRAINT module_path IF NOT EXISTS FOR (m:Module) REQUIRE m.path IS UNIQUE',
    {},
    { database }
  );
  await d.executeQuery(
    'CREATE CONSTRAINT layer_name IF NOT EXISTS FOR (l:Layer) REQUIRE l.name IS UNIQUE',
    {},
    { database }
  );
}

export async function clearGraph(database?: string): Promise<void> {
  const d = getDriver();
  await d.executeQuery('MATCH (n) WHERE n:Component OR n:Module OR n:Layer DETACH DELETE n', {}, { database });
}

export async function ingestComponents(
  components: ParsedComponent[],
  database?: string
): Promise<void> {
  const d = getDriver();
  // Batch upsert components using UNWIND for performance
  await d.executeQuery(
    `UNWIND $components AS comp
     MERGE (c:Component {filePath: comp.filePath})
     SET c.name = comp.name,
         c.layer = comp.layer,
         c.exportType = comp.exportType,
         c.hasState = comp.hasState,
         c.props = comp.props,
         c.description = comp.description,
         c.hooks = comp.hooks`,
    {
      components: components.map(c => ({
        filePath: c.filePath,
        name: c.name,
        layer: c.layer,
        exportType: c.exportType,
        hasState: c.hasState,
        props: JSON.stringify(c.props),
        description: c.description,
        hooks: JSON.stringify(c.hooks),
      })),
    },
    { database }
  );
}

export async function ingestDependencies(
  deps: ParsedDependency[],
  database?: string
): Promise<number> {
  const d = getDriver();
  // Batch create relationships using UNWIND, return count of created edges
  const { records } = await d.executeQuery(
    `UNWIND $deps AS dep
     MATCH (source:Component {filePath: dep.sourceFile})
     MATCH (target:Component {filePath: dep.targetFile})
     MERGE (source)-[r:DEPENDS_ON]->(target)
     SET r.importType = dep.importType
     RETURN count(r) AS created`,
    {
      deps: deps.map(d => ({
        sourceFile: d.sourceFile,
        targetFile: d.targetFile,
        importType: d.importType,
      })),
    },
    { database }
  );
  const created = records[0]?.get('created')?.toNumber?.() ?? records[0]?.get('created') ?? 0;
  if (created < deps.length) {
    console.error(`[react-graph] Warning: ${deps.length - created}/${deps.length} dependency edges were skipped (missing source or target component).`);
  }
  return created as number;
}

export async function query(
  cypher: string,
  params?: Record<string, unknown>,
  database?: string
): Promise<Record<string, unknown>[]> {
  const d = getDriver();
  const { records } = await d.executeQuery(cypher, params || {}, {
    database,
    routing: neo4j.routing.READ,
  });
  // Convert Neo4j records to plain objects
  return records.map(record => {
    const obj: Record<string, unknown> = {};
    for (const key of record.keys as string[]) {
      let val = record.get(key);
      // Convert Neo4j Integer to JS number
      if (neo4j.isInt(val)) {
        val = val.toNumber();
      }
      obj[key] = val;
    }
    return obj;
  });
}

export async function ingestModules(
  modules: ParsedModule[],
  components: ParsedComponent[],
  database?: string
): Promise<void> {
  const d = getDriver();

  // 1. MERGE Module nodes
  await d.executeQuery(
    `UNWIND $modules AS mod
     MERGE (m:Module {path: mod.path})
     SET m.name = mod.name`,
    { modules: modules.map(m => ({ path: m.path, name: m.name })) },
    { database }
  );

  // 2. MERGE Module→Module CONTAINS edges (parent→child)
  const childModules = modules.filter(m => m.parentPath !== null);
  if (childModules.length > 0) {
    await d.executeQuery(
      `UNWIND $edges AS e
       MATCH (parent:Module {path: e.parentPath})
       MATCH (child:Module {path: e.childPath})
       MERGE (parent)-[:CONTAINS]->(child)`,
      { edges: childModules.map(m => ({ parentPath: m.parentPath, childPath: m.path })) },
      { database }
    );
  }

  // 3. MERGE Module→Component CONTAINS edges
  const dirname = (p: string) => {
    const parts = p.replace(/\\/g, '/').split('/');
    parts.pop();
    return parts.join('/') || '.';
  };
  const compEdges = components.map(c => ({ modulePath: dirname(c.filePath), filePath: c.filePath }));
  await d.executeQuery(
    `UNWIND $edges AS e
     MATCH (m:Module {path: e.modulePath})
     MATCH (c:Component {filePath: e.filePath})
     MERGE (m)-[:CONTAINS]->(c)`,
    { edges: compEdges },
    { database }
  );
}

export async function ingestLayers(
  layers: string[],
  components: ParsedComponent[],
  database?: string
): Promise<void> {
  const d = getDriver();

  // 1. MERGE Layer nodes
  await d.executeQuery(
    `UNWIND $layers AS name
     MERGE (l:Layer {name: name})`,
    { layers },
    { database }
  );

  // 2. MERGE Component→Layer BELONGS_TO_LAYER edges
  const edges = components.map(c => ({ filePath: c.filePath, layer: c.layer }));
  await d.executeQuery(
    `UNWIND $edges AS e
     MATCH (c:Component {filePath: e.filePath})
     MATCH (l:Layer {name: e.layer})
     MERGE (c)-[:BELONGS_TO_LAYER]->(l)`,
    { edges },
    { database }
  );
}

export async function closeDatabase(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
