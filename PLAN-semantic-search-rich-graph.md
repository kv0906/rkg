# Implementation Plan: Semantic Search + Richer Graph Model

## Overview

Two independent phases:
- **Phase A**: Semantic search via local embeddings + Neo4j vector index
- **Phase B**: Props & Hooks as first-class graph nodes with Cypher-native queries

---

## Phase A: Semantic Search via Embeddings

### A1. New file: `src/core/embedding.ts`

```typescript
import type { ParsedComponent } from '../types.js';

let pipeline: any = null;

/**
 * Build a searchable text representation of a component for embedding.
 */
export function buildEmbeddingText(component: ParsedComponent): string {
  const lines: string[] = [];
  lines.push(`Component: ${component.name}`);
  if (component.description) {
    lines.push(`Description: ${component.description}`);
  }
  lines.push(`Layer: ${component.layer}`);
  if (component.props.length > 0) {
    const propsStr = component.props
      .map(p => `${p.name}: ${p.type}`)
      .join(', ');
    lines.push(`Props: ${propsStr}`);
  }
  if (component.hooks.length > 0) {
    lines.push(`Hooks: ${component.hooks.join(', ')}`);
  }
  lines.push(`Has state: ${component.hasState}`);
  return lines.join('\n');
}

/**
 * Generate a 384-dimensional embedding vector for the given text.
 * Uses Xenova/all-MiniLM-L6-v2 (runs locally, no API key required).
 * The model (~22MB) is downloaded and cached on first use.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!pipeline) {
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await pipeline(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
```

### A2. `package.json` — add dependency

```bash
npm install @xenova/transformers@^2.17.0
```

### A3. `src/db.ts` — vector index + embedding storage

**In `ensureSchema()`, add after existing constraints (line ~43):**

```typescript
  await d.executeQuery(
    `CREATE VECTOR INDEX component_embedding IF NOT EXISTS
     FOR (c:Component) ON (c.embedding)
     OPTIONS {indexConfig: {
       \`vector.dimensions\`: 384,
       \`vector.similarity_function\`: 'cosine'
     }}`,
    {},
    { database }
  );
```

**In `ingestComponents()`, add `c.embedding = comp.embedding` to the SET clause (line ~66):**

Change:
```typescript
         c.hooks = comp.hooks`,
```
To:
```typescript
         c.hooks = comp.hooks,
         c.embedding = comp.embedding`,
```

**And in the mapping function (line ~68), add the embedding field:**

Change:
```typescript
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
```
To:
```typescript
      components: components.map(c => ({
        filePath: c.filePath,
        name: c.name,
        layer: c.layer,
        exportType: c.exportType,
        hasState: c.hasState,
        props: JSON.stringify(c.props),
        description: c.description,
        hooks: JSON.stringify(c.hooks),
        embedding: c.embedding ?? null,
      })),
```

### A4. `docker-compose.yml` — update Neo4j image

Change:
```yaml
    image: neo4j:5-community
```
To:
```yaml
    image: neo4j:5.15-community
```

Vector indexes require Neo4j 5.11+. The `5-community` tag _may_ already resolve to ≥5.15, but pinning avoids surprises.

### A5. `src/types.ts` — add embedding field

Add to `ParsedComponent` interface (after `hooks: string[];`):

```typescript
  embedding?: number[];
```

### A6. `src/core/index-service.ts` — embed during indexing

**Add import at top:**
```typescript
import { buildEmbeddingText, generateEmbedding } from './embedding.js';
```

**After `const parseResult = parseCodebase(graphConfig);` (line ~52), add embedding generation:**

```typescript
  // 1b. Generate embeddings for each component
  for (const comp of parseResult.components) {
    const text = buildEmbeddingText(comp);
    comp.embedding = await generateEmbedding(text);
  }
```

### A7. `src/index.ts` — new `semantic_search_components` MCP tool

**Add import at top (next to existing db import):**
```typescript
import { generateEmbedding } from './core/embedding.js';
```

**Add to TOOLS array (before `execute_cypher`):**

```typescript
  {
    name: 'semantic_search_components',
    description: 'Find components by natural language description using semantic similarity. Use this when you want to search by intent or concept rather than exact names.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Natural language description of what you are looking for' },
        limit: { type: 'number', description: 'Max results to return (default 10)' },
      },
      required: ['query'],
    },
  },
