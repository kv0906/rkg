import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { parseCodebase } from './parser.js';
import { initDatabase, clearGraph, ingestComponents, ingestDependencies, ingestModules, ingestLayers, query, closeDatabase } from './db.js';
import type { GraphConfig, ToolResponse, PropInfo } from './types.js';

let config: GraphConfig;

function safeJsonParse<T>(str: unknown, fallback: T): T {
  if (typeof str !== 'string') return fallback;
  try { return JSON.parse(str) as T; } catch { return fallback; }
}

function success(data: unknown, elapsed_ms: number): { content: { type: 'text'; text: string }[] } {
  const response: ToolResponse = { success: true, data, metadata: { elapsed_ms } };
  return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
}

function error(msg: string, suggestion?: string): { content: { type: 'text'; text: string }[]; isError: true } {
  const response: ToolResponse = { success: false, error: msg, suggestion };
  return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }], isError: true };
}

const TOOLS = [
  {
    name: 'reindex_codebase',
    description: 'Re-parse the React codebase and rebuild the component graph. Run this after code changes to refresh the graph data.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'get_component_info',
    description: 'Get detailed information about a component by name, including its layer, export type, state usage, and dependency/dependent counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive)' },
      },
      required: ['componentName'],
    },
  },
  {
    name: 'get_component_dependencies',
    description: 'Get the components that a given component imports/depends on. Use depth=1 for immediate dependencies or depth=0 for the full recursive tree.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive)' },
        depth: { type: 'number', description: 'Traversal depth. 1=immediate (default), 0=full recursive tree' },
      },
      required: ['componentName'],
    },
  },
  {
    name: 'get_component_dependents',
    description: 'Get the components that depend on/import a given component. Shows the blast radius of changes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive)' },
        depth: { type: 'number', description: 'Traversal depth. 1=immediate (default), 0=full recursive tree' },
      },
      required: ['componentName'],
    },
  },
  {
    name: 'get_layer_components',
    description: 'List all components in a given Atomic Design layer (e.g., atom, molecule, organism, template, page).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        layerName: { type: 'string', description: 'Layer name (case-insensitive): atom, molecule, organism, template, page, unknown' },
      },
      required: ['layerName'],
    },
  },
  {
    name: 'get_graph_summary',
    description: 'Get a high-level overview of the component graph: counts per layer, total components/edges, and most-connected components.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'find_similar_components',
    description: 'Before creating a new component, check if similar ones already exist. Matches by name substring, prop overlap, and layer. Returns ranked results with match reasons.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term to match against component names (case-insensitive substring)' },
        props: { type: 'array', items: { type: 'string' }, description: 'Prop names the new component would have. Used for overlap scoring.' },
        layer: { type: 'string', description: 'Expected layer (atom, molecule, organism, template, page)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'search_components',
    description: 'Structured search for components by multiple criteria. All filters are optional and combined with AND logic.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namePattern: { type: 'string', description: 'Substring to match against component name (case-insensitive)' },
        layer: { type: 'string', description: 'Filter by layer' },
        hasState: { type: 'boolean', description: 'Filter by state usage' },
        hooks: { type: 'array', items: { type: 'string' }, description: 'Filter by hook names (e.g. ["useState", "useContext"])' },
        propNames: { type: 'array', items: { type: 'string' }, description: 'Filter by prop names' },
        exportType: { type: 'string', description: 'Filter by export type: default or named' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_change_impact',
    description: 'Analyze the blast radius of changing a component. Shows direct dependents, transitive dependents, affected pages, layers, and a risk assessment.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive)' },
      },
      required: ['componentName'],
    },
  },
  {
    name: 'get_module_contents',
    description: 'List child modules and components in a directory. Use depth=1 for immediate children (default) or depth=0 for recursive.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Module path (e.g. "components", "components/atoms")' },
        depth: { type: 'number', description: 'Traversal depth. 1=immediate children (default), 0=recursive' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_layer_summary',
    description: 'Get component counts per layer and a cross-layer dependency matrix showing how many dependencies flow between layers.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'execute_cypher',
    description: 'Execute a read-only Cypher query against the component graph. Nodes: Component (filePath, name, layer, exportType, hasState, props, description, hooks), Module (path, name), Layer (name). Edges: DEPENDS_ON (importType), CONTAINS (Module→Module, Module→Component), BELONGS_TO_LAYER (Component→Layer).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Cypher query (read-only, no CREATE/DELETE/DROP/SET/MERGE/REMOVE)' },
      },
      required: ['query'],
    },
  },
];

