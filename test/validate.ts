import { loadConfig } from '../src/config.js';
import { parseCodebase } from '../src/parser.js';
import { initDatabase, clearGraph, ingestComponents, ingestDependencies, query, closeDatabase } from '../src/db.js';
import { resolve } from 'path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const fixtureConfig = loadConfig(resolve(PROJECT_ROOT, 'test', 'fixture-config.json'));

console.log('=== Parsing fixture codebase ===');
console.log('sourceDir:', fixtureConfig.sourceDir);

const result = parseCodebase(fixtureConfig);

console.log('\n=== Components ===');
console.log(`Found ${result.components.length} components (expected 9):`);
for (const c of result.components.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${c.name} | ${c.filePath} | layer=${c.layer} | export=${c.exportType} | hasState=${c.hasState}`);
}

console.log('\n=== Dependencies ===');
console.log(`Found ${result.dependencies.length} dependencies (expected 9):`);
for (const d of result.dependencies.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile))) {
  console.log(`  ${d.sourceFile} --> ${d.targetFile} (${d.importType})`);
}

// Validate parser output against expected
const expectedComponents = [
  { name: 'Button', layer: 'atom', exportType: 'default', hasState: false },
  { name: 'Input', layer: 'atom', exportType: 'named', hasState: true },
  { name: 'Icon', layer: 'atom', exportType: 'default', hasState: false },
  { name: 'SearchBar', layer: 'molecule', exportType: 'default', hasState: true },
  { name: 'FormField', layer: 'molecule', exportType: 'default', hasState: false },
  { name: 'Header', layer: 'organism', exportType: 'default', hasState: false },
  { name: 'LoginForm', layer: 'organism', exportType: 'default', hasState: true },
  { name: 'Home', layer: 'page', exportType: 'default', hasState: false },
  { name: 'helpers', layer: 'unknown', exportType: 'named', hasState: false },
];

const expectedEdges = [
  { source: 'SearchBar', target: 'Input', importType: 'reexport' },
  { source: 'SearchBar', target: 'Icon', importType: 'reexport' },
  { source: 'FormField', target: 'Input', importType: 'direct' },
  { source: 'Header', target: 'SearchBar', importType: 'reexport' },
  { source: 'Header', target: 'Button', importType: 'reexport' },
  { source: 'LoginForm', target: 'FormField', importType: 'reexport' },
  { source: 'LoginForm', target: 'Button', importType: 'reexport' },
  { source: 'Home', target: 'Header', importType: 'reexport' },
  { source: 'Home', target: 'LoginForm', importType: 'reexport' },
];

console.log('\n=== Parser Validation ===');
let errors = 0;

for (const expected of expectedComponents) {
  const found = result.components.find(c => c.name === expected.name);
  if (!found) { console.log(`FAIL: Missing component: ${expected.name}`); errors++; }
  else {
    if (found.layer !== expected.layer) { console.log(`FAIL: ${expected.name} layer: got ${found.layer}, expected ${expected.layer}`); errors++; }
    if (found.exportType !== expected.exportType) { console.log(`FAIL: ${expected.name} exportType: got ${found.exportType}, expected ${expected.exportType}`); errors++; }
    if (found.hasState !== expected.hasState) { console.log(`FAIL: ${expected.name} hasState: got ${found.hasState}, expected ${expected.hasState}`); errors++; }
  }
}

for (const c of result.components) {
  if (!expectedComponents.find(e => e.name === c.name)) {
    console.log(`FAIL: Unexpected component: ${c.name} (${c.filePath})`); errors++;
  }
}

const compByPath = new Map(result.components.map(c => [c.filePath, c]));
for (const expected of expectedEdges) {
  const found = result.dependencies.find(d => {
    const sourceComp = compByPath.get(d.sourceFile);
    const targetComp = compByPath.get(d.targetFile);
    return sourceComp?.name === expected.source && targetComp?.name === expected.target;
  });
  if (!found) { console.log(`FAIL: Missing edge: ${expected.source} --> ${expected.target}`); errors++; }
  else if (found.importType !== expected.importType) { console.log(`FAIL: Edge ${expected.source} --> ${expected.target}: got importType=${found.importType}, expected ${expected.importType}`); errors++; }
}

for (const d of result.dependencies) {
  const sourceComp = compByPath.get(d.sourceFile);
  const targetComp = compByPath.get(d.targetFile);
  if (!expectedEdges.find(e => e.source === sourceComp?.name && e.target === targetComp?.name)) {
    console.log(`FAIL: Unexpected edge: ${sourceComp?.name} --> ${targetComp?.name}`); errors++;
  }
}

if (errors === 0) {
  console.log('ALL PARSER CHECKS PASSED!');
} else {
  console.log(`\n${errors} parser errors found.`);
  process.exit(1);
}

// Test Neo4j integration
console.log('\n=== Neo4j Integration ===');
try {
  await initDatabase(fixtureConfig.neo4j);
  await clearGraph(fixtureConfig.neo4j.database);
  await ingestComponents(result.components, fixtureConfig.neo4j.database);
  await ingestDependencies(result.dependencies, fixtureConfig.neo4j.database);

  const compCount = await query('MATCH (c:Component) RETURN count(c) AS total', {}, fixtureConfig.neo4j.database);
  console.log('Component count:', compCount);

  const edgeCount = await query('MATCH ()-[r:DEPENDS_ON]->() RETURN count(r) AS total', {}, fixtureConfig.neo4j.database);
  console.log('Edge count:', edgeCount);

  // Test a query with parameters
  const searchBar = await query(
    'MATCH (c:Component) WHERE toLower(c.name) = toLower($name) RETURN c.name AS name, c.layer AS layer',
    { name: 'SearchBar' },
    fixtureConfig.neo4j.database
  );
  console.log('SearchBar lookup:', searchBar);

  const compTotal = compCount[0]?.total as number;
  const edgeTotal = edgeCount[0]?.total as number;

  if (compTotal !== 9) { console.log(`FAIL: Expected 9 components, got ${compTotal}`); errors++; }
  if (edgeTotal !== 9) { console.log(`FAIL: Expected 9 edges, got ${edgeTotal}`); errors++; }
  if (searchBar[0]?.name !== 'SearchBar') { console.log(`FAIL: SearchBar lookup failed`); errors++; }

  if (errors === 0) {
    console.log('ALL NEO4J CHECKS PASSED!');
  } else {
    console.log(`\n${errors} errors found.`);
  }

  await closeDatabase();
} catch (e) {
  console.log(`Neo4j connection failed: ${(e as Error).message}`);
  console.log('Skipping Neo4j tests (ensure Neo4j is running on bolt://localhost:7687)');
}

console.log('\nValidation complete.');
