import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import { loadConfig, toGraphConfig } from './config.js';
import { initDatabase, query, closeDatabase } from './db.js';
import { runIndex } from './core/index-service.js';
import type { GraphConfig, ToolResponse, PropInfo } from './types.js';
import type { RkgConfig } from './types/config.js';

let config: GraphConfig;
let rkgConfig: RkgConfig;

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

interface ParsedComponentIdentifier {
  componentName: string;
  filePath?: string;
}

interface ComponentLookupRow {
  name: string;
  filePath: string;
  layer: string;
}

function normalizeComponentPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

export function parseComponentIdentifier(identifier: string): ParsedComponentIdentifier {
  const raw = identifier.trim();
  const lastColon = raw.lastIndexOf(':');
  if (lastColon <= 0 || lastColon === raw.length - 1) {
    return { componentName: raw };
  }

  const filePath = raw.slice(0, lastColon).trim();
  const componentName = raw.slice(lastColon + 1).trim();
  if (!filePath || !componentName) {
    return { componentName: raw };
  }

  return { filePath, componentName };
}

async function resolveComponentLookup(
  rawIdentifier: string,
  db?: string
): Promise<{ identifier: ParsedComponentIdentifier; matches: ComponentLookupRow[] } | ReturnType<typeof error>> {
  const identifier = parseComponentIdentifier(rawIdentifier);
  const rawRows = await query(`
    MATCH (c:Component)
    WHERE toLower(c.name) = toLower($name)
    RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer
    ORDER BY c.filePath
  `, { name: identifier.componentName }, db);

  const rows: ComponentLookupRow[] = rawRows
    .filter(row =>
      typeof row.name === 'string' &&
      typeof row.filePath === 'string' &&
      typeof row.layer === 'string'
    )
    .map(row => ({
      name: row.name as string,
      filePath: row.filePath as string,
      layer: row.layer as string,
    }));

  if (!rows || rows.length === 0) {
    return error(
      `Component "${rawIdentifier}" not found`,
      'Try get_graph_summary to see available components, or reindex_codebase if the component was recently added.'
    );
  }

  if (!identifier.filePath) {
    return { identifier, matches: rows };
  }

  const expected = normalizeComponentPath(identifier.filePath).toLowerCase();
  const exactMatches = rows.filter(row => normalizeComponentPath(row.filePath).toLowerCase() === expected);
  if (exactMatches.length > 0) {
    return { identifier, matches: exactMatches };
  }

  const suggestions = rows
    .slice(0, 5)
    .map(row => `${row.filePath}:${row.name}`)
    .join(', ');

  return error(
    `Component "${rawIdentifier}" not found`,
    `No component matched that file path. Try one of: ${suggestions}`
  );
}

const TOOLS = [
  {
    name: 'reindex_codebase',
    description: 'Re-parse the React codebase and rebuild the component graph. Run this after code changes to refresh the graph data.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'get_component_info',
    description: 'Get detailed information about components. Accepts a component name (returns all matches) or filePath:componentName for an exact match.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive), or filePath:componentName for exact lookup' },
      },
      required: ['componentName'],
    },
  },
  {
    name: 'get_component_dependencies',
    description: 'Get imported dependencies for matching components. Accepts component name (all matches) or filePath:componentName (exact).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive), or filePath:componentName for exact lookup' },
        depth: { type: 'number', description: 'Traversal depth. 1=immediate (default), 0=full recursive tree' },
      },
      required: ['componentName'],
    },
  },
  {
    name: 'get_component_dependents',
    description: 'Get dependents for matching components. Accepts component name (all matches) or filePath:componentName (exact).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive), or filePath:componentName for exact lookup' },
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
    description: 'Analyze blast radius for matching components. Accepts component name (all matches) or filePath:componentName (exact). Use limit to cap results for high-fan-in components.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentName: { type: 'string', description: 'Component name (case-insensitive), or filePath:componentName for exact lookup' },
        limit: { type: 'number', description: 'Max dependents to return per category (default 50). Use 0 for unlimited.' },
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
  const result = await runIndex({ config: rkgConfig });
  const elapsed_ms = Date.now() - start;
  return success(
    {
      components: result.nodeCount,
      dependencies: result.edgeCount,
      modules: Object.keys(result.classificationSummary).length,
      layers: Object.keys(result.classificationSummary).length,
      elapsed_ms,
    },
    elapsed_ms
  );
}

