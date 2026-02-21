/**
 * Real-world stress test: ~93 files simulating a Vietnamese family/storefront app.
 * Shows how the graph handles cross-feature chaos, deep nesting, and real complexity.
 */
import { loadConfig } from '../src/config.js';
import { parseCodebase } from '../src/parser.js';
import { initDatabase, clearGraph, ingestComponents, ingestDependencies, ingestModules, ingestLayers, query, closeDatabase } from '../src/db.js';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const config = loadConfig(resolve(PROJECT_ROOT, 'test', 'fixture-realworld-config.json'));

// Parse and ingest
console.log('Parsing codebase...');
const parseResult = parseCodebase(config);
console.log(`Parsed: ${parseResult.components.length} components, ${parseResult.dependencies.length} deps, ${parseResult.modules.length} modules, ${parseResult.layers.length} layers\n`);

await initDatabase(config.neo4j);
await clearGraph(config.neo4j.database);
await ingestComponents(parseResult.components, config.neo4j.database);
await ingestDependencies(parseResult.dependencies, config.neo4j.database);
await ingestModules(parseResult.modules, parseResult.components, config.neo4j.database);
await ingestLayers(parseResult.layers, parseResult.components, config.neo4j.database);

const db = config.neo4j.database;
const hr = (label: string) => console.log(`\n${'─'.repeat(70)}\n${label}\n${'─'.repeat(70)}`);

// ═══════════════════════════════════════════════════════════════════
// 1. OVERVIEW
// ═══════════════════════════════════════════════════════════════════
hr('1. GRAPH OVERVIEW');

const [totalComp, totalEdge, totalMod, totalLayer] = await Promise.all([
  query('MATCH (c:Component) RETURN count(c) AS n', {}, db),
  query('MATCH ()-[r:DEPENDS_ON]->() RETURN count(r) AS n', {}, db),
  query('MATCH (m:Module) RETURN count(m) AS n', {}, db),
  query('MATCH (l:Layer) RETURN count(l) AS n', {}, db),
]);
console.log(`Components: ${totalComp[0].n}`);
console.log(`DEPENDS_ON edges: ${totalEdge[0].n}`);
console.log(`Modules (dirs): ${totalMod[0].n}`);
console.log(`Layers: ${totalLayer[0].n}`);

// ═══════════════════════════════════════════════════════════════════
// 2. FULL DIRECTORY TREE
// ═══════════════════════════════════════════════════════════════════
hr('2. DIRECTORY TREE');

const tree = await query(`
  MATCH path = (root:Module)-[:CONTAINS*0..]->(m:Module)
  WHERE NOT ()-[:CONTAINS]->(root)
  WITH root, m, length(path) AS depth
  OPTIONAL MATCH (m)-[:CONTAINS]->(c:Component)
  WITH m, depth, count(c) AS fileCount
  RETURN m.path AS dir, depth, fileCount
  ORDER BY m.path
`, {}, db);
for (const row of tree) {
  const indent = '  '.repeat(row.depth as number);
  console.log(`${indent}${row.dir}/ (${row.fileCount} components)`);
}

// ═══════════════════════════════════════════════════════════════════
// 3. LAYER DISTRIBUTION
// ═══════════════════════════════════════════════════════════════════
hr('3. LAYER DISTRIBUTION');

const layerDist = await query(`
  MATCH (l:Layer)<-[:BELONGS_TO_LAYER]-(c:Component)
  RETURN l.name AS layer, count(c) AS count
  ORDER BY count DESC
`, {}, db);
for (const row of layerDist) {
  const bar = '█'.repeat(Math.ceil((row.count as number) / 2));
  console.log(`  ${(row.layer as string).padEnd(12)} ${String(row.count).padStart(3)} ${bar}`);
}

// ═══════════════════════════════════════════════════════════════════
// 4. CROSS-LAYER DEPENDENCY MATRIX
// ═══════════════════════════════════════════════════════════════════
hr('4. CROSS-LAYER DEPENDENCY MATRIX');

