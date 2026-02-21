import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { runDiagnostics } from '../src/core/health-service.js';
import type { DiagnosticCheck, DiagnosticReport } from '../src/core/health-service.js';

const TMP_DIR = join(import.meta.dirname || __dirname, '__tmp_health_test__');

describe('health-service', () => {
  describe('exports', () => {
    it('runDiagnostics is an exported async function', () => {
      assert.ok(typeof runDiagnostics === 'function', 'runDiagnostics should be exported');
    });
  });

  describe('DiagnosticReport structure', () => {
    it('returns a report with checks array', async () => {
      // Run with no config file in a temp dir (Neo4j likely not running in test env)
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });
      process.chdir(TMP_DIR);
      try {
        const report = await runDiagnostics();
        assert.ok(Array.isArray(report.checks), 'report.checks should be an array');
        assert.ok(report.checks.length >= 4, `expected at least 4 checks, got ${report.checks.length}`);
      } finally {
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });

    it('each check has required fields: check, status, message', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });
      process.chdir(TMP_DIR);
      try {
        const report = await runDiagnostics();
        for (const check of report.checks) {
          assert.ok(typeof check.check === 'string', 'check.check should be a string');
          assert.ok(check.status === 'pass' || check.status === 'fail', `check.status should be pass or fail, got ${check.status}`);
          assert.ok(typeof check.message === 'string', 'check.message should be a string');
        }
      } finally {
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });

    it('includes all expected check names', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });
      process.chdir(TMP_DIR);
      try {
        const report = await runDiagnostics();
        const checkNames = report.checks.map(c => c.check);
        assert.ok(checkNames.includes('config-file'), 'should include config-file check');
        assert.ok(checkNames.includes('docker'), 'should include docker check');
        assert.ok(checkNames.includes('neo4j-connectivity'), 'should include neo4j-connectivity check');
        assert.ok(checkNames.includes('neo4j-auth'), 'should include neo4j-auth check');
      } finally {
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });
  });

  describe('missing-config scenario', () => {
    it('reports config-file as fail when no config file exists', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });
      process.chdir(TMP_DIR);

      // Clear config env vars so loadConfig uses defaults
      const saved: Record<string, string | undefined> = {};
      const envsToClear = ['RGK_CONFIG', 'REACT_GRAPH_CONFIG'];
      for (const key of envsToClear) {
        saved[key] = process.env[key];
        delete process.env[key];
      }

      try {
        const report = await runDiagnostics();
        const configCheck = report.checks.find(c => c.check === 'config-file');
        assert.ok(configCheck, 'should have config-file check');
        assert.equal(configCheck!.status, 'fail', 'config-file should fail when no config exists');
        assert.ok(configCheck!.message.includes('No config file found'), `message should indicate missing config, got: ${configCheck!.message}`);
      } finally {
        for (const [key, val] of Object.entries(saved)) {
          if (val === undefined) delete process.env[key];
          else process.env[key] = val;
        }
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });
  });

  describe('config-file-present scenario', () => {
    it('reports config-file as pass when rgk.config.json exists', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });
      writeFileSync(
        join(TMP_DIR, 'rgk.config.json'),
        JSON.stringify({
          neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'neo4j', database: 'neo4j' },
          indexing: { sourceDir: '.', include: ['**/*.ts'], exclude: [] },
          classification: { layerMapping: {}, defaultLayer: 'unknown' },
        }),
      );
      process.chdir(TMP_DIR);

      const saved: Record<string, string | undefined> = {};
      const envsToClear = ['RGK_CONFIG', 'REACT_GRAPH_CONFIG'];
      for (const key of envsToClear) {
        saved[key] = process.env[key];
        delete process.env[key];
      }

      try {
        const report = await runDiagnostics();
        const configCheck = report.checks.find(c => c.check === 'config-file');
        assert.ok(configCheck, 'should have config-file check');
        assert.equal(configCheck!.status, 'pass', 'config-file should pass when rgk.config.json exists');
        assert.ok(configCheck!.message.includes('rgk.config.json'), `message should mention rgk.config.json, got: ${configCheck!.message}`);
      } finally {
        for (const [key, val] of Object.entries(saved)) {
          if (val === undefined) delete process.env[key];
          else process.env[key] = val;
        }
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });

    it('reports config-file as pass with deprecation note for graph-config.json', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });
      writeFileSync(
        join(TMP_DIR, 'graph-config.json'),
        JSON.stringify({
          sourceDir: '.',
          include: ['**/*.ts'],
          exclude: [],
          layerMapping: {},
          defaultLayer: 'unknown',
        }),
      );
      process.chdir(TMP_DIR);

      const saved: Record<string, string | undefined> = {};
      const envsToClear = ['RGK_CONFIG', 'REACT_GRAPH_CONFIG'];
      for (const key of envsToClear) {
        saved[key] = process.env[key];
        delete process.env[key];
      }

      try {
        const report = await runDiagnostics();
        const configCheck = report.checks.find(c => c.check === 'config-file');
        assert.ok(configCheck, 'should have config-file check');
        assert.equal(configCheck!.status, 'pass', 'config-file should pass when graph-config.json exists');
        assert.ok(configCheck!.message.includes('graph-config.json'), `message should mention graph-config.json, got: ${configCheck!.message}`);
        assert.ok(configCheck!.message.includes('deprecated'), `message should mention deprecated, got: ${configCheck!.message}`);
      } finally {
        for (const [key, val] of Object.entries(saved)) {
          if (val === undefined) delete process.env[key];
          else process.env[key] = val;
        }
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });
  });

  describe('neo4j-down scenario', () => {
    it('reports neo4j checks as fail when Neo4j is not running', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });

      // Write config pointing to a port where Neo4j is definitely not running
      writeFileSync(
        join(TMP_DIR, 'rgk.config.json'),
        JSON.stringify({
          neo4j: { uri: 'bolt://localhost:19999', user: 'neo4j', password: 'neo4j', database: 'neo4j' },
          indexing: { sourceDir: '.', include: ['**/*.ts'], exclude: [] },
          classification: { layerMapping: {}, defaultLayer: 'unknown' },
        }),
      );
      process.chdir(TMP_DIR);

      const saved: Record<string, string | undefined> = {};
      const envsToClear = ['RGK_CONFIG', 'REACT_GRAPH_CONFIG', 'RGK_NEO4J_URI', 'NEO4J_URI'];
      for (const key of envsToClear) {
        saved[key] = process.env[key];
        delete process.env[key];
      }

      // Suppress config deprecation warnings during test
      const origError = console.error;
      console.error = () => {};

      try {
        const report = await runDiagnostics();
        const connCheck = report.checks.find(c => c.check === 'neo4j-connectivity');
        assert.ok(connCheck, 'should have neo4j-connectivity check');
        assert.equal(connCheck!.status, 'fail', 'neo4j-connectivity should fail when Neo4j is down');
        assert.ok(connCheck!.message.includes('Cannot connect'), `message should indicate connection failure, got: ${connCheck!.message}`);

        const authCheck = report.checks.find(c => c.check === 'neo4j-auth');
        assert.ok(authCheck, 'should have neo4j-auth check');
        assert.equal(authCheck!.status, 'fail', 'neo4j-auth should fail when Neo4j is down');
      } finally {
        console.error = origError;
        for (const [key, val] of Object.entries(saved)) {
          if (val === undefined) delete process.env[key];
          else process.env[key] = val;
        }
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });
  });

  describe('all-healthy scenario (structure validation)', () => {
    it('all checks return valid status values', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });
      process.chdir(TMP_DIR);
      try {
        const report = await runDiagnostics();
        for (const check of report.checks) {
          assert.ok(
            ['pass', 'fail'].includes(check.status),
            `check "${check.check}" has invalid status: ${check.status}`,
          );
          assert.ok(check.message.length > 0, `check "${check.check}" should have a non-empty message`);
        }
      } finally {
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });
  });

  describe('configPath option', () => {
    it('accepts configPath option to override config location', async () => {
      const originalCwd = process.cwd();
      mkdirSync(TMP_DIR, { recursive: true });

      const configFile = join(TMP_DIR, 'custom-config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          neo4j: { uri: 'bolt://localhost:19998', user: 'test', password: 'test', database: 'testdb' },
          indexing: { sourceDir: '.', include: ['**/*.ts'], exclude: [] },
          classification: { layerMapping: {}, defaultLayer: 'unknown' },
        }),
      );
      process.chdir(TMP_DIR);

      // Suppress config deprecation warnings during test
      const origError = console.error;
      console.error = () => {};

      try {
        const report = await runDiagnostics({ configPath: configFile });
        // Should use the custom config's Neo4j URI
        const connCheck = report.checks.find(c => c.check === 'neo4j-connectivity');
        assert.ok(connCheck, 'should have neo4j-connectivity check');
        assert.ok(connCheck!.message.includes('localhost:19998'), `should use custom config URI, got: ${connCheck!.message}`);
      } finally {
        console.error = origError;
        process.chdir(originalCwd);
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    });
  });
});