async function handleGetComponentInfo(args: { componentName: string }) {
  const start = Date.now();
  const db = config.neo4j.database;

  const lookup = await resolveComponentLookup(args.componentName, db);
  if ('isError' in lookup) return lookup;

  const rows = await Promise.all(lookup.matches.map(async (match) => {
    const result = await query(`
      MATCH (c:Component)
      WHERE c.name = $name AND c.filePath = $filePath
      OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep:Component)
      WITH c, count(DISTINCT dep) AS dependencyCount
      OPTIONAL MATCH (parent:Component)-[:DEPENDS_ON]->(c)
      RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
             c.exportType AS exportType, c.hasState AS hasState,
             c.props AS props, c.description AS description, c.hooks AS hooks,
             dependencyCount,
             count(DISTINCT parent) AS dependentCount
    `, { name: match.name, filePath: match.filePath }, db);
    return result[0];
  }));

  // Parse JSON-stored fields
  const enriched = rows.filter(Boolean).map(row => ({
    ...row,
    props: safeJsonParse<PropInfo[]>(row.props, []),
    hooks: safeJsonParse<string[]>(row.hooks, []),
  }));

  return success(enriched, Date.now() - start);
}

async function handleGetComponentDependencies(args: { componentName: string; depth?: number }) {
  const start = Date.now();
  const depth = args.depth ?? 1;
  const db = config.neo4j.database;

  const lookup = await resolveComponentLookup(args.componentName, db);
  if ('isError' in lookup) return lookup;

  const dependencyQuery = depth === 0
    ? `
      MATCH (c:Component)
      WHERE c.name = $name AND c.filePath = $filePath
      MATCH (c)-[:DEPENDS_ON*1..]->(dep:Component)
      RETURN DISTINCT dep.name AS name, dep.filePath AS filePath, dep.layer AS layer
      ORDER BY dep.filePath
    `
    : `
      MATCH (c:Component)-[:DEPENDS_ON]->(dep:Component)
      WHERE c.name = $name AND c.filePath = $filePath
      RETURN dep.name AS name, dep.filePath AS filePath, dep.layer AS layer
      ORDER BY dep.filePath
    `;

  const rows = await Promise.all(lookup.matches.map(async (match) => {
    const dependencies = await query(dependencyQuery, { name: match.name, filePath: match.filePath }, db);
    return {
      component: {
        name: match.name,
        filePath: match.filePath,
        layer: match.layer,
      },
      dependencies,
    };
  }));

  return success(rows, Date.now() - start);
}