```

**Add handler function:**

```typescript
async function handleSemanticSearchComponents(args: { query: string; limit?: number }) {
  const start = Date.now();
  const db = config.neo4j.database;
  const limit = args.limit ?? 10;

  // Generate embedding for the query text
  const embedding = await generateEmbedding(args.query);

  try {
    const rows = await query(`
      CALL db.index.vector.queryNodes('component_embedding', $limit, $embedding)
      YIELD node, score
      RETURN node.name AS name, node.filePath AS filePath, node.layer AS layer,
             node.description AS description, node.props AS props, node.hooks AS hooks,
             score
      ORDER BY score DESC
    `, { limit: neo4j.int(limit), embedding }, db);

    const results = rows.map(row => ({
      ...row,
      props: safeJsonParse<PropInfo[]>(row.props, []),
      hooks: safeJsonParse<string[]>(row.hooks, []),
    }));

    return success(results, Date.now() - start);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('component_embedding') || msg.includes('vector index')) {
      return error(
        'Vector index not available. Run reindex_codebase first to generate embeddings.',
        'The component_embedding vector index may not exist yet. Reindex to create it.'
      );
    }
    return error(`Semantic search failed: ${msg}`);
  }
}
```

> **Note**: Need to add `import neo4j from 'neo4j-driver';` or use the already-imported query function. The `query()` helper already wraps `d.executeQuery` with READ routing, but `db.index.vector.queryNodes` requires a CALL which the `execute_cypher` handler blocks. We need to use the driver directly. Actually, looking at the code — the `query()` function uses `routing: neo4j.routing.READ` which should work for vector queries. But we need `neo4j.int()` for the limit parameter. Add this import:

```typescript
import neo4j from 'neo4j-driver';
```

At the top of `src/index.ts` (or use the existing driver import from db.ts — check if neo4j is re-exported). Actually the simplest approach: just pass the limit as a plain number since the `query()` helper converts results. Test whether Neo4j accepts plain number for vector query limit. If not, we need to import `neo4j` for `neo4j.int()`.

**Simpler approach — avoid neo4j import by passing limit as integer in Cypher:**

```typescript
async function handleSemanticSearchComponents(args: { query: string; limit?: number }) {
  const start = Date.now();
  const db = config.neo4j.database;
  const limit = args.limit ?? 10;

  const embedding = await generateEmbedding(args.query);

  try {
    const rows = await query(`
      CALL db.index.vector.queryNodes('component_embedding', toInteger($limit), $embedding)
      YIELD node, score
      RETURN node.name AS name, node.filePath AS filePath, node.layer AS layer,
             node.description AS description, node.props AS props, node.hooks AS hooks,
             score
      ORDER BY score DESC
    `, { limit, embedding }, db);

    const results = rows.map(row => ({
      ...row,
      props: safeJsonParse<PropInfo[]>(row.props, []),
      hooks: safeJsonParse<string[]>(row.hooks, []),
    }));

    return success(results, Date.now() - start);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('component_embedding') || msg.includes('vector index')) {
      return error(
        'Vector index not available. Run reindex_codebase first to generate embeddings.',
        'The component_embedding vector index may not exist yet. Reindex to create it.'
      );
    }
    return error(`Semantic search failed: ${msg}`);
  }
}
```

**Add case to switch statement (line ~780):**

```typescript
      case 'semantic_search_components':
        return handleSemanticSearchComponents(args as { query: string; limit?: number });
```

### A8. Enhance `find_similar_components` — add embedding score

In `handleFindSimilarComponents`, after the existing scoring logic, add embedding similarity as a bonus signal:

**After the `const scored = rows.map(row => { ... })` block (around line ~487), insert:**

```typescript
  // Boost scores with embedding similarity if available
  if (args.query) {
    try {
      const queryEmbedding = await generateEmbedding(args.query);
      const embeddingRows = await query(`
        CALL db.index.vector.queryNodes('component_embedding', 50, $embedding)
        YIELD node, score
        RETURN node.filePath AS filePath, score
      `, { embedding: queryEmbedding }, db);

      const embeddingScores = new Map<string, number>();
      for (const row of embeddingRows) {
        embeddingScores.set(row.filePath as string, row.score as number);
      }

      for (const item of scored) {
        const embScore = embeddingScores.get(item.filePath as string);
        if (embScore !== undefined && embScore > 0.3) {
          item.score += Math.round(embScore * 3); // up to +3 bonus
          item.reasons.push(`semantic similarity: ${(embScore * 100).toFixed(0)}%`);
        }
      }
    } catch {
      // Vector index may not exist yet — fall back to current behavior
    }
  }
