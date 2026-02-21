import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RgkConfig, Neo4jConfig, IndexingConfig, ClassificationConfig, ClassificationRule } from '../src/types/config.js';
import { DEFAULT_CONFIG_FILE, LEGACY_CONFIG_FILE, RGK_ENV } from '../src/types/config.js';

describe('RgkConfig types', () => {
  it('exports DEFAULT_CONFIG_FILE as rgk.config.json', () => {
    assert.equal(DEFAULT_CONFIG_FILE, 'rgk.config.json');
  });

  it('exports LEGACY_CONFIG_FILE as graph-config.json', () => {
    assert.equal(LEGACY_CONFIG_FILE, 'graph-config.json');
  });

  it('exports RGK_ENV with correct env var names', () => {
    assert.equal(RGK_ENV.CONFIG, 'RGK_CONFIG');
    assert.equal(RGK_ENV.NEO4J_URI, 'RGK_NEO4J_URI');
    assert.equal(RGK_ENV.NEO4J_USER, 'RGK_NEO4J_USER');
    assert.equal(RGK_ENV.NEO4J_PASSWORD, 'RGK_NEO4J_PASSWORD');
    assert.equal(RGK_ENV.NEO4J_DATABASE, 'RGK_NEO4J_DATABASE');
  });

  it('RgkConfig interface covers neo4j, indexing, and classification', () => {
    const config: RgkConfig = {
      neo4j: {
        uri: 'bolt://localhost:7687',
        user: 'neo4j',
        password: 'test',
        database: 'neo4j',
      },
      indexing: {
        sourceDir: './src',
        include: ['**/*.tsx'],
        exclude: ['**/*.test.*'],
      },
      classification: {
        layerMapping: { atoms: 'atom' },
        defaultLayer: 'unknown',
      },
    };

    assert.equal(config.neo4j.uri, 'bolt://localhost:7687');
    assert.equal(config.indexing.sourceDir, './src');
    assert.equal(config.classification.defaultLayer, 'unknown');
  });

  it('ClassificationConfig supports optional rules', () => {
    const config: ClassificationConfig = {
      layerMapping: {},
      defaultLayer: 'unknown',
      rules: [
        { glob: 'app/**/page.tsx', kind: 'next_page', domain: 'storefront' },
      ],
    };

    assert.equal(config.rules!.length, 1);
    assert.equal(config.rules![0].kind, 'next_page');
  });
});
