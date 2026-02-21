/**
 * Demo: Complex graph traversals using Module, Layer, CONTAINS, and BELONGS_TO_LAYER.
 * Shows real-world queries a frontend dev would ask.
 */
import { loadConfig, toGraphConfig } from '../src/config.js';
import { parseCodebase } from '../src/parser.js';
import { initDatabase, clearGraph, ingestComponents, ingestDependencies, ingestModules, ingestLayers, query, closeDatabase } from '../src/db.js';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const config = toGraphConfig(loadConfig(resolve(PROJECT_ROOT, 'test', 'fixture-config.json')));

// Parse and ingest
const parseResult = parseCodebase(config);
await initDatabase(config.neo4j);
await clearGraph(config.neo4j.database);
await ingestComponents(parseResult.components, config.neo4j.database);
await ingestDependencies(parseResult.dependencies, config.neo4j.database);
await ingestModules(parseResult.modules, parseResult.components, config.neo4j.database);
await ingestLayers(parseResult.layers, parseResult.components, config.neo4j.database);

const db = config.neo4j.database;
const hr = () => console.log('\n' + '─'.repeat(70));

// ─────────────────────────────────────────────────────────────────────
// 1. Full directory tree — Module hierarchy via CONTAINS
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('📁 DIRECTORY TREE (Module → Module CONTAINS)');
hr();
const tree = await query(`
  MATCH path = (root:Module)-[:CONTAINS*0..]->(m:Module)
  WHERE NOT ()-[:CONTAINS]->(root)
  WITH root, m, length(path) AS depth
  OPTIONAL MATCH (m)-[:CONTAINS]->(c:Component)
  WITH m, depth, collect(c.name) AS components
  RETURN m.path AS dir, depth, size(components) AS fileCount, components
  ORDER BY m.path
`, {}, db);
for (const row of tree) {
  const indent = '  '.repeat(row.depth as number);
  const files = (row.components as string[]).length > 0
    ? ` → [${(row.components as string[]).join(', ')}]`
    : '';
  console.log(`${indent}${row.dir}/ (${row.fileCount} files)${files}`);
}

// ─────────────────────────────────────────────────────────────────────
// 2. Which components appear on the MOST pages?
//    (reusable atoms that show up everywhere)
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('🔥 MOST REUSED COMPONENTS (appear on N pages)');
hr();
const reuse = await query(`
  MATCH (page:Component)-[:DEPENDS_ON*1..]->(comp:Component)
  WHERE page.layer = 'page'
  WITH comp, collect(DISTINCT page.name) AS pages
  RETURN comp.name AS component, comp.layer AS layer,
         size(pages) AS pageCount, pages
  ORDER BY pageCount DESC, comp.name
`, {}, db);
for (const row of reuse) {
  console.log(`  ${row.component} (${row.layer}) → ${row.pageCount} pages: ${(row.pages as string[]).join(', ')}`);
}

// ─────────────────────────────────────────────────────────────────────
// 3. Cross-layer dependency matrix
//    How many edges flow from layer A → layer B?
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('🔀 CROSS-LAYER DEPENDENCY MATRIX');
hr();
const matrix = await query(`
  MATCH (src:Component)-[:DEPENDS_ON]->(tgt:Component)
  MATCH (src)-[:BELONGS_TO_LAYER]->(srcL:Layer)
  MATCH (tgt)-[:BELONGS_TO_LAYER]->(tgtL:Layer)
  RETURN srcL.name AS from, tgtL.name AS to, count(*) AS edges
  ORDER BY edges DESC
`, {}, db);

// Build a nice matrix display
const allLayers = [...new Set([...matrix.map(r => r.from as string), ...matrix.map(r => r.to as string)])];
const layerOrder = ['page', 'template', 'organism', 'molecule', 'atom', 'unknown'];
allLayers.sort((a, b) => layerOrder.indexOf(a) - layerOrder.indexOf(b));

const matrixMap = new Map<string, number>();
for (const row of matrix) matrixMap.set(`${row.from}→${row.to}`, row.edges as number);

const colWidth = 10;
console.log('  ' + 'FROM↓ TO→'.padEnd(colWidth) + allLayers.map(l => l.padStart(colWidth)).join(''));
for (const from of allLayers) {
  const cells = allLayers.map(to => {
    const count = matrixMap.get(`${from}→${to}`) ?? 0;
    return (count > 0 ? String(count) : '·').padStart(colWidth);
  }).join('');
  console.log('  ' + from.padEnd(colWidth) + cells);
}