```

**Note**: The `scored` array items need the `score` and `reasons` fields to be mutable. They already are since we're using `map()` to create new objects.

Also need to re-sort after adding embedding scores:

```typescript
  const ranked = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
```

This line already exists, so just make sure the embedding boost happens _before_ the filter+sort.

---

## Phase B: Props & Hooks as First-Class Graph Nodes

### B1. `src/db.ts` — new schema, ingest functions

**Add to `ensureSchema()` (after existing constraints):**

```typescript
  await d.executeQuery(
    'CREATE CONSTRAINT hook_name IF NOT EXISTS FOR (h:Hook) REQUIRE h.name IS UNIQUE',
    {},
    { database }
  );
```

(No unique constraint on Prop since multiple components can have props with the same name — Prop nodes are per-component.)

**Add to `clearGraph()` — update the WHERE clause:**

Change:
```typescript
  await d.executeQuery('MATCH (n) WHERE n:Component OR n:Module OR n:Layer DETACH DELETE n', {}, { database });
```
To:
```typescript
  await d.executeQuery('MATCH (n) WHERE n:Component OR n:Module OR n:Layer OR n:Prop OR n:Hook DETACH DELETE n', {}, { database });
```

**Add new export functions:**

```typescript
export async function ingestProps(
  components: ParsedComponent[],
  database?: string
): Promise<void> {
  const d = getDriver();

  // Build flat list of props with their parent component's filePath
  const props = components.flatMap(c =>
    c.props.map(p => ({
      componentFilePath: c.filePath,
      name: p.name,
      type: p.type,
      required: p.required,
      defaultValue: p.defaultValue ?? null,
    }))
  );

  if (props.length === 0) return;

  await d.executeQuery(
    `UNWIND $props AS p
     MATCH (c:Component {filePath: p.componentFilePath})
     CREATE (prop:Prop {
       name: p.name,
       type: p.type,
       required: p.required,
       defaultValue: p.defaultValue,
       componentFilePath: p.componentFilePath
     })
     CREATE (c)-[:HAS_PROP]->(prop)`,
    { props },
    { database }
  );
}

export async function ingestHooks(
  components: ParsedComponent[],
  database?: string
): Promise<void> {
  const d = getDriver();

  // Collect unique hook names
  const allHooks = [...new Set(components.flatMap(c => c.hooks))];
  if (allHooks.length === 0) return;

  // 1. MERGE shared Hook nodes
  await d.executeQuery(
    `UNWIND $hooks AS hookName
     MERGE (h:Hook {name: hookName})`,
    { hooks: allHooks },
    { database }
  );

  // 2. Create USES_HOOK edges
  const edges = components.flatMap(c =>
    c.hooks.map(h => ({ filePath: c.filePath, hookName: h }))
  );

  if (edges.length === 0) return;

  await d.executeQuery(
    `UNWIND $edges AS e
     MATCH (c:Component {filePath: e.filePath})
     MATCH (h:Hook {name: e.hookName})
     MERGE (c)-[:USES_HOOK]->(h)`,
    { edges },
    { database }
  );
}
```

### B2. `src/core/index-service.ts` — call new ingest functions

**Add imports:**

Change:
```typescript
import {
  clearGraph,
  ingestComponents,
  ingestDependencies,
  ingestModules,
  ingestLayers,
} from '../db.js';
```
To:
```typescript
import {
  clearGraph,
  ingestComponents,
  ingestDependencies,
  ingestModules,
  ingestLayers,
  ingestProps,
  ingestHooks,
} from '../db.js';
```

**After `await ingestLayers(...)` (line ~61), add:**

```typescript
  await ingestProps(parseResult.components, database);
  await ingestHooks(parseResult.components, database);
