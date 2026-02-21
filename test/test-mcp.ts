/**
 * Tests the MCP server tools by running queries against Neo4j.
 * Requires Neo4j running on bolt://localhost:7687.
 */
import { loadConfig } from '../src/config.js';
import { parseCodebase } from '../src/parser.js';
import { initDatabase, clearGraph, ingestComponents, ingestDependencies, ingestModules, ingestLayers, query, closeDatabase } from '../src/db.js';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const config = loadConfig(resolve(PROJECT_ROOT, 'test', 'fixture-config.json'));

// Parse and ingest
const parseResult = parseCodebase(config);
await initDatabase(config.neo4j);
await clearGraph(config.neo4j.database);
await ingestComponents(parseResult.components, config.neo4j.database);
await ingestDependencies(parseResult.dependencies, config.neo4j.database);
await ingestModules(parseResult.modules, parseResult.components, config.neo4j.database);
await ingestLayers(parseResult.layers, parseResult.components, config.neo4j.database);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.log(`  FAIL: ${msg}`);
    failed++;
  }
}

const db = config.neo4j.database;

// Test 1: get_component_info equivalent
console.log('\n--- get_component_info: SearchBar ---');
const searchBarInfo = await query(`
  MATCH (c:Component)
  WHERE toLower(c.name) = toLower($name)
  OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep:Component)
  WITH c, count(DISTINCT dep) AS dependencyCount
  OPTIONAL MATCH (parent:Component)-[:DEPENDS_ON]->(c)
  RETURN c.name AS name, c.filePath AS filePath, c.layer AS layer,
         c.exportType AS exportType, c.hasState AS hasState,
         dependencyCount,
         count(DISTINCT parent) AS dependentCount
`, { name: 'SearchBar' }, db);
console.log(JSON.stringify(searchBarInfo, null, 2));
assert(searchBarInfo.length === 1, 'Found exactly 1 SearchBar');
assert(searchBarInfo[0].name === 'SearchBar', 'Name is SearchBar');
assert(searchBarInfo[0].layer === 'molecule', 'Layer is molecule');
assert(searchBarInfo[0].hasState === true, 'Has state');
assert(searchBarInfo[0].dependencyCount === 2, 'Has 2 dependencies');
assert(searchBarInfo[0].dependentCount === 1, 'Has 1 dependent');

// Test 2: get_component_dependencies equivalent
console.log('\n--- get_component_dependencies: Header (immediate) ---');
const headerDeps = await query(`
  MATCH (c:Component)-[:DEPENDS_ON]->(dep:Component)
  WHERE toLower(c.name) = toLower($name)
  RETURN dep.name AS name, dep.filePath AS filePath, dep.layer AS layer
`, { name: 'Header' }, db);
console.log(JSON.stringify(headerDeps, null, 2));
assert(headerDeps.length === 2, 'Header has 2 immediate dependencies');
const depNames = headerDeps.map(r => r.name as string).sort();
assert(depNames[0] === 'Button' && depNames[1] === 'SearchBar', 'Dependencies are Button and SearchBar');

// Test 3: get_component_dependents equivalent
console.log('\n--- get_component_dependents: Button ---');
const buttonDependents = await query(`
  MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
  WHERE toLower(c.name) = toLower($name)
  RETURN parent.name AS name, parent.filePath AS filePath, parent.layer AS layer
`, { name: 'Button' }, db);
console.log(JSON.stringify(buttonDependents, null, 2));
assert(buttonDependents.length === 4, 'Button has 4 dependents');
const parentNames = buttonDependents.map(r => r.name as string).sort();
assert(parentNames.includes('Header') && parentNames.includes('LoginForm'), 'Dependents include Header and LoginForm');
assert(parentNames.includes('UserProfile') && parentNames.includes('Settings'), 'Dependents include UserProfile and Settings');

// Test 4: get_layer_components equivalent
console.log('\n--- get_layer_components: atom ---');
const atoms = await query(`
  MATCH (c:Component)
  WHERE toLower(c.layer) = toLower($layerName)
  RETURN c.name AS name, c.filePath AS filePath, c.exportType AS exportType, c.hasState AS hasState
  ORDER BY c.name
`, { layerName: 'atom' }, db);
console.log(JSON.stringify(atoms, null, 2));
assert(atoms.length === 7, 'There are 7 atoms');
assert(atoms[0].name === 'Avatar', 'First atom is Avatar (alphabetical)');