async function handleReindex(): Promise<ReturnType<typeof success>> {
  const start = Date.now();
  await clearGraph(config.neo4j.database);
  const result = parseCodebase(config);
  await ingestComponents(result.components, config.neo4j.database);
  await ingestDependencies(result.dependencies, config.neo4j.database);
  await ingestModules(result.modules, result.components, config.neo4j.database);
  await ingestLayers(result.layers, result.components, config.neo4j.database);
  const elapsed_ms = Date.now() - start;
  return success(
    {
      components: result.components.length,
      dependencies: result.dependencies.length,
      modules: result.modules.length,
      layers: result.layers.length,
      elapsed_ms,
    },
    elapsed_ms
  );
}

async function handleGetComponentInfo(args: { componentName: string }) {
  const start = Date.now();
  const db = config.neo4j.database;
  const rows = await query(`
    MATCH (c:Component)
    WHERE toLower(c.name) = toLower($name)
    OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep:Component)
    WITH c, count(DISTINCT dep) AS dependencyCount
    OPTIONAL MATCH (parent:Component)-[:DEPENDS_ON]->(c)
    RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
           c.exportType AS exportType, c.hasState AS hasState,
           c.props AS props, c.description AS description, c.hooks AS hooks,
           dependencyCount,
           count(DISTINCT parent) AS dependentCount
  `, { name: args.componentName }, db);

  if (!rows || rows.length === 0) {
    return error(`Component "${args.componentName}" not found`, 'Try get_graph_summary to see available components, or reindex_codebase if the component was recently added.');
  }
  // Parse JSON-stored fields
  const enriched = rows.map(row => ({
    ...row,
    props: safeJsonParse<PropInfo[]>(row.props, []),
    hooks: safeJsonParse<string[]>(row.hooks, []),
  }));
  return success(enriched, Date.now() - start);
}

async function assertComponentExists(name: string, db?: string) {
  const exists = await query(
    'MATCH (c:Component) WHERE toLower(c.name) = toLower($name) RETURN c.name LIMIT 1',
    { name }, db
  );
  if (!exists || exists.length === 0) {
    return error(`Component "${name}" not found`, 'Try get_graph_summary to see available components, or reindex_codebase if the component was recently added.');
  }
  return null;
}

async function handleGetComponentDependencies(args: { componentName: string; depth?: number }) {
  const start = Date.now();
  const depth = args.depth ?? 1;
  const db = config.neo4j.database;

  const notFound = await assertComponentExists(args.componentName, db);
  if (notFound) return notFound;

  let cypher: string;
  if (depth === 0) {
    cypher = `
      MATCH (c:Component)
      WHERE toLower(c.name) = toLower($name)
      MATCH (c)-[:DEPENDS_ON*1..]->(dep:Component)
      RETURN DISTINCT dep.name AS name, dep.filePath AS filePath, dep.layer AS layer
    `;
  } else {
    cypher = `
      MATCH (c:Component)-[:DEPENDS_ON]->(dep:Component)
      WHERE toLower(c.name) = toLower($name)
      RETURN dep.name AS name, dep.filePath AS filePath, dep.layer AS layer
    `;
  }

  const rows = await query(cypher, { name: args.componentName }, db);
  return success(rows, Date.now() - start);
}

async function handleGetComponentDependents(args: { componentName: string; depth?: number }) {
  const start = Date.now();
  const depth = args.depth ?? 1;
  const db = config.neo4j.database;

  const notFound = await assertComponentExists(args.componentName, db);
  if (notFound) return notFound;

  let cypher: string;
  if (depth === 0) {
    cypher = `
      MATCH (c:Component)
      WHERE toLower(c.name) = toLower($name)
      MATCH (parent:Component)-[:DEPENDS_ON*1..]->(c)
      RETURN DISTINCT parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
    `;
  } else {
    cypher = `
      MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
      WHERE toLower(c.name) = toLower($name)
      RETURN parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
    `;
  }

  const rows = await query(cypher, { name: args.componentName }, db);
  return success(rows, Date.now() - start);
}

async function handleGetLayerComponents(args: { layerName: string }) {
  const start = Date.now();
  const db = config.neo4j.database;
  const rows = await query(`
    MATCH (c:Component)
    WHERE toLower(c.layer) = toLower($layerName)
    RETURN c.name AS name, c.filePath AS filePath, c.exportType AS exportType, c.hasState AS hasState
    ORDER BY c.name
  `, { layerName: args.layerName }, db);
  return success(rows, Date.now() - start);
}