// ─────────────────────────────────────────────────────────────────────
// 4. Layer violation detection
//    In atomic design: page→template→organism→molecule→atom
//    Flag any "upward" dependency (e.g., atom depending on molecule)
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('⚠️  LAYER VIOLATIONS (lower layer depends on higher layer)');
hr();
const LAYER_RANK: Record<string, number> = { atom: 0, molecule: 1, organism: 2, template: 3, page: 4, unknown: -1 };
const violations = await query(`
  MATCH (src:Component)-[:DEPENDS_ON]->(tgt:Component)
  MATCH (src)-[:BELONGS_TO_LAYER]->(srcL:Layer)
  MATCH (tgt)-[:BELONGS_TO_LAYER]->(tgtL:Layer)
  WHERE srcL.name <> tgtL.name
  RETURN src.name AS source, srcL.name AS srcLayer,
         tgt.name AS target, tgtL.name AS tgtLayer
`, {}, db);

let violationCount = 0;
for (const row of violations) {
  const srcRank = LAYER_RANK[row.srcLayer as string] ?? -1;
  const tgtRank = LAYER_RANK[row.tgtLayer as string] ?? -1;
  if (srcRank < tgtRank) {
    console.log(`  ❌ ${row.source} (${row.srcLayer}) → ${row.target} (${row.tgtLayer})`);
    violationCount++;
  }
}
if (violationCount === 0) console.log('  ✅ No violations found!');
else console.log(`  Found ${violationCount} violation(s)`);

// ─────────────────────────────────────────────────────────────────────
// 5. Per-page breakdown: what does each page pull in?
//    Groups by layer to show the full dependency tree per page.
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('📄 PER-PAGE DEPENDENCY BREAKDOWN');
hr();
const pages = await query(`
  MATCH (page:Component)
  WHERE page.layer = 'page'
  RETURN page.name AS name ORDER BY page.name
`, {}, db);

for (const page of pages) {
  const deps = await query(`
    MATCH (page:Component {name: $name})-[:DEPENDS_ON*1..]->(dep:Component)
    MATCH (dep)-[:BELONGS_TO_LAYER]->(l:Layer)
    RETURN dep.name AS component, l.name AS layer
    ORDER BY l.name, dep.name
  `, { name: page.name }, db);

  const grouped: Record<string, string[]> = {};
  for (const d of deps) {
    const layer = d.layer as string;
    if (!grouped[layer]) grouped[layer] = [];
    grouped[layer].push(d.component as string);
  }

  console.log(`\n  ${page.name}`);
  for (const layer of layerOrder) {
    if (grouped[layer]) {
      console.log(`    ${layer}: ${grouped[layer].join(', ')}`);
    }
  }
  console.log(`    total: ${deps.length} transitive dependencies`);
}

// ─────────────────────────────────────────────────────────────────────
// 6. Deepest dependency chains
//    Longest path from a page down to a leaf component.
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('🔗 LONGEST DEPENDENCY CHAINS (page → ... → leaf)');
hr();
const chains = await query(`
  MATCH path = (page:Component)-[:DEPENDS_ON*1..]->(leaf:Component)
  WHERE page.layer = 'page'
    AND NOT (leaf)-[:DEPENDS_ON]->()
  WITH page, leaf, [n IN nodes(path) | n.name] AS chain, length(path) AS depth
  RETURN chain, depth
  ORDER BY depth DESC
  LIMIT 5
`, {}, db);
for (const row of chains) {
  console.log(`  depth ${row.depth}: ${(row.chain as string[]).join(' → ')}`);
}

// ─────────────────────────────────────────────────────────────────────
// 7. Module-level dependency analysis
//    Which folders depend on which other folders?
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('📦 MODULE-LEVEL DEPENDENCIES (folder → folder)');
hr();
const moduleDeps = await query(`
  MATCH (srcMod:Module)-[:CONTAINS]->(src:Component)-[:DEPENDS_ON]->(tgt:Component)<-[:CONTAINS]-(tgtMod:Module)
  WHERE srcMod <> tgtMod
  WITH srcMod.path AS fromModule, tgtMod.path AS toModule, count(*) AS edges
  RETURN fromModule, toModule, edges
  ORDER BY edges DESC
`, {}, db);
for (const row of moduleDeps) {
  console.log(`  ${row.fromModule} → ${row.toModule} (${row.edges} edges)`);
}

// ─────────────────────────────────────────────────────────────────────
// 8. Shared components between pages
//    Which components are shared by exactly 2 pages?
// ─────────────────────────────────────────────────────────────────────
hr();
console.log('🤝 SHARED COMPONENTS BETWEEN PAGE PAIRS');
hr();
const shared = await query(`
  MATCH (p1:Component)-[:DEPENDS_ON*1..]->(shared:Component)<-[:DEPENDS_ON*1..]-(p2:Component)
  WHERE p1.layer = 'page' AND p2.layer = 'page' AND p1.name < p2.name
  WITH p1.name AS page1, p2.name AS page2, collect(DISTINCT shared.name) AS sharedComponents
  RETURN page1, page2, sharedComponents, size(sharedComponents) AS count
  ORDER BY count DESC
`, {}, db);
for (const row of shared) {
  console.log(`  ${row.page1} ∩ ${row.page2}: ${row.count} shared → [${(row.sharedComponents as string[]).join(', ')}]`);
}

hr();
console.log('\n✅ Demo complete.');
await closeDatabase();