// Test 5: get_graph_summary equivalent
console.log('\n--- get_graph_summary ---');
const totalComp = await query('MATCH (c:Component) RETURN count(c) AS total', {}, db);
const totalEdge = await query('MATCH ()-[r:DEPENDS_ON]->() RETURN count(r) AS total', {}, db);
console.log('Total components:', totalComp[0].total);
console.log('Total edges:', totalEdge[0].total);
assert(totalComp[0].total === 22, 'Total components = 22');
assert(totalEdge[0].total === 26, 'Total edges = 26');

// Test 6: Full recursive dependencies
console.log('\n--- get_component_dependencies: Home (recursive) ---');
const homeDepsRecursive = await query(`
  MATCH (c:Component)
  WHERE toLower(c.name) = toLower($name)
  MATCH (c)-[:DEPENDS_ON*1..]->(dep:Component)
  RETURN DISTINCT dep.name AS name, dep.filePath AS filePath, dep.layer AS layer
`, { name: 'Home' }, db);
console.log(JSON.stringify(homeDepsRecursive, null, 2));
assert(homeDepsRecursive.length >= 6, 'Home has at least 6 transitive dependencies');

// Test 7: Props extraction — Button
console.log('\n--- Props extraction: Button ---');
const buttonInfo = await query(`
  MATCH (c:Component)
  WHERE toLower(c.name) = 'button'
  RETURN c.props AS props, c.description AS description, c.hooks AS hooks
`, {}, db);
const buttonProps = JSON.parse(buttonInfo[0].props as string);
const buttonDesc = buttonInfo[0].description as string;
const buttonHooks = JSON.parse(buttonInfo[0].hooks as string);
console.log('Props:', JSON.stringify(buttonProps, null, 2));
console.log('Description:', buttonDesc);
console.log('Hooks:', buttonHooks);
assert(buttonProps.length === 2, 'Button has 2 props');
assert(buttonProps.some((p: any) => p.name === 'children' && p.required === true), 'Button has required "children" prop');
assert(buttonProps.some((p: any) => p.name === 'onClick' && p.required === false), 'Button has optional "onClick" prop');
assert(buttonDesc.includes('basic button'), 'Button description extracted from JSDoc');

// Test 8: Hooks extraction — SearchBar
console.log('\n--- Hooks extraction: SearchBar ---');
const searchBarHooksRow = await query(`
  MATCH (c:Component) WHERE c.name = 'SearchBar'
  RETURN c.hooks AS hooks
`, {}, db);
const searchBarHooks = JSON.parse(searchBarHooksRow[0].hooks as string);
console.log('Hooks:', searchBarHooks);
assert(searchBarHooks.includes('useState'), 'SearchBar hooks include useState');

// Test 9: find_similar_components equivalent — name match
console.log('\n--- find_similar: name "Button" ---');
const similarRows = await query(`
  MATCH (c:Component)
  WHERE toLower(c.name) CONTAINS toLower($query)
  RETURN c.name AS name, c.layer AS layer
`, { query: 'Button' }, db);
assert(similarRows.length >= 1, 'find_similar: name "Button" returns at least 1 match');
assert(similarRows.some(r => r.name === 'Button'), 'find_similar: includes Button');

// Test 10: search_components equivalent — filter by layer + state
console.log('\n--- search_components: layer=atom, hasState=true ---');
const searchRows = await query(`
  MATCH (c:Component)
  WHERE toLower(c.layer) = 'atom' AND c.hasState = true
  RETURN c.name AS name
`, {}, db);
console.log(JSON.stringify(searchRows, null, 2));
assert(searchRows.length >= 1, 'search_components: at least 1 stateful atom');
assert(searchRows.some(r => r.name === 'Input'), 'search_components: includes Input');

// Test 11: get_change_impact equivalent — Button blast radius
console.log('\n--- get_change_impact: Button ---');
const [directDep, transitiveDep, affectedPages] = await Promise.all([
  query(`
    MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
    WHERE toLower(c.name) = 'button'
    RETURN parent.name AS name
  `, {}, db),
  query(`
    MATCH (c:Component) WHERE toLower(c.name) = 'button'
    MATCH (parent:Component)-[:DEPENDS_ON*1..]->(c)
    RETURN DISTINCT parent.name AS name
  `, {}, db),
  query(`
    MATCH (c:Component) WHERE toLower(c.name) = 'button'
    MATCH (page:Component)-[:DEPENDS_ON*1..]->(c)
    WHERE page.layer = 'page'
    RETURN DISTINCT page.name AS name
  `, {}, db),
]);
console.log('Direct dependents:', directDep.map(r => r.name));
console.log('Transitive dependents:', transitiveDep.map(r => r.name));
console.log('Affected pages:', affectedPages.map(r => r.name));
assert(directDep.length === 4, 'Button has 4 direct dependents');
assert(transitiveDep.length >= 8, 'Button has at least 8 transitive dependents');
const pageNames = affectedPages.map(r => r.name as string).sort();
assert(pageNames.length === 3, 'Button affects 3 pages');
assert(pageNames[0] === 'Dashboard' && pageNames[1] === 'Home' && pageNames[2] === 'Settings', 'Button affects Dashboard, Home, Settings');

