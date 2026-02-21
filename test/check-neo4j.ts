import neo4j from 'neo4j-driver';

const d = neo4j.driver('neo4j://127.0.0.1:7687', neo4j.auth.basic('neo4j', 'neo4jadmin'));

const { records } = await d.executeQuery(
  'MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY count DESC',
  {}, { database: 'neo4j' }
);

console.log('Current Neo4j contents:');
for (const rec of records) {
  console.log(`  ${rec.get('label')}: ${rec.get('count').toNumber()}`);
}

const { records: edgeRecs } = await d.executeQuery(
  'MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC',
  {}, { database: 'neo4j' }
);
console.log('\nEdges:');
for (const rec of edgeRecs) {
  console.log(`  ${rec.get('type')}: ${rec.get('count').toNumber()}`);
}

await d.close();