async function handleGetComponentDependents(args: { componentName: string; depth?: number }) {
  const start = Date.now();
  const depth = args.depth ?? 1;
  const db = config.neo4j.database;

  const lookup = await resolveComponentLookup(args.componentName, db);
  if ('isError' in lookup) return lookup;

  const dependentsQuery = depth === 0
    ? `
      MATCH (c:Component)
      WHERE c.name = $name AND c.filePath = $filePath
      MATCH (parent:Component)-[:DEPENDS_ON*1..]->(c)
      RETURN DISTINCT parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
      ORDER BY parent.filePath
    `
    : `
      MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
      WHERE c.name = $name AND c.filePath = $filePath
      RETURN parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
      ORDER BY parent.filePath
    `;

  const rows = await Promise.all(lookup.matches.map(async (match) => {
    const dependents = await query(dependentsQuery, { name: match.name, filePath: match.filePath }, db);
    return {
      component: {
        name: match.name,
        filePath: match.filePath,
        layer: match.layer,
      },
      dependents,
    };
  }));

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

  const [layerBreakdown, totalComponents, totalEdges, mostDependedOn, mostDependencies, orphanCount, duplicateNames] = await Promise.all([
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
    query(`
      MATCH (c:Component)
      WHERE NOT (c)-[:DEPENDS_ON]-() AND NOT ()-[:DEPENDS_ON]->(c)
      RETURN count(c) AS count
    `, {}, db),
    query(`
      MATCH (c:Component)
      WITH c.name AS name, count(*) AS cnt, collect(c.filePath) AS files
      WHERE cnt > 1
      RETURN name, cnt AS count, files
      ORDER BY cnt DESC
    `, {}, db),
  ]);

  return success({
    layerBreakdown,
    totalComponents,
    totalEdges,
    mostDependedOn,
    mostDependencies,
    orphanComponents: orphanCount[0]?.count ?? 0,
    duplicateNames: duplicateNames.length > 0 ? duplicateNames : undefined,
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

async function handleGetChangeImpact(args: { componentName: string; limit?: number }) {
  const start = Date.now();
  const db = config.neo4j.database;
  const limit = args.limit === 0 ? Infinity : (args.limit ?? 50);

  const lookup = await resolveComponentLookup(args.componentName, db);
  if ('isError' in lookup) return lookup;

  const impactRows = await Promise.all(lookup.matches.map(async (match) => {
    const [componentRows, directRows, transitiveRows, pageRows] = await Promise.all([
      query(`
        MATCH (c:Component)
        WHERE c.name = $name AND c.filePath = $filePath
        RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
               c.props AS props, c.description AS description, c.hooks AS hooks
      `, { name: match.name, filePath: match.filePath }, db),
      query(`
        MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
        WHERE c.name = $name AND c.filePath = $filePath
        RETURN parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
      `, { name: match.name, filePath: match.filePath }, db),
      query(`
        MATCH (c:Component)
        WHERE c.name = $name AND c.filePath = $filePath
        MATCH (parent:Component)-[:DEPENDS_ON*1..]->(c)
        RETURN DISTINCT parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
      `, { name: match.name, filePath: match.filePath }, db),
      query(`
        MATCH (c:Component)
        WHERE c.name = $name AND c.filePath = $filePath
        MATCH (page:Component)-[:DEPENDS_ON*1..]->(c)
        WHERE page.layer = 'page'
        RETURN DISTINCT page.name AS name, page.filePath AS filePath
      `, { name: match.name, filePath: match.filePath }, db),
    ]);

    const comp = componentRows[0];
    const affectedLayers = [...new Set(transitiveRows.map(r => r.layer as string))];

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

    const truncatedDirect = directRows.slice(0, limit);
    const truncatedTransitive = transitiveRows.slice(0, limit);
    const truncatedPages = pageRows.slice(0, limit);

    return {
      component: {
        ...comp,
        props: safeJsonParse<PropInfo[]>(comp?.props, []),
        hooks: safeJsonParse<string[]>(comp?.hooks, []),
      },
      directDependents: truncatedDirect,
      transitiveDependents: truncatedTransitive,
      affectedPages: truncatedPages,
      affectedLayers,
      summary: {
        risk,
        riskReason,
        totalDirectDependents: directCount,
        totalTransitiveDependents: transitiveCount,
        totalAffectedPages: pageCount,
        ...(directCount > limit || transitiveCount > limit || pageCount > limit
          ? { truncated: true, limit }
          : {}),
      },
    };
  }));

  return success(impactRows, Date.now() - start);
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

export async function main() {
  // Load configuration
  rkgConfig = loadConfig();
  config = toGraphConfig(rkgConfig);

  // Initialize Neo4j connection
  await initDatabase(config.neo4j);

  // Auto-index on startup if graph is empty
  const countResult = await query('MATCH (c:Component) RETURN count(c) AS total', {}, config.neo4j.database);
  const total = (countResult[0]?.total as number) ?? 0;
  if (total === 0) {
    console.error('[react-graph] No graph data found. Auto-indexing...');
    const result = await runIndex({ config: rkgConfig });
    console.error(`[react-graph] Indexed ${result.nodeCount} components, ${result.edgeCount} dependencies.`);
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
        return handleGetChangeImpact(args as { componentName: string; limit?: number });
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

// Only auto-start when run directly (not when imported by CLI)
import { realpathSync } from 'node:fs';
const _resolvedArg1 = process.argv[1] ? realpathSync(process.argv[1]) : '';
const _isDirectRun = _resolvedArg1 === fileURLToPath(import.meta.url);

if (_isDirectRun) {
  main().catch((e) => {
    console.error('[react-graph] Fatal error:', e);
    process.exit(1);
  });
}