// Test 12: Avatar props via named interface
console.log('\n--- Props extraction: Avatar (named interface) ---');
const avatarInfo = await query(`
  MATCH (c:Component) WHERE c.name = 'Avatar'
  RETURN c.props AS props, c.description AS description
`, {}, db);
const avatarProps = JSON.parse(avatarInfo[0].props as string);
console.log('Props:', JSON.stringify(avatarProps, null, 2));
assert(avatarProps.length === 2, 'Avatar has 2 props via named interface');
assert(avatarProps.some((p: any) => p.name === 'src' && p.required === true), 'Avatar has required "src" prop');
assert(avatarProps.some((p: any) => p.name === 'size' && p.required === false), 'Avatar has optional "size" prop');

// Test 13: Badge is arrow function with named export
console.log('\n--- Badge export type ---');
const badgeInfo = await query(`
  MATCH (c:Component) WHERE c.name = 'Badge'
  RETURN c.exportType AS exportType
`, {}, db);
assert(badgeInfo[0].exportType === 'named', 'Badge is a named export (arrow function)');

// Test 14: Tooltip hooks
console.log('\n--- Hooks extraction: Tooltip ---');
const tooltipHooksRow = await query(`
  MATCH (c:Component) WHERE c.name = 'Tooltip'
  RETURN c.hooks AS hooks
`, {}, db);
const tooltipHooks = JSON.parse(tooltipHooksRow[0].hooks as string);
console.log('Hooks:', tooltipHooks);
assert(tooltipHooks.includes('useState') && tooltipHooks.includes('useEffect'), 'Tooltip hooks include useState and useEffect');

// Test 15: search_components hooks=useContext
console.log('\n--- search_components: hooks contain useContext ---');
const useContextRows = await query(`
  MATCH (c:Component)
  WHERE c.hooks CONTAINS 'useContext'
  RETURN c.name AS name
  ORDER BY c.name
`, {}, db);
console.log(JSON.stringify(useContextRows, null, 2));
const useContextNames = useContextRows.map(r => r.name as string);
assert(useContextNames.includes('UserProfile'), 'useContext search includes UserProfile');
assert(useContextNames.includes('Settings'), 'useContext search includes Settings');

// Test 16: get_change_impact DashboardLayout → 2 pages
console.log('\n--- get_change_impact: DashboardLayout ---');
const dlAffectedPages = await query(`
  MATCH (c:Component) WHERE c.name = 'DashboardLayout'
  MATCH (page:Component)-[:DEPENDS_ON*1..]->(c)
  WHERE page.layer = 'page'
  RETURN DISTINCT page.name AS name
`, {}, db);
const dlPageNames = dlAffectedPages.map(r => r.name as string).sort();
console.log('Affected pages:', dlPageNames);
assert(dlPageNames.length === 2, 'DashboardLayout affects 2 pages');
assert(dlPageNames[0] === 'Dashboard' && dlPageNames[1] === 'Settings', 'DashboardLayout affects Dashboard and Settings');

// Test 17: get_change_impact Checkbox → Settings (through CheckboxGroup)
console.log('\n--- get_change_impact: Checkbox ---');
const checkboxPages = await query(`
  MATCH (c:Component) WHERE c.name = 'Checkbox'
  MATCH (page:Component)-[:DEPENDS_ON*1..]->(c)
  WHERE page.layer = 'page'
  RETURN DISTINCT page.name AS name
`, {}, db);
console.log('Affected pages:', checkboxPages.map(r => r.name));
assert(checkboxPages.length === 1 && checkboxPages[0].name === 'Settings', 'Checkbox affects 1 page (Settings)');

// Test 18: find_similar query="Card"
console.log('\n--- find_similar: name "Card" ---');
const cardRows = await query(`
  MATCH (c:Component)
  WHERE toLower(c.name) CONTAINS toLower($query)
  RETURN c.name AS name, c.layer AS layer
`, { query: 'Card' }, db);
console.log(JSON.stringify(cardRows, null, 2));
assert(cardRows.some(r => r.name === 'UserCard'), 'find_similar: "Card" returns UserCard');