const matrix = await query(`
  MATCH (src:Component)-[:DEPENDS_ON]->(tgt:Component)
  MATCH (src)-[:BELONGS_TO_LAYER]->(srcL:Layer)
  MATCH (tgt)-[:BELONGS_TO_LAYER]->(tgtL:Layer)
  RETURN srcL.name AS from, tgtL.name AS to, count(*) AS edges
  ORDER BY edges DESC
`, {}, db);

const layerOrder = ['page', 'template', 'organism', 'molecule', 'atom', 'unknown'];
const usedLayers = [...new Set([...matrix.map(r => r.from as string), ...matrix.map(r => r.to as string)])];
usedLayers.sort((a, b) => layerOrder.indexOf(a) - layerOrder.indexOf(b));

const matrixMap = new Map<string, number>();
for (const row of matrix) matrixMap.set(`${row.from}→${row.to}`, row.edges as number);

const cw = 10;
console.log('  ' + 'FROM↓ TO→'.padEnd(cw) + usedLayers.map(l => l.padStart(cw)).join(''));
for (const from of usedLayers) {
  const cells = usedLayers.map(to => {
    const count = matrixMap.get(`${from}→${to}`) ?? 0;
    return (count > 0 ? String(count) : '·').padStart(cw);
  }).join('');
  console.log('  ' + from.padEnd(cw) + cells);
}

// ═══════════════════════════════════════════════════════════════════
// 5. LAYER VIOLATIONS
// ═══════════════════════════════════════════════════════════════════
hr('5. LAYER VIOLATIONS (lower layer depends on higher)');

const LAYER_RANK: Record<string, number> = { atom: 0, molecule: 1, organism: 2, template: 3, page: 4, unknown: -1 };
const allDeps = await query(`
  MATCH (src:Component)-[:DEPENDS_ON]->(tgt:Component)
  MATCH (src)-[:BELONGS_TO_LAYER]->(srcL:Layer)
  MATCH (tgt)-[:BELONGS_TO_LAYER]->(tgtL:Layer)
  WHERE srcL.name <> tgtL.name
  RETURN src.name AS source, srcL.name AS srcLayer,
         tgt.name AS target, tgtL.name AS tgtLayer
`, {}, db);

let violationCount = 0;
for (const row of allDeps) {
  const srcRank = LAYER_RANK[row.srcLayer as string] ?? -1;
  const tgtRank = LAYER_RANK[row.tgtLayer as string] ?? -1;
  if (srcRank >= 0 && tgtRank >= 0 && srcRank < tgtRank) {
    console.log(`  ❌ ${row.source} (${row.srcLayer}) → ${row.target} (${row.tgtLayer})`);
    violationCount++;
  }
}
if (violationCount === 0) console.log('  ✅ No violations!');
else console.log(`\n  Total: ${violationCount} violation(s)`);

// ═══════════════════════════════════════════════════════════════════
// 6. MOST REUSED COMPONENTS (appear on N pages)
// ═══════════════════════════════════════════════════════════════════
hr('6. MOST REUSED COMPONENTS (across pages)');

const reuse = await query(`
  MATCH (page:Component)-[:DEPENDS_ON*1..]->(comp:Component)
  WHERE page.layer = 'page'
  WITH comp, collect(DISTINCT page.name) AS pages
  RETURN comp.name AS component, comp.layer AS layer,
         size(pages) AS pageCount, pages
  ORDER BY pageCount DESC, comp.name
  LIMIT 20
`, {}, db);
for (const row of reuse) {
  const pages = (row.pages as string[]).join(', ');
  console.log(`  ${(row.component as string).padEnd(25)} (${(row.layer as string).padEnd(10)}) → ${row.pageCount} pages [${pages}]`);
}

// ═══════════════════════════════════════════════════════════════════
// 7. PER-PAGE DEPENDENCY BREAKDOWN
// ═══════════════════════════════════════════════════════════════════
hr('7. PER-PAGE DEPENDENCY BREAKDOWN');

const pages = await query(`
  MATCH (page:Component)
  WHERE page.layer = 'page'
  RETURN page.name AS name, page.filePath AS filePath
  ORDER BY page.name
`, {}, db);

