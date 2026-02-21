/**
 * Integration test: Spawns the MCP server and calls tools via JSON-RPC STDIO.
 * Uses the realworld fixture (281 components) already ingested in Neo4j.
 */
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { once } from 'events';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');

// ── JSON-RPC transport over STDIO ─────────────────────────────────
let server: ChildProcess = null!;
let buffer = '';
let requestId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function startServer(): Promise<void> {
  return new Promise((res, rej) => {
    server = spawn('node', [resolve(PROJECT_ROOT, 'dist/src/index.js')], {
      env: {
        ...process.env,
        REACT_GRAPH_CONFIG: resolve(PROJECT_ROOT, 'test/fixture-realworld-config.json'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    server.stderr!.on('data', (d: Buffer) => {
      const msg = d.toString();
      process.stderr.write(`  [server] ${msg}`);
      if (msg.includes('MCP server running') || msg.includes('Graph loaded') || msg.includes('Indexed')) {
        // Give it a moment to finish setup
        setTimeout(res, 500);
      }
    });

    server.stdout!.on('data', (d: Buffer) => {
      buffer += d.toString();
      // Messages are newline-delimited JSON
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) {
            const p = pending.get(msg.id)!;
            pending.delete(msg.id);
            p.resolve(msg);
          }
        } catch {}
      }
    });

    server.on('error', rej);
    setTimeout(() => res(), 5000); // fallback timeout
  });
}

function send(method: string, params: any = {}): Promise<any> {
  const id = ++requestId;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    server.stdin!.write(msg + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout for ${method}`));
      }
    }, 15000);
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const resp = await send('tools/call', { name, arguments: args });
  if (resp.error) throw new Error(`RPC error: ${JSON.stringify(resp.error)}`);
  const text = resp.result?.content?.[0]?.text;
  if (!text) return resp.result;
  return JSON.parse(text);
}

// ── Test runner ───────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

// ── Start ─────────────────────────────────────────────────────────
console.log('Starting MCP server...\n');
await startServer();

// First initialize the protocol
await send('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'test-client', version: '1.0' }
});
await send('notifications/initialized', {});

// ═══════════════════════════════════════════════════════════════════
// TEST 1: list_tools — verify new tools are registered
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 1: list_tools ──');
const toolsResp = await send('tools/list', {});
const toolNames: string[] = toolsResp.result.tools.map((t: any) => t.name);
console.log('  Tools:', toolNames.join(', '));
assert(toolNames.includes('get_module_contents'), 'get_module_contents tool registered');
assert(toolNames.includes('get_layer_summary'), 'get_layer_summary tool registered');
assert(toolNames.includes('reindex_codebase'), 'reindex_codebase tool registered');
assert(toolNames.includes('execute_cypher'), 'execute_cypher tool registered');

// ═══════════════════════════════════════════════════════════════════
// TEST 2: get_graph_summary — overview of the graph
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 2: get_graph_summary ──');
const summary = await callTool('get_graph_summary');
assert(summary.success === true, 'get_graph_summary succeeds');
const total = summary.data.totalComponents[0]?.total;
const edges = summary.data.totalEdges[0]?.total;
console.log(`  Total: ${total} components, ${edges} edges`);
assert(total >= 200, `Has ${total} components (≥200 expected)`);
assert(edges >= 500, `Has ${edges} edges (≥500 expected)`);

const layers = summary.data.layerBreakdown.map((r: any) => `${r.layer}:${r.count}`);
console.log(`  Layers: ${layers.join(', ')}`);
assert(summary.data.layerBreakdown.length >= 4, 'At least 4 layers in breakdown');

// ═══════════════════════════════════════════════════════════════════
// TEST 3: get_layer_summary — cross-layer matrix
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 3: get_layer_summary ──');
const layerSummary = await callTool('get_layer_summary');
assert(layerSummary.success === true, 'get_layer_summary succeeds');
console.log('  Layer counts:', layerSummary.data.layerCounts.map((r: any) => `${r.layer}:${r.count}`).join(', '));
console.log('  Cross-layer deps:', layerSummary.data.crossLayerDependencies.length, 'pairs');

const crossLayer = layerSummary.data.crossLayerDependencies;
const pageToAtom = crossLayer.find((r: any) => r.fromLayer === 'page' && r.toLayer === 'atom');
assert(pageToAtom && pageToAtom.count > 100, `page→atom has ${pageToAtom?.count} deps (>100)`);

// Check no violations (atom→anything higher)
const atomUp = crossLayer.find((r: any) => r.fromLayer === 'atom' && ['molecule','organism','template','page'].includes(r.toLayer));
assert(!atomUp, 'No atom→higher layer violations');

// ═══════════════════════════════════════════════════════════════════
// TEST 4: get_module_contents — browse directory tree
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 4: get_module_contents ──');

// 4a: components/ immediate children
const compModule = await callTool('get_module_contents', { path: 'components' });
assert(compModule.success === true, 'get_module_contents(components) succeeds');
const childModNames = compModule.data.childModules.map((m: any) => m.name);
console.log('  components/ children:', childModNames.join(', '));
assert(childModNames.includes('ui'), 'Has ui/ subfolder');
assert(childModNames.includes('layout'), 'Has layout/ subfolder');
assert(childModNames.includes('family'), 'Has family/ subfolder');
assert(childModNames.includes('chat'), 'Has chat/ subfolder');
assert(compModule.data.childComponents.length === 0, 'components/ has no direct component files');

// 4b: components/ui — should have all shadcn primitives
const uiModule = await callTool('get_module_contents', { path: 'components/ui' });
assert(uiModule.success === true, 'get_module_contents(components/ui) succeeds');
const uiNames = uiModule.data.childComponents.map((c: any) => c.name);
console.log(`  components/ui/ has ${uiNames.length} components: ${uiNames.slice(0, 8).join(', ')}...`);
assert(uiNames.length >= 15, `UI has ${uiNames.length} primitives (≥15)`);
assert(uiNames.includes('Button'), 'UI has Button');
assert(uiNames.includes('Card'), 'UI has Card');
assert(uiNames.includes('Dialog'), 'UI has Dialog');

// 4c: Recursive — components/ should pull everything
const compRecursive = await callTool('get_module_contents', { path: 'components', depth: 0 });
assert(compRecursive.success === true, 'Recursive get_module_contents succeeds');
console.log(`  components/ recursive: ${compRecursive.data.childModules.length} subdirs, ${compRecursive.data.childComponents.length} components`);
assert(compRecursive.data.childComponents.length >= 60, `Recursive has ${compRecursive.data.childComponents.length} components (≥60)`);

// 4d: Deep nested module
const healthModule = await callTool('get_module_contents', { path: 'components/profile/health' });
assert(healthModule.success === true, 'get_module_contents(profile/health) succeeds');
const healthComps = healthModule.data.childComponents.map((c: any) => c.name);
console.log(`  profile/health/ components: ${healthComps.join(', ')}`);
assert(healthComps.includes('MedicalRecord'), 'Health has MedicalRecord');
assert(healthComps.includes('VaccineCard'), 'Health has VaccineCard');
assert(healthComps.includes('TreatmentTimeline'), 'Health has TreatmentTimeline');

// 4e: App directory
const appModule = await callTool('get_module_contents', { path: 'app' });
const appChildDirs = appModule.data.childModules.map((m: any) => m.name);
console.log(`  app/ child dirs: ${appChildDirs.join(', ')}`);
assert(appChildDirs.includes('admin'), 'App has admin/');
assert(appChildDirs.includes('(profile)'), 'App has (profile)/');
assert(appChildDirs.includes('(storefront)'), 'App has (storefront)/');
assert(appChildDirs.includes('api'), 'App has api/');

// 4f: Module not found
const notFound = await callTool('get_module_contents', { path: 'nonexistent/path' });
assert(notFound.success === false, 'Nonexistent module returns error');

// ═══════════════════════════════════════════════════════════════════
// TEST 5: get_component_info — detailed component info
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 5: get_component_info ──');

const headerInfo = await callTool('get_component_info', { componentName: 'Header' });
assert(headerInfo.success === true, 'get_component_info(Header) succeeds');
const header = headerInfo.data[0];
console.log(`  Header: layer=${header.layer}, deps=${header.dependencyCount}, dependents=${header.dependentCount}`);
assert(header.layer === 'organism', 'Header is organism layer');
assert(header.dependencyCount >= 5, `Header has ${header.dependencyCount} deps (≥5)`);
assert(header.dependentCount >= 5, `Header has ${header.dependentCount} dependents (≥5, others inherit via layouts)`);

// ═══════════════════════════════════════════════════════════════════
// TEST 6: get_component_dependencies — what does ChatWindow need?
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 6: get_component_dependencies ──');

const chatDeps = await callTool('get_component_dependencies', { componentName: 'ChatWindow' });
assert(chatDeps.success === true, 'get_component_dependencies(ChatWindow) succeeds');
const chatDepNames = chatDeps.data.map((r: any) => r.name);
console.log(`  ChatWindow deps: ${chatDepNames.join(', ')}`);
assert(chatDepNames.includes('ChatMessage'), 'ChatWindow depends on ChatMessage');
assert(chatDepNames.includes('ChatInput'), 'ChatWindow depends on ChatInput');
assert(chatDepNames.includes('Card'), 'ChatWindow depends on Card');

// Recursive deps
const chatDepsRecursive = await callTool('get_component_dependencies', { componentName: 'ChatWindow', depth: 0 });
const chatRecNames = chatDepsRecursive.data.map((r: any) => r.name);
console.log(`  ChatWindow recursive: ${chatRecNames.join(', ')}`);
assert(chatRecNames.includes('Avatar'), 'ChatWindow transitively needs Avatar (via ChatMessage)');
assert(chatRecNames.includes('IconHeart'), 'ChatWindow transitively needs IconHeart (via ChatInput)');

// ═══════════════════════════════════════════════════════════════════
// TEST 7: get_component_dependents — who uses Button?
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 7: get_component_dependents ──');

const btnDependents = await callTool('get_component_dependents', { componentName: 'Button' });
assert(btnDependents.success === true, 'get_component_dependents(Button) succeeds');
console.log(`  Button: ${btnDependents.data.length} direct dependents`);
assert(btnDependents.data.length >= 30, `Button has ${btnDependents.data.length} direct dependents (≥30)`);

// ═══════════════════════════════════════════════════════════════════
// TEST 8: get_change_impact — blast radius of Card
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 8: get_change_impact ──');

const cardImpact = await callTool('get_change_impact', { componentName: 'Card' });
assert(cardImpact.success === true, 'get_change_impact(Card) succeeds');
const { directDependents, transitiveDependents, affectedPages, summary: riskSummary } = cardImpact.data;
console.log(`  Card blast radius: direct=${directDependents.length}, transitive=${transitiveDependents.length}, pages=${affectedPages.length}`);
console.log(`  Risk: ${riskSummary.risk} — ${riskSummary.riskReason}`);
assert(riskSummary.risk === 'high', 'Card is HIGH risk');
assert(transitiveDependents.length >= 100, `Card has ${transitiveDependents.length} transitive dependents (≥100)`);
assert(affectedPages.length >= 50, `Card affects ${affectedPages.length} pages (≥50)`);

// ═══════════════════════════════════════════════════════════════════
// TEST 9: get_layer_components — all atoms
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 9: get_layer_components ──');

const atomComps = await callTool('get_layer_components', { layerName: 'atom' });
assert(atomComps.success === true, 'get_layer_components(atom) succeeds');
const atomNames = atomComps.data.map((c: any) => c.name);
console.log(`  Atoms (${atomNames.length}): ${atomNames.join(', ')}`);
assert(atomNames.length >= 20, `${atomNames.length} atoms (≥20)`);
assert(atomNames.includes('Button'), 'Atoms include Button');
assert(atomNames.includes('IconFamily'), 'Atoms include IconFamily');

// ═══════════════════════════════════════════════════════════════════
// TEST 10: search_components — find all stateful molecules
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 10: search_components ──');

const statefulMolecules = await callTool('search_components', { layer: 'molecule', hasState: true });
assert(statefulMolecules.success === true, 'search_components(molecule, hasState) succeeds');
const smNames = statefulMolecules.data.map((c: any) => c.name);
console.log(`  Stateful molecules: ${smNames.join(', ')}`);
assert(smNames.includes('CycleTracker'), 'Stateful molecules include CycleTracker');
assert(smNames.includes('SearchFilter'), 'Stateful molecules include SearchFilter');

// ═══════════════════════════════════════════════════════════════════
// TEST 11: find_similar_components — find "Card"-like components
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 11: find_similar_components ──');

const similar = await callTool('find_similar_components', { query: 'Card', layer: 'molecule' });
assert(similar.success === true, 'find_similar_components succeeds');
const simNames = similar.data.map((c: any) => `${c.name}(score:${c.score})`);
console.log(`  "Card" + molecule matches: ${simNames.join(', ')}`);
assert(similar.data.some((c: any) => c.name === 'ProductCard'), 'Finds ProductCard');
assert(similar.data.some((c: any) => c.name === 'BlogCard'), 'Finds BlogCard');

// ═══════════════════════════════════════════════════════════════════
// TEST 12: execute_cypher — custom queries
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 12: execute_cypher ──');

// 12a: Vault-protected pages
const vaultQuery = await callTool('execute_cypher', {
  query: `
    MATCH (page:Component)-[:DEPENDS_ON*1..]->(vault:Component {name: 'VaultGate'})
    WHERE page.layer = 'page'
    RETURN DISTINCT page.name AS name ORDER BY page.name
  `
});
assert(vaultQuery.success === true, 'Vault query succeeds');
const vaultPages = vaultQuery.data.map((r: any) => r.name);
console.log(`  Vault-protected pages: ${vaultPages.join(', ')}`);
assert(vaultPages.length >= 4, `${vaultPages.length} vault-protected pages (≥4)`);

// 12b: Cross-feature imports
const crossFeatureQuery = await callTool('execute_cypher', {
  query: `
    MATCH (srcMod:Module)-[:CONTAINS]->(src:Component)-[:DEPENDS_ON]->(tgt:Component)<-[:CONTAINS]-(tgtMod:Module)
    WHERE srcMod <> tgtMod
      AND NOT tgtMod.path STARTS WITH 'components/ui'
      AND NOT tgtMod.path STARTS WITH 'components/svg'
      AND NOT tgtMod.path STARTS WITH 'components/shared'
      AND NOT tgtMod.path STARTS WITH 'components/layout'
      AND srcMod.path STARTS WITH 'components/'
      AND tgtMod.path STARTS WITH 'components/'
    RETURN src.name AS source, tgt.name AS target
  `
});
assert(crossFeatureQuery.success === true, 'Cross-feature query succeeds');
console.log(`  Cross-feature violations: ${crossFeatureQuery.data.map((r: any) => `${r.source}→${r.target}`).join(', ')}`);
assert(crossFeatureQuery.data.length >= 1, 'Detected cross-feature imports');

// 12c: Module→Module CONTAINS traversal
const moduleTreeQuery = await callTool('execute_cypher', {
  query: `
    MATCH (m:Module {path: 'app/(profile)/profile'})-[:CONTAINS*1..]->(child:Module)
    RETURN child.path AS path ORDER BY child.path
  `
});
assert(moduleTreeQuery.success === true, 'Module tree query succeeds');
const profileDirs = moduleTreeQuery.data.map((r: any) => r.path);
console.log(`  app/(profile)/profile/ subdirs: ${profileDirs.length}`);
assert(profileDirs.length >= 10, `${profileDirs.length} profile subdirs (≥10)`);
assert(profileDirs.some((p: string) => p.includes('health')), 'Has health subdir');
assert(profileDirs.some((p: string) => p.includes('cycle')), 'Has cycle subdir');
assert(profileDirs.some((p: string) => p.includes('tai-san')), 'Has tai-san subdir');
assert(profileDirs.some((p: string) => p.includes('lekha-ai')), 'Has lekha-ai subdir');

// 12d: Component→Layer BELONGS_TO_LAYER
const layerQuery = await callTool('execute_cypher', {
  query: `
    MATCH (c:Component {name: 'FamilyTree'})-[:BELONGS_TO_LAYER]->(l:Layer)
    RETURN l.name AS layer
  `
});
assert(layerQuery.success === true, 'BELONGS_TO_LAYER query succeeds');
assert(layerQuery.data[0]?.layer === 'molecule', `FamilyTree belongs to molecule layer`);

// 12e: Safety — reject writes
const writeAttempt = await callTool('execute_cypher', {
  query: 'CREATE (n:Evil {name: "haha"})'
});
assert(writeAttempt.success === false, 'Write query is rejected');
console.log(`  Write blocked: ${writeAttempt.error}`);

// ═══════════════════════════════════════════════════════════════════
// TEST 13: reindex_codebase — re-ingest and verify counts
// ═══════════════════════════════════════════════════════════════════
console.log('\n── TEST 13: reindex_codebase ──');

const reindex = await callTool('reindex_codebase');
assert(reindex.success === true, 'reindex_codebase succeeds');
console.log(`  Reindexed: ${reindex.data.components} components, ${reindex.data.dependencies} deps, ${reindex.data.modules} modules, ${reindex.data.layers} layers`);
assert(reindex.data.components >= 200, `Components after reindex: ${reindex.data.components}`);
assert(reindex.data.modules >= 200, `Modules after reindex: ${reindex.data.modules}`);
assert(reindex.data.layers >= 4, `Layers after reindex: ${reindex.data.layers}`);

// Verify graph is consistent after reindex
const postReindex = await callTool('get_graph_summary');
assert(postReindex.data.totalComponents[0]?.total === reindex.data.components, 'Post-reindex count matches');

// ═══════════════════════════════════════════════════════════════════
// DONE
// ═══════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log(`MCP TOOL TESTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(70)}`);

server.kill();
process.exit(failed > 0 ? 1 : 0);