async function handleGetGraphSummary() {
  const start = Date.now();
  const db = config.neo4j.database;

  const [layerBreakdown, totalComponents, totalEdges, mostDependedOn, mostDependencies] = await Promise.all([
    query(`
      MATCH (c:Component)
      RETURN c.layer AS layer, count(*) AS count
      ORDER BY count DESC
    `, {}, db),
    query('MATCH (c:Component) RETURN count(c) AS total', {}, db),
    query('MATCH ()-[r:DEPENDS_ON]->() RETURN count(r) AS total', {}, db),
    query(`
      MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
      RETURN c.name AS name, c.layer AS layer, count(parent) AS dependentCount
      ORDER BY dependentCount DESC
      LIMIT 10
    `, {}, db),
    query(`
      MATCH (c:Component)-[:DEPENDS_ON]->(dep:Component)
      RETURN c.name AS name, c.layer AS layer, count(dep) AS dependencyCount
      ORDER BY dependencyCount DESC
      LIMIT 10
    `, {}, db),
  ]);

  return success({
    layerBreakdown,
    totalComponents,
    totalEdges,
    mostDependedOn,
    mostDependencies,
  }, Date.now() - start);
}

async function handleFindSimilarComponents(args: { query?: string; props?: string[]; layer?: string }) {
  const start = Date.now();
  const db = config.neo4j.database;

  // Build Cypher with optional name/layer filters
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (args.query) {
    conditions.push('toLower(c.name) CONTAINS toLower($query)');
    params.query = args.query;
  }
  if (args.layer) {
    conditions.push('toLower(c.layer) = toLower($layer)');
    params.layer = args.layer;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(`
    MATCH (c:Component)
    ${where}
    RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
           c.props AS props, c.description AS description, c.hooks AS hooks
  `, params, db);

  // Score and rank results
  const inputProps = args.props ?? [];
  const scored = rows.map(row => {
    const compProps = safeJsonParse<PropInfo[]>(row.props, []);
    const compPropNames = compProps.map(p => p.name);
    const reasons: string[] = [];
    let score = 0;

    if (args.query && (row.name as string).toLowerCase().includes(args.query.toLowerCase())) {
      score += 3;
      reasons.push(`name matches "${args.query}"`);
    }
    if (args.layer && (row.layer as string).toLowerCase() === args.layer.toLowerCase()) {
      score += 2;
      reasons.push(`same layer "${args.layer}"`);
    }
    if (inputProps.length > 0) {
      const overlap = inputProps.filter(p => compPropNames.includes(p));
      if (overlap.length > 0) {
        score += overlap.length;
        reasons.push(`${overlap.length} prop(s) overlap: ${overlap.join(', ')}`);
      }
    }

    return {
      name: row.name,
      filePath: row.filePath,
      layer: row.layer,
      description: row.description || '',
      props: compProps,
      hooks: safeJsonParse<string[]>(row.hooks, []),
      score,
      reasons,
    };
  });

  const ranked = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  return success(ranked, Date.now() - start);
}

async function handleSearchComponents(args: {
  namePattern?: string; layer?: string; hasState?: boolean;
  hooks?: string[]; propNames?: string[]; exportType?: string;
}) {
  const start = Date.now();
  const db = config.neo4j.database;

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (args.namePattern) {
    conditions.push('toLower(c.name) CONTAINS toLower($namePattern)');
    params.namePattern = args.namePattern;
  }
  if (args.layer) {
    conditions.push('toLower(c.layer) = toLower($layer)');
    params.layer = args.layer;
  }
  if (args.hasState !== undefined) {
    conditions.push('c.hasState = $hasState');
    params.hasState = args.hasState;
  }
  if (args.exportType) {
    conditions.push('c.exportType = $exportType');
    params.exportType = args.exportType;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(`
    MATCH (c:Component)
    ${where}
    RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
           c.exportType AS exportType, c.hasState AS hasState,
           c.props AS props, c.description AS description, c.hooks AS hooks
    ORDER BY c.name
  `, params, db);

  // JS-side post-filter for JSON-stored fields
  let results = rows.map(row => ({
    ...row,
    props: safeJsonParse<PropInfo[]>(row.props, []),
    hooks: safeJsonParse<string[]>(row.hooks, []),
  }));

  if (args.hooks && args.hooks.length > 0) {
    results = results.filter(r =>
      args.hooks!.every(h => r.hooks.includes(h))
    );
  }
  if (args.propNames && args.propNames.length > 0) {
    results = results.filter(r => {
      const propNames = r.props.map((p: PropInfo) => p.name);
      return args.propNames!.every(p => propNames.includes(p));
    });
  }

  return success(results, Date.now() - start);
}

async function handleGetChangeImpact(args: { componentName: string }) {
  const start = Date.now();
  const db = config.neo4j.database;

  const notFound = await assertComponentExists(args.componentName, db);
  if (notFound) return notFound;

  // 4 parallel queries
  const [componentRows, directRows, transitiveRows, pageRows] = await Promise.all([
    // Component info
    query(`
      MATCH (c:Component)
      WHERE toLower(c.name) = toLower($name)
      RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
             c.props AS props, c.description AS description, c.hooks AS hooks
    `, { name: args.componentName }, db),
    // Direct dependents
    query(`
      MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
      WHERE toLower(c.name) = toLower($name)
      RETURN parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
    `, { name: args.componentName }, db),
    // Transitive dependents
    query(`
      MATCH (c:Component)
      WHERE toLower(c.name) = toLower($name)
      MATCH (parent:Component)-[:DEPENDS_ON*1..]->(c)
      RETURN DISTINCT parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
    `, { name: args.componentName }, db),
    // Affected pages
    query(`
      MATCH (c:Component)
      WHERE toLower(c.name) = toLower($name)
      MATCH (page:Component)-[:DEPENDS_ON*1..]->(c)
      WHERE page.layer = 'page'
      RETURN DISTINCT page.name AS name, page.filePath AS filePath
    `, { name: args.componentName }, db),
  ]);

  const comp = componentRows[0];
  const affectedLayers = [...new Set(transitiveRows.map(r => r.layer as string))];

  // Risk assessment
  const directCount = directRows.length;
  const transitiveCount = transitiveRows.length;
  const pageCount = pageRows.length;
  let risk: 'low' | 'medium' | 'high';
  let riskReason: string;

  if (transitiveCount >= 5 || pageCount >= 2) {
    risk = 'high';
    riskReason = `${transitiveCount} transitive dependents across ${pageCount} page(s)`;
  } else if (transitiveCount >= 2 || pageCount >= 1) {
    risk = 'medium';
    riskReason = `${transitiveCount} transitive dependents, ${pageCount} page(s) affected`;
  } else {
    risk = 'low';
    riskReason = `${directCount} direct dependent(s), limited blast radius`;
  }

  return success({
    component: {
      ...comp,
      props: safeJsonParse<PropInfo[]>(comp.props, []),
      hooks: safeJsonParse<string[]>(comp.hooks, []),
    },
    directDependents: directRows,
    transitiveDependents: transitiveRows,
    affectedPages: pageRows,
    affectedLayers,
    summary: { risk, riskReason },
  }, Date.now() - start);
}

async function handleGetModuleContents(args: { path: string; depth?: number }) {
  const start = Date.now();
  const db = config.neo4j.database;
  const depth = args.depth ?? 1;

  // Check module exists
  const moduleExists = await query(
    'MATCH (m:Module {path: $path}) RETURN m.path LIMIT 1',
    { path: args.path }, db
  );
  if (!moduleExists || moduleExists.length === 0) {
    return error(`Module "${args.path}" not found`, 'Try execute_cypher with: MATCH (m:Module) RETURN m.path ORDER BY m.path');
  }

  let childModules: Record<string, unknown>[];
  let childComponents: Record<string, unknown>[];

  if (depth === 0) {
    // Recursive
    childModules = await query(`
      MATCH (m:Module {path: $path})-[:CONTAINS*1..]->(child:Module)
      RETURN child.path AS path, child.name AS name
      ORDER BY child.path
    `, { path: args.path }, db);
    childComponents = await query(`
      MATCH (m:Module {path: $path})-[:CONTAINS*1..]->(c:Component)
      RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer
      ORDER BY c.filePath
    `, { path: args.path }, db);
  } else {
    // Immediate children
    childModules = await query(`
      MATCH (m:Module {path: $path})-[:CONTAINS]->(child:Module)
      RETURN child.path AS path, child.name AS name
      ORDER BY child.path
    `, { path: args.path }, db);
    childComponents = await query(`
      MATCH (m:Module {path: $path})-[:CONTAINS]->(c:Component)
      RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer
      ORDER BY c.filePath
    `, { path: args.path }, db);
  }

  return success({ module: args.path, childModules, childComponents }, Date.now() - start);
}

async function handleGetLayerSummary() {
  const start = Date.now();
  const db = config.neo4j.database;

  const [counts, crossLayer] = await Promise.all([
    query(`
      MATCH (l:Layer)<-[:BELONGS_TO_LAYER]-(c:Component)
      RETURN l.name AS layer, count(c) AS count
      ORDER BY count DESC
    `, {}, db),
    query(`
      MATCH (src:Component)-[:DEPENDS_ON]->(tgt:Component)
      MATCH (src)-[:BELONGS_TO_LAYER]->(srcLayer:Layer)
      MATCH (tgt)-[:BELONGS_TO_LAYER]->(tgtLayer:Layer)
      RETURN srcLayer.name AS fromLayer, tgtLayer.name AS toLayer, count(*) AS count
      ORDER BY count DESC
    `, {}, db),
  ]);

  return success({ layerCounts: counts, crossLayerDependencies: crossLayer }, Date.now() - start);
}

async function handleExecuteCypher(args: { query: string }) {
  const start = Date.now();
  const db = config.neo4j.database;

  // Safety: reject write operations
  const forbidden = /\b(CREATE|DELETE|DROP|SET|MERGE|REMOVE|DETACH|CALL|LOAD|FOREACH)\b/i;
  if (forbidden.test(args.query)) {
    return error('Write operations are not allowed. Only read queries are permitted.', 'Remove CREATE, DELETE, DROP, SET, MERGE, REMOVE, DETACH, CALL, LOAD, or FOREACH from your query.');
  }

  try {
    const rows = await query(args.query, {}, db);
    return success(rows, Date.now() - start);
  } catch (e) {
    return error(`Cypher query failed: ${(e as Error).message}`, 'Check your Cypher syntax. Available node: Component(filePath, name, layer, exportType, hasState). Edge: DEPENDS_ON(importType).');
  }
}

async function main() {
  // Load configuration
  config = loadConfig();

  // Initialize Neo4j connection
  await initDatabase(config.neo4j);

  // Auto-index on startup if graph is empty
  const countResult = await query('MATCH (c:Component) RETURN count(c) AS total', {}, config.neo4j.database);
  const total = (countResult[0]?.total as number) ?? 0;
  if (total === 0) {
    console.error('[react-graph] No graph data found. Auto-indexing...');
    const result = parseCodebase(config);
    await ingestComponents(result.components, config.neo4j.database);
    await ingestDependencies(result.dependencies, config.neo4j.database);
    await ingestModules(result.modules, result.components, config.neo4j.database);
    await ingestLayers(result.layers, result.components, config.neo4j.database);
    console.error(`[react-graph] Indexed ${result.components.length} components, ${result.dependencies.length} dependencies, ${result.modules.length} modules, ${result.layers.length} layers.`);
  } else {
    console.error(`[react-graph] Graph loaded: ${total} components.`);
  }

  // Create MCP server
  const server = new Server(
    { name: 'react-graph', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'reindex_codebase':
        return handleReindex();
      case 'get_component_info':
        return handleGetComponentInfo(args as { componentName: string });
      case 'get_component_dependencies':
        return handleGetComponentDependencies(args as { componentName: string; depth?: number });
      case 'get_component_dependents':
        return handleGetComponentDependents(args as { componentName: string; depth?: number });
      case 'get_layer_components':
        return handleGetLayerComponents(args as { layerName: string });
      case 'get_graph_summary':
        return handleGetGraphSummary();
      case 'find_similar_components':
        return handleFindSimilarComponents(args as { query?: string; props?: string[]; layer?: string });
      case 'search_components':
        return handleSearchComponents(args as { namePattern?: string; layer?: string; hasState?: boolean; hooks?: string[]; propNames?: string[]; exportType?: string });
      case 'get_change_impact':
        return handleGetChangeImpact(args as { componentName: string });
      case 'get_module_contents':
        return handleGetModuleContents(args as { path: string; depth?: number });
      case 'get_layer_summary':
        return handleGetLayerSummary();
      case 'execute_cypher':
        return handleExecuteCypher(args as { query: string });
      default:
        return error(`Unknown tool: ${name}`);
    }
  });

  // Graceful shutdown
  const shutdown = async () => { await closeDatabase(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect via STDIO
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[react-graph] MCP server running on STDIO (Neo4j backend).');
}

main().catch((e) => {
  console.error('[react-graph] Fatal error:', e);
  process.exit(1);
});
