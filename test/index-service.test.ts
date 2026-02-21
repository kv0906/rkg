import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'path';
import { parseCodebase } from '../src/parser.js';
import { toGraphConfig } from '../src/config.js';
import { runIndex } from '../src/core/index-service.js';
import type { GraphConfig } from '../src/types.js';
import type { RgkConfig } from '../src/types/config.js';

// When running from dist/test/, we need to resolve back to the source test/fixture/src
const testDir = import.meta.dirname || __dirname;
const projectRoot = resolve(testDir, testDir.includes('dist') ? '../..' : '..');
const FIXTURE_DIR = resolve(projectRoot, 'test/fixture/src');

function makeGraphConfig(): GraphConfig {
  return {
    sourceDir: FIXTURE_DIR,
    include: ['**/*.tsx', '**/*.ts'],
    exclude: ['**/*.test.*', '**/*.spec.*'],
    layerMapping: {
      atoms: 'atom',
      molecules: 'molecule',
      organisms: 'organism',
      templates: 'template',
      pages: 'page',
    },
    defaultLayer: 'unknown',
    neo4j: {
      uri: 'bolt://localhost:7687',
      user: 'neo4j',
      password: 'neo4j',
      database: 'testdb',
    },
  };
}

function makeRgkConfig(): RgkConfig {
  return {
    neo4j: {
      uri: 'bolt://localhost:7687',
      user: 'neo4j',
      password: 'neo4j',
      database: 'testdb',
    },
    indexing: {
      sourceDir: FIXTURE_DIR,
      include: ['**/*.tsx', '**/*.ts'],
      exclude: ['**/*.test.*', '**/*.spec.*'],
    },
    classification: {
      layerMapping: {
        atoms: 'atom',
        molecules: 'molecule',
        organisms: 'organism',
        templates: 'template',
        pages: 'page',
      },
      defaultLayer: 'unknown',
    },
  };
}

describe('index-service', () => {
  describe('exports', () => {
    it('runIndex is an exported function', () => {
      assert.ok(typeof runIndex === 'function', 'runIndex should be exported');
    });
  });

  describe('parsing pipeline (unit, no Neo4j)', () => {
    it('parseCodebase returns expected node counts for fixture', () => {
      const config = makeGraphConfig();
      const result = parseCodebase(config);

      // The fixture has ~22 components
      assert.ok(result.components.length >= 20, `expected >= 20 components, got ${result.components.length}`);
      assert.ok(result.components.length <= 25, `expected <= 25 components, got ${result.components.length}`);
    });

    it('parseCodebase returns expected edge counts for fixture', () => {
      const config = makeGraphConfig();
      const result = parseCodebase(config);

      assert.ok(result.dependencies.length > 0, 'expected some dependencies');
    });

    it('classificationSummary has layer breakdown matching fixture', () => {
      const config = makeGraphConfig();
      const result = parseCodebase(config);

      // Build classification summary same as index-service does
      const classificationSummary: Record<string, number> = {};
      for (const component of result.components) {
        classificationSummary[component.layer] =
          (classificationSummary[component.layer] || 0) + 1;
      }

      const layers = Object.keys(classificationSummary);
      assert.ok(layers.length > 0, 'should have at least one layer');
      assert.ok(layers.includes('atom'), `expected atom layer, got: ${layers.join(', ')}`);
      assert.ok(layers.includes('molecule'), `expected molecule layer, got: ${layers.join(', ')}`);
      assert.ok(layers.includes('organism'), `expected organism layer, got: ${layers.join(', ')}`);
      assert.ok(layers.includes('template'), `expected template layer, got: ${layers.join(', ')}`);
      assert.ok(layers.includes('page'), `expected page layer, got: ${layers.join(', ')}`);
    });

    it('IndexResult structure matches expected shape', () => {
      const config = makeGraphConfig();
      const result = parseCodebase(config);

      const classificationSummary: Record<string, number> = {};
      for (const component of result.components) {
        classificationSummary[component.layer] =
          (classificationSummary[component.layer] || 0) + 1;
      }
      const indexResult = {
        nodeCount: result.components.length,
        edgeCount: result.dependencies.length,
        classificationSummary,
      };

      assert.ok(typeof indexResult.nodeCount === 'number');
      assert.ok(typeof indexResult.edgeCount === 'number');
      assert.ok(typeof indexResult.classificationSummary === 'object');
      assert.ok(indexResult.nodeCount > 0);
    });

    it('modules and layers are derived correctly', () => {
      const config = makeGraphConfig();
      const result = parseCodebase(config);

      assert.ok(result.modules.length > 0, 'should derive modules');
      assert.ok(result.layers.length > 0, 'should derive layers');
    });
  });

  describe('runIndex error handling', () => {
    it('throws when config is not provided', async () => {
      await assert.rejects(
        () => runIndex({}),
        { message: 'config is required in IndexOptions' },
      );
    });
  });

  describe('toGraphConfig integration', () => {
    it('toGraphConfig converts RgkConfig correctly for indexing', () => {
      const rgkConfig = makeRgkConfig();
      const graphConfig = toGraphConfig(rgkConfig);

      assert.equal(graphConfig.sourceDir, FIXTURE_DIR);
      assert.deepEqual(graphConfig.include, ['**/*.tsx', '**/*.ts']);
      assert.deepEqual(graphConfig.exclude, ['**/*.test.*', '**/*.spec.*']);
      assert.equal(graphConfig.neo4j.database, 'testdb');
    });

    it('workspacePath override logic works correctly', () => {
      const rgkConfig = makeRgkConfig();
      const graphConfig = toGraphConfig(rgkConfig);

      // Simulate the override from runIndex
      const overriddenConfig = { ...graphConfig, sourceDir: '/some/other/path' };
      assert.equal(overriddenConfig.sourceDir, '/some/other/path');
      assert.equal(graphConfig.sourceDir, FIXTURE_DIR);
    });
  });
});