for (const page of pages) {
  const deps = await query(`
    MATCH (page:Component {filePath: $fp})-[:DEPENDS_ON*1..]->(dep:Component)
    MATCH (dep)-[:BELONGS_TO_LAYER]->(l:Layer)
    RETURN DISTINCT dep.name AS component, l.name AS layer
    ORDER BY l.name, dep.name
  `, { fp: page.filePath }, db);

  const grouped: Record<string, string[]> = {};
  for (const d of deps) {
    const layer = d.layer as string;
    if (!grouped[layer]) grouped[layer] = [];
    grouped[layer].push(d.component as string);
  }

  console.log(`\n  ${page.name} (${page.filePath})`);
  for (const layer of layerOrder) {
    if (grouped[layer]) {
      console.log(`    ${layer.padEnd(10)}: ${grouped[layer].join(', ')}`);
    }
  }
  console.log(`    TOTAL: ${deps.length} transitive deps`);
}

// ═══════════════════════════════════════════════════════════════════
// 8. LONGEST DEPENDENCY CHAINS
// ═══════════════════════════════════════════════════════════════════
hr('8. LONGEST DEPENDENCY CHAINS (page → ... → leaf)');

const chains = await query(`
  MATCH path = (page:Component)-[:DEPENDS_ON*1..]->(leaf:Component)
  WHERE page.layer = 'page'
    AND NOT (leaf)-[:DEPENDS_ON]->()
  WITH page, leaf, [n IN nodes(path) | n.name] AS chain, length(path) AS depth
  RETURN chain, depth
  ORDER BY depth DESC
  LIMIT 10
`, {}, db);
for (const row of chains) {
  console.log(`  depth ${row.depth}: ${(row.chain as string[]).join(' → ')}`);
}

// ═══════════════════════════════════════════════════════════════════
// 9. MODULE-LEVEL DEPENDENCIES (folder→folder coupling)
// ═══════════════════════════════════════════════════════════════════
hr('9. MODULE-LEVEL DEPENDENCIES (folder coupling)');

const moduleDeps = await query(`
  MATCH (srcMod:Module)-[:CONTAINS]->(src:Component)-[:DEPENDS_ON]->(tgt:Component)<-[:CONTAINS]-(tgtMod:Module)
  WHERE srcMod <> tgtMod
  WITH srcMod.path AS fromModule, tgtMod.path AS toModule, count(*) AS edges
  RETURN fromModule, toModule, edges
  ORDER BY edges DESC
  LIMIT 20
`, {}, db);
for (const row of moduleDeps) {
  console.log(`  ${(row.fromModule as string).padEnd(40)} → ${(row.toModule as string).padEnd(30)} (${row.edges} edges)`);
}

// ═══════════════════════════════════════════════════════════════════
// 10. SHARED COMPONENTS BETWEEN PAGE PAIRS
// ═══════════════════════════════════════════════════════════════════
hr('10. SHARED COMPONENTS BETWEEN PAGE PAIRS');

const shared = await query(`
  MATCH (p1:Component)-[:DEPENDS_ON*1..]->(shared:Component)<-[:DEPENDS_ON*1..]-(p2:Component)
  WHERE p1.layer = 'page' AND p2.layer = 'page' AND p1.name < p2.name
  WITH p1.name AS page1, p2.name AS page2, collect(DISTINCT shared.name) AS sharedComponents
  RETURN page1, page2, size(sharedComponents) AS count, sharedComponents
  ORDER BY count DESC
  LIMIT 15
`, {}, db);
for (const row of shared) {
  const comps = (row.sharedComponents as string[]).slice(0, 8);
  const more = (row.sharedComponents as string[]).length > 8 ? ` +${(row.sharedComponents as string[]).length - 8} more` : '';
  console.log(`  ${row.page1} ∩ ${row.page2}: ${row.count} shared [${comps.join(', ')}${more}]`);
}

// ═══════════════════════════════════════════════════════════════════
// 11. HIGH-RISK COMPONENTS (blast radius)
// ═══════════════════════════════════════════════════════════════════
hr('11. HIGH-RISK COMPONENTS (change blast radius)');