// Test 19: Template layer has 2 components
console.log('\n--- get_layer_components: template ---');
const templates = await query(`
  MATCH (c:Component)
  WHERE toLower(c.layer) = 'template'
  RETURN c.name AS name
  ORDER BY c.name
`, {}, db);
console.log(JSON.stringify(templates, null, 2));
assert(templates.length === 2, 'Template layer has 2 components');
assert(templates[0].name === 'AuthLayout' && templates[1].name === 'DashboardLayout', 'Templates are AuthLayout and DashboardLayout');

// Test 20: execute_cypher safety
console.log('\n--- execute_cypher safety ---');
const forbiddenPattern = /\b(CREATE|DELETE|DROP|SET|MERGE|REMOVE|DETACH)\b/i;
assert(forbiddenPattern.test('CREATE (n:Foo)'), 'Blocks CREATE');
assert(forbiddenPattern.test('MATCH (n) DELETE n'), 'Blocks DELETE');
assert(!forbiddenPattern.test('MATCH (n) RETURN n'), 'Allows plain MATCH');

// Test 21: Module node count
console.log('\n--- Module nodes ---');
const moduleNodes = await query('MATCH (m:Module) RETURN m.path AS path ORDER BY m.path', {}, db);
console.log('Modules:', moduleNodes.map(r => r.path));
assert(moduleNodes.length === 7, `Module count = 7 (got ${moduleNodes.length})`);

// Test 22: components module CONTAINS 4 child modules
console.log('\n--- components module children ---');
const compChildren = await query(`
  MATCH (m:Module {path: 'components'})-[:CONTAINS]->(child:Module)
  RETURN child.name AS name ORDER BY child.name
`, {}, db);
console.log('Children:', compChildren.map(r => r.name));
assert(compChildren.length === 4, `components has 4 child modules (got ${compChildren.length})`);

// Test 23: components/atoms module CONTAINS 7 components
console.log('\n--- components/atoms CONTAINS components ---');
const atomComponents = await query(`
  MATCH (m:Module {path: 'components/atoms'})-[:CONTAINS]->(c:Component)
  RETURN c.name AS name ORDER BY c.name
`, {}, db);
console.log('Atom components:', atomComponents.map(r => r.name));
assert(atomComponents.length === 7, `components/atoms contains 7 components (got ${atomComponents.length})`);

// Test 24: Layer node count
console.log('\n--- Layer nodes ---');
const layerNodes = await query('MATCH (l:Layer) RETURN l.name AS name ORDER BY l.name', {}, db);
console.log('Layers:', layerNodes.map(r => r.name));
const layerNames = layerNodes.map(r => r.name as string);
assert(layerNames.includes('atom'), 'Layer "atom" exists');
assert(layerNames.includes('molecule'), 'Layer "molecule" exists');
assert(layerNames.includes('organism'), 'Layer "organism" exists');
assert(layerNames.includes('template'), 'Layer "template" exists');
assert(layerNames.includes('page'), 'Layer "page" exists');

// Test 25: All 22 components have BELONGS_TO_LAYER edge
console.log('\n--- BELONGS_TO_LAYER completeness ---');
const belongsCount = await query(`
  MATCH (c:Component)-[:BELONGS_TO_LAYER]->(l:Layer)
  RETURN count(c) AS total
`, {}, db);
assert(belongsCount[0].total === 22, `All 22 components have BELONGS_TO_LAYER (got ${belongsCount[0].total})`);

// Test 26: Cross-layer query: organism→atom dependencies exist (Header→Button)
console.log('\n--- Cross-layer: organism→atom ---');
const crossLayer = await query(`
  MATCH (src:Component)-[:DEPENDS_ON]->(tgt:Component)
  MATCH (src)-[:BELONGS_TO_LAYER]->(srcL:Layer {name: 'organism'})
  MATCH (tgt)-[:BELONGS_TO_LAYER]->(tgtL:Layer {name: 'atom'})
  RETURN src.name AS source, tgt.name AS target
`, {}, db);
console.log('Cross-layer edges:', crossLayer.map(r => `${r.source}→${r.target}`));
assert(crossLayer.some(r => r.source === 'Header' && r.target === 'Button'), 'Header→Button cross-layer dependency exists');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

await closeDatabase();
process.exit(failed > 0 ? 1 : 0);