```

### B3. `src/index.ts` — Cypher-native queries for search_components

**Replace the `handleSearchComponents` function** to use Cypher-native hook/prop filtering:

```typescript
async function handleSearchComponents(args: {
  namePattern?: string; layer?: string; hasState?: boolean;
  hooks?: string[]; propNames?: string[]; exportType?: string;
}) {
  const start = Date.now();
  const db = config.neo4j.database;

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  const matchClauses: string[] = ['MATCH (c:Component)'];

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

  // Try Cypher-native hook/prop filtering first, fall back to JS post-filter
  let cypher: string;
  const useNativeHookFilter = args.hooks && args.hooks.length > 0;
  const useNativePropFilter = args.propNames && args.propNames.length > 0;

  if (useNativeHookFilter || useNativePropFilter) {
    // Build a query that joins through Hook/Prop nodes
    let withClauses: string[] = [];

    cypher = `MATCH (c:Component)\n${where}`;

    if (useNativeHookFilter) {
      params.hooks = args.hooks;
      params.hookCount = args.hooks!.length;
      cypher += `\nWITH c
MATCH (c)-[:USES_HOOK]->(h:Hook) WHERE h.name IN $hooks
WITH c, count(DISTINCT h) AS hookMatched WHERE hookMatched = $hookCount`;
    }

    if (useNativePropFilter) {
      params.propNames = args.propNames;
      params.propCount = args.propNames!.length;
      cypher += `\nWITH c
MATCH (c)-[:HAS_PROP]->(p:Prop) WHERE p.name IN $propNames
WITH c, count(DISTINCT p) AS propMatched WHERE propMatched = $propCount`;
    }

    cypher += `\nRETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
           c.exportType AS exportType, c.hasState AS hasState,
           c.props AS props, c.description AS description, c.hooks AS hooks
    ORDER BY c.name`;
  } else {
    cypher = `MATCH (c:Component)
    ${where}
    RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
           c.exportType AS exportType, c.hasState AS hasState,
           c.props AS props, c.description AS description, c.hooks AS hooks
    ORDER BY c.name`;
  }

  try {
    const rows = await query(cypher, params, db);
    const results = rows.map(row => ({
      ...row,
      props: safeJsonParse<PropInfo[]>(row.props, []),
      hooks: safeJsonParse<string[]>(row.hooks, []),
    }));
    return success(results, Date.now() - start);
  } catch {
    // Fall back to JS post-filtering if Hook/Prop nodes don't exist yet
    const fallbackRows = await query(`
      MATCH (c:Component)
      ${where}
      RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
             c.exportType AS exportType, c.hasState AS hasState,
             c.props AS props, c.description AS description, c.hooks AS hooks
      ORDER BY c.name
    `, params, db);

    let results = fallbackRows.map(row => ({
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
}
```

**Update `execute_cypher` tool description** to document new node/edge types:

Change:
```typescript
    description: 'Execute a read-only Cypher query against the component graph. Nodes: Component (filePath, name, layer, exportType, hasState, props, description, hooks), Module (path, name), Layer (name). Edges: DEPENDS_ON (importType), CONTAINS (Module→Module, Module→Component), BELONGS_TO_LAYER (Component→Layer).',
```
To:
```typescript
    description: 'Execute a read-only Cypher query against the component graph. Nodes: Component (filePath, name, layer, exportType, hasState, props, description, hooks, embedding), Module (path, name), Layer (name), Prop (name, type, required, defaultValue, componentFilePath), Hook (name). Edges: DEPENDS_ON (importType), CONTAINS (Module→Module, Module→Component), BELONGS_TO_LAYER (Component→Layer), HAS_PROP (Component→Prop), USES_HOOK (Component→Hook).',
```

---

## Tests

### New file: `test/embedding.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbeddingText } from '../src/core/embedding.js';
import type { ParsedComponent } from '../src/types.js';

describe('embedding', () => {
  describe('buildEmbeddingText', () => {
    it('produces expected text format for a full component', () => {
      const comp: ParsedComponent = {
        name: 'Button',
        filePath: 'src/atoms/Button.tsx',
        layer: 'atom',
        exportType: 'default',
        hasState: true,
        description: 'Primary action button with loading state',
        props: [
          { name: 'label', type: 'string', required: true },
          { name: 'onClick', type: '() => void', required: true },
          { name: 'disabled', type: 'boolean', required: false },
        ],
        hooks: ['useState'],
      };

      const text = buildEmbeddingText(comp);

      assert.ok(text.includes('Component: Button'));
      assert.ok(text.includes('Description: Primary action button with loading state'));
      assert.ok(text.includes('Layer: atom'));
      assert.ok(text.includes('Props: label: string, onClick: () => void, disabled: boolean'));
      assert.ok(text.includes('Hooks: useState'));
      assert.ok(text.includes('Has state: true'));
    });

    it('handles component with no props or hooks', () => {
      const comp: ParsedComponent = {
        name: 'Divider',
        filePath: 'src/atoms/Divider.tsx',
        layer: 'atom',
        exportType: 'named',
        hasState: false,
        description: '',
        props: [],
        hooks: [],
      };

      const text = buildEmbeddingText(comp);

      assert.ok(text.includes('Component: Divider'));
      assert.ok(!text.includes('Description:'));
      assert.ok(!text.includes('Props:'));
      assert.ok(!text.includes('Hooks:'));
      assert.ok(text.includes('Has state: false'));
    });

    it('omits description line when description is empty', () => {
      const comp: ParsedComponent = {
        name: 'Spacer',
        filePath: 'src/atoms/Spacer.tsx',
        layer: 'atom',
        exportType: 'named',
        hasState: false,
        description: '',
        props: [],
        hooks: [],
      };

      const lines = buildEmbeddingText(comp).split('\n');
      assert.ok(!lines.some(l => l.startsWith('Description:')));
    });
  });

  // NOTE: generateEmbedding test requires downloading the model (~22MB).
  // Uncomment for integration testing:
  //
  // describe('generateEmbedding', () => {
  //   it('returns 384-dimensional vector', async () => {
  //     const { generateEmbedding } = await import('../src/core/embedding.js');
  //     const vec = await generateEmbedding('test button component');
  //     assert.equal(vec.length, 384);
  //     assert.ok(vec.every(n => typeof n === 'number'));
  //   });
  // });
});
```

### Existing tests

All existing tests should pass unchanged since:
- `embedding` is optional on `ParsedComponent`
- `ingestProps`/`ingestHooks` are additive (called after existing ingest)
- `search_components` falls back to JS post-filtering if Prop/Hook nodes don't exist

---

## Implementation Order (copy-paste checklist)

```
[ ] A2. npm install @xenova/transformers@^2.17.0
[ ] A1. Create src/core/embedding.ts
[ ] A4. docker-compose.yml — pin neo4j:5.15-community
[ ] A5. src/types.ts — add embedding? field to ParsedComponent
[ ] A3. src/db.ts — vector index in ensureSchema + embedding in ingestComponents
[ ] B1. src/db.ts — Hook constraint, Prop/Hook in clearGraph, ingestProps(), ingestHooks()
[ ] A6. src/core/index-service.ts — import embedding, generate during indexing
[ ] B2. src/core/index-service.ts — import + call ingestProps/ingestHooks
[ ] A7. src/index.ts — semantic_search_components tool + handler
[ ] A8. src/index.ts — enhance find_similar_components with embedding boost
[ ] B3. src/index.ts — Cypher-native search_components + update execute_cypher description
[ ] T1. Create test/embedding.test.ts
[ ] V1. npm run build && npm test
[ ] V2. rkg index ./test/fixture/src --stats (manual verification)
```

## Gotchas & Notes

1. **`@xenova/transformers` first run**: Downloads ~22MB model on first use. Cached in `~/.cache/huggingface/` afterward. No API key needed.

2. **`CALL` in execute_cypher guard**: The regex guard blocks `CALL` which is needed for `db.index.vector.queryNodes`. The `semantic_search_components` handler uses `query()` directly so it bypasses the guard. Don't change the guard — it's intentional that users can't call arbitrary procedures.

3. **Neo4j integer type**: `db.index.vector.queryNodes` expects an integer for the limit parameter. Using `toInteger($limit)` in Cypher avoids needing to import `neo4j` in `index.ts`.

4. **Backward compatibility**: JSON string properties (`props`, `hooks`) on Component nodes are kept alongside the new Prop/Hook nodes. Both representations co-exist.

5. **Prop nodes are NOT unique**: Each component gets its own Prop nodes (unlike Hook which is shared/MERGED). This is because props have component-specific attributes (type, required, defaultValue).

6. **Error handling for vector index**: Both `semantic_search_components` and the embedding boost in `find_similar_components` catch errors gracefully when the vector index doesn't exist yet (pre-reindex state).