const risk = await query(`
  MATCH (comp:Component)
  OPTIONAL MATCH (direct:Component)-[:DEPENDS_ON]->(comp)
  WITH comp, count(DISTINCT direct) AS directDeps
  OPTIONAL MATCH (trans:Component)-[:DEPENDS_ON*1..]->(comp)
  WITH comp, directDeps, count(DISTINCT trans) AS transitiveDeps
  OPTIONAL MATCH (page:Component)-[:DEPENDS_ON*1..]->(comp)
  WHERE page.layer = 'page'
  WITH comp, directDeps, transitiveDeps, count(DISTINCT page) AS pageCount
  WHERE transitiveDeps > 0
  RETURN comp.name AS name, comp.layer AS layer,
         directDeps, transitiveDeps, pageCount,
         CASE
           WHEN transitiveDeps >= 10 OR pageCount >= 5 THEN 'HIGH'
           WHEN transitiveDeps >= 4 OR pageCount >= 2 THEN 'MEDIUM'
           ELSE 'LOW'
         END AS risk
  ORDER BY transitiveDeps DESC
  LIMIT 20
`, {}, db);
for (const row of risk) {
  const riskIcon = row.risk === 'HIGH' ? '🔴' : row.risk === 'MEDIUM' ? '🟡' : '🟢';
  console.log(`  ${riskIcon} ${(row.name as string).padEnd(25)} (${(row.layer as string).padEnd(10)}) direct=${String(row.directDeps).padStart(2)} transitive=${String(row.transitiveDeps).padStart(3)} pages=${row.pageCount}`);
}

// ═══════════════════════════════════════════════════════════════════
// 12. FEATURE BOUNDARY CROSSING
// ═══════════════════════════════════════════════════════════════════
hr('12. CROSS-FEATURE IMPORTS (feature boundary violations)');

// Detect components importing from different feature folders
const crossFeature = await query(`
  MATCH (srcMod:Module)-[:CONTAINS]->(src:Component)-[:DEPENDS_ON]->(tgt:Component)<-[:CONTAINS]-(tgtMod:Module)
  WHERE srcMod <> tgtMod
    AND NOT tgtMod.path STARTS WITH 'components/ui'
    AND NOT tgtMod.path STARTS WITH 'components/svg'
    AND NOT tgtMod.path STARTS WITH 'components/shared'
    AND NOT tgtMod.path STARTS WITH 'components/layout'
    AND srcMod.path STARTS WITH 'components/'
    AND tgtMod.path STARTS WITH 'components/'
  RETURN src.name AS source, srcMod.path AS srcFolder,
         tgt.name AS target, tgtMod.path AS tgtFolder
  ORDER BY srcMod.path, tgtMod.path
`, {}, db);
if (crossFeature.length === 0) {
  console.log('  ✅ No unexpected cross-feature imports!');
} else {
  for (const row of crossFeature) {
    console.log(`  ⚠️  ${row.source} (${row.srcFolder}) → ${row.target} (${row.tgtFolder})`);
  }
  console.log(`\n  Total: ${crossFeature.length} cross-feature import(s)`);
}

// ═══════════════════════════════════════════════════════════════════
// 13. VAULT-PROTECTED PAGE ANALYSIS
// ═══════════════════════════════════════════════════════════════════
hr('13. VAULT-PROTECTED PAGES (which pages use VaultGate?)');

const vaultPages = await query(`
  MATCH (page:Component)-[:DEPENDS_ON*1..]->(vault:Component {name: 'VaultGate'})
  WHERE page.layer = 'page'
  RETURN page.name AS pageName, page.filePath AS filePath
  ORDER BY page.name
`, {}, db);
for (const row of vaultPages) {
  console.log(`  🔒 ${row.pageName} (${row.filePath})`);
}

hr('DONE');
console.log(`\n✅ Real-world simulation complete. ${(totalComp[0].n as number)} components, ${(totalEdge[0].n as number)} edges, ${(totalMod[0].n as number)} modules.`);

await closeDatabase();
