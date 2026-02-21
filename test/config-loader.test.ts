import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { loadConfig, toGraphConfig } from '../src/config.js';

const TMP_DIR = join(import.meta.dirname || __dirname, '__tmp_config_test__');

// Helper to save/restore env vars
function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
  }
  try {
    for (const [key, val] of Object.entries(vars)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    const result = fn();
    if (result instanceof Promise) return result;
  } finally {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  }
}

// Clear all config-related env vars
const ALL_CONFIG_ENVS: Record<string, undefined> = {
  RGK_CONFIG: undefined,
  RGK_NEO4J_URI: undefined,
  RGK_NEO4J_USER: undefined,
  RGK_NEO4J_PASSWORD: undefined,
  RGK_NEO4J_DATABASE: undefined,
  REACT_GRAPH_CONFIG: undefined,
  NEO4J_URI: undefined,
  NEO4J_USER: undefined,
  NEO4J_PASSWORD: undefined,
  NEO4J_DATABASE: undefined,
};

// Capture stderr
function captureStderr(fn: () => void): string[] {
  const messages: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    messages.push(args.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.error = original;
  }
  return messages;
}

describe('config loader', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  describe('loading from rgk.config.json (new format)', () => {
    it('loads new nested format correctly', () => {
      const configFile = join(TMP_DIR, 'rgk.config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          neo4j: {
            uri: 'bolt://custom:7687',
            user: 'admin',
            password: 'secret',
            database: 'mydb',
          },
          indexing: {
            sourceDir: './src',
            include: ['**/*.tsx'],
            exclude: ['**/*.test.tsx'],
          },
          classification: {
            layerMapping: { atoms: 'atom' },
            defaultLayer: 'component',
          },
        }),
      );

      withEnv(ALL_CONFIG_ENVS, () => {
        const config = loadConfig(configFile);
        assert.equal(config.neo4j.uri, 'bolt://custom:7687');
        assert.equal(config.neo4j.user, 'admin');
        assert.equal(config.neo4j.password, 'secret');
        assert.equal(config.neo4j.database, 'mydb');
        assert.equal(config.indexing.sourceDir, resolve(TMP_DIR, './src'));
        assert.deepEqual(config.indexing.include, ['**/*.tsx']);
        assert.deepEqual(config.indexing.exclude, ['**/*.test.tsx']);
        assert.deepEqual(config.classification.layerMapping, { atoms: 'atom' });
        assert.equal(config.classification.defaultLayer, 'component');
      });
    });
  });

  describe('loading from graph-config.json (legacy format)', () => {
    it('loads legacy flat format and maps to RgkConfig', () => {
      const configFile = join(TMP_DIR, 'graph-config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          sourceDir: './app',
          include: ['**/*.tsx', '**/*.ts'],
          exclude: [],
          layerMapping: { components: 'molecule' },
          defaultLayer: 'unknown',
          neo4j: {
            uri: 'bolt://legacy:7687',
            user: 'legacyuser',
            password: 'legacypass',
            database: 'legacydb',
          },
        }),
      );

      withEnv(ALL_CONFIG_ENVS, () => {
        const config = loadConfig(configFile);
        assert.equal(config.neo4j.uri, 'bolt://legacy:7687');
        assert.equal(config.indexing.sourceDir, resolve(TMP_DIR, './app'));
        assert.deepEqual(config.classification.layerMapping, {
          components: 'molecule',
        });
      });
    });
  });

  describe('new RGK_ env vars override config file', () => {
    it('RGK_ env vars take precedence over config file values', () => {
      const configFile = join(TMP_DIR, 'rgk.config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          neo4j: {
            uri: 'bolt://file:7687',
            user: 'fileuser',
            password: 'filepass',
            database: 'filedb',
          },
          indexing: { sourceDir: '.', include: ['**/*.ts'], exclude: [] },
          classification: { layerMapping: {}, defaultLayer: 'unknown' },
        }),
      );

      withEnv(
        {
          ...ALL_CONFIG_ENVS,
          RGK_NEO4J_URI: 'bolt://envnew:7687',
          RGK_NEO4J_USER: 'envuser',
          RGK_NEO4J_PASSWORD: 'envpass',
          RGK_NEO4J_DATABASE: 'envdb',
        },
        () => {
          const config = loadConfig(configFile);
          assert.equal(config.neo4j.uri, 'bolt://envnew:7687');
          assert.equal(config.neo4j.user, 'envuser');
          assert.equal(config.neo4j.password, 'envpass');
          assert.equal(config.neo4j.database, 'envdb');
        },
      );
    });
  });

  describe('old env vars with deprecation warning', () => {
    it('falls back to legacy NEO4J_ env vars and warns', () => {
      const configFile = join(TMP_DIR, 'rgk.config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          neo4j: {
            uri: 'bolt://file:7687',
            user: 'f',
            password: 'f',
            database: 'f',
          },
          indexing: { sourceDir: '.', include: ['**/*.ts'], exclude: [] },
          classification: { layerMapping: {}, defaultLayer: 'unknown' },
        }),
      );

      withEnv(
        {
          ...ALL_CONFIG_ENVS,
          NEO4J_URI: 'bolt://oldenv:7687',
          NEO4J_USER: 'olduser',
          NEO4J_PASSWORD: 'oldpass',
          NEO4J_DATABASE: 'olddb',
        },
        () => {
          const warnings = captureStderr(() => {
            const config = loadConfig(configFile);
            assert.equal(config.neo4j.uri, 'bolt://oldenv:7687');
            assert.equal(config.neo4j.user, 'olduser');
            assert.equal(config.neo4j.password, 'oldpass');
            assert.equal(config.neo4j.database, 'olddb');
          });

          // Should have deprecation warnings
          assert.ok(warnings.length >= 4, `Expected >=4 warnings, got ${warnings.length}`);
          assert.ok(
            warnings.some((w) => w.includes('NEO4J_URI') && w.includes('RGK_NEO4J_URI')),
          );
          assert.ok(
            warnings.some((w) => w.includes('NEO4J_USER') && w.includes('RGK_NEO4J_USER')),
          );
        },
      );
    });
  });

  describe('both old and new env vars: new takes precedence', () => {
    it('new RGK_ vars win over old NEO4J_ vars', () => {
      const configFile = join(TMP_DIR, 'rgk.config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          neo4j: {
            uri: 'bolt://file:7687',
            user: 'f',
            password: 'f',
            database: 'f',
          },
          indexing: { sourceDir: '.', include: ['**/*.ts'], exclude: [] },
          classification: { layerMapping: {}, defaultLayer: 'unknown' },
        }),
      );

      withEnv(
        {
          ...ALL_CONFIG_ENVS,
          RGK_NEO4J_URI: 'bolt://new:7687',
          NEO4J_URI: 'bolt://old:7687',
          RGK_NEO4J_USER: 'newuser',
          NEO4J_USER: 'olduser',
          RGK_NEO4J_PASSWORD: 'newpass',
          NEO4J_PASSWORD: 'oldpass',
          RGK_NEO4J_DATABASE: 'newdb',
          NEO4J_DATABASE: 'olddb',
        },
        () => {
          const warnings = captureStderr(() => {
            const config = loadConfig(configFile);
            assert.equal(config.neo4j.uri, 'bolt://new:7687');
            assert.equal(config.neo4j.user, 'newuser');
            assert.equal(config.neo4j.password, 'newpass');
            assert.equal(config.neo4j.database, 'newdb');
          });

          // No deprecation warnings since new vars were used
          const deprecationWarnings = warnings.filter((w) =>
            w.includes('Deprecation'),
          );
          assert.equal(deprecationWarnings.length, 0);
        },
      );
    });
  });

  describe('config file fallback', () => {
    it('uses defaults when no config file exists and no env vars set', () => {
      // Point to a dir with no config files
      const originalCwd = process.cwd();
      process.chdir(TMP_DIR);
      try {
        withEnv(ALL_CONFIG_ENVS, () => {
          const config = loadConfig();
          assert.equal(config.neo4j.uri, 'bolt://localhost:7687');
          assert.equal(config.neo4j.user, 'neo4j');
          assert.equal(config.neo4j.password, 'neo4j');
          assert.equal(config.neo4j.database, 'neo4j');
          assert.deepEqual(config.indexing.include, ['**/*.tsx', '**/*.ts']);
        });
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('throws when explicit config path does not exist', () => {
      withEnv(ALL_CONFIG_ENVS, () => {
        assert.throws(
          () => loadConfig(join(TMP_DIR, 'nonexistent.json')),
          /Config file not found/,
        );
      });
    });

    it('warns when loading from legacy graph-config.json by discovery', () => {
      const originalCwd = process.cwd();
      // Write only graph-config.json in TMP_DIR (no rgk.config.json)
      writeFileSync(
        join(TMP_DIR, 'graph-config.json'),
        JSON.stringify({
          sourceDir: './src',
          include: ['**/*.tsx'],
          exclude: [],
          layerMapping: {},
          defaultLayer: 'unknown',
        }),
      );
      process.chdir(TMP_DIR);
      try {
        withEnv(ALL_CONFIG_ENVS, () => {
          const warnings = captureStderr(() => {
            const config = loadConfig();
            assert.equal(
              config.indexing.sourceDir,
              resolve(TMP_DIR, './src'),
            );
          });
          assert.ok(
            warnings.some(
              (w) =>
                w.includes('graph-config.json') &&
                w.includes('rgk.config.json'),
            ),
          );
        });
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('warns when REACT_GRAPH_CONFIG env var is used', () => {
      const configFile = join(TMP_DIR, 'custom.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          sourceDir: '.',
          include: ['**/*.ts'],
          exclude: [],
          layerMapping: {},
          defaultLayer: 'unknown',
        }),
      );

      withEnv(
        { ...ALL_CONFIG_ENVS, REACT_GRAPH_CONFIG: configFile },
        () => {
          const warnings = captureStderr(() => {
            loadConfig();
          });
          assert.ok(
            warnings.some(
              (w) =>
                w.includes('REACT_GRAPH_CONFIG') &&
                w.includes('RGK_CONFIG'),
            ),
          );
        },
      );
    });
  });

  describe('toGraphConfig bridge', () => {
    it('converts RgkConfig to GraphConfig correctly', () => {
      const configFile = join(TMP_DIR, 'rgk.config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          neo4j: {
            uri: 'bolt://test:7687',
            user: 'u',
            password: 'p',
            database: 'd',
          },
          indexing: {
            sourceDir: './app',
            include: ['**/*.tsx'],
            exclude: ['node_modules'],
          },
          classification: {
            layerMapping: { atoms: 'atom' },
            defaultLayer: 'component',
          },
        }),
      );

      withEnv(ALL_CONFIG_ENVS, () => {
        const rgkConfig = loadConfig(configFile);
        const graphConfig = toGraphConfig(rgkConfig);
        assert.equal(graphConfig.sourceDir, rgkConfig.indexing.sourceDir);
        assert.deepEqual(graphConfig.include, rgkConfig.indexing.include);
        assert.deepEqual(graphConfig.exclude, rgkConfig.indexing.exclude);
        assert.deepEqual(
          graphConfig.layerMapping,
          rgkConfig.classification.layerMapping,
        );
        assert.equal(
          graphConfig.defaultLayer,
          rgkConfig.classification.defaultLayer,
        );
        assert.deepEqual(graphConfig.neo4j, rgkConfig.neo4j);
      });
    });
  });
});
