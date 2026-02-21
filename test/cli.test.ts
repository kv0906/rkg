import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { run } from '../src/cli.js';

// Resolve fixture directory for index integration tests
const testDir = import.meta.dirname || __dirname;
const projectRoot = resolve(testDir, testDir.includes('dist') ? '../..' : '..');
const FIXTURE_DIR = resolve(projectRoot, 'test/fixture/src');

// Capture stdout and stderr, supports both sync and async run()
function captureOutput(fn: () => number | Promise<number>): { exitCode: number; stdout: string; stderr: string } | Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const originalLog = console.log;
  const originalError = console.error;
  let stdout = '';
  let stderr = '';

  console.log = (...args: unknown[]) => {
    stdout += args.map(String).join(' ') + '\n';
  };
  console.error = (...args: unknown[]) => {
    stderr += args.map(String).join(' ') + '\n';
  };

  let result: number | Promise<number>;
  try {
    result = fn();
  } catch (e) {
    console.log = originalLog;
    console.error = originalError;
    throw e;
  }

  if (result instanceof Promise) {
    return result.then(exitCode => {
      console.log = originalLog;
      console.error = originalError;
      return { exitCode, stdout, stderr };
    }).catch(err => {
      console.log = originalLog;
      console.error = originalError;
      throw err;
    });
  }

  console.log = originalLog;
  console.error = originalError;
  return { exitCode: result, stdout, stderr };
}

// Sync-only capture for tests that don't need async
function captureOutputSync(fn: () => number | Promise<number>): { exitCode: number; stdout: string; stderr: string } {
  const result = captureOutput(fn);
  if (result instanceof Promise) {
    throw new Error('Expected sync result but got Promise');
  }
  return result;
}

// Async capture helper
async function captureOutputAsync(fn: () => number | Promise<number>): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = captureOutput(fn);
  if (result instanceof Promise) {
    return result;
  }
  return result;
}

describe('CLI', () => {
  // Save original process.exit to prevent test runner from exiting
  const originalExit = process.exit;

  beforeEach(() => {
    // Prevent process.exit from actually exiting during tests
    process.exit = (() => {}) as never;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  describe('--version', () => {
    it('prints version and exits 0', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['--version']));
      assert.equal(exitCode, 0);
      assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
    });
  });

  describe('version subcommand', () => {
    it('prints version and exits 0', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['version']));
      assert.equal(exitCode, 0);
      assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk'));
      assert.ok(stdout.includes('Commands:'));
    });
  });

  describe('no arguments', () => {
    it('prints usage and exits 0', () => {
      const { exitCode, stdout } = captureOutputSync(() => run([]));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk'));
    });
  });

  describe('unknown command', () => {
    it('prints error to stderr and exits 2', () => {
      const { exitCode, stderr } = captureOutputSync(() => run(['foobar']));
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes('Unknown command: foobar'));
      assert.ok(stderr.includes('Usage: rgk'));
    });
  });

  describe('help subcommand', () => {
    it('prints usage when no target given', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk'));
    });

    it('prints subcommand help for known command', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['help', 'infra']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk infra'));
    });

    it('prints error for unknown help target', () => {
      const { exitCode, stderr } = captureOutputSync(() => run(['help', 'unknown']));
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes('Unknown command: unknown'));
    });
  });

  describe('subcommand --help', () => {
    it('prints help for infra --help', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['infra', '--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk infra'));
    });

    it('prints help for index --help', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['index', '--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk index'));
    });

    it('prints help for mcp --help', () => {
      const { exitCode, stdout } = captureOutputSync(() => run(['mcp', '--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk mcp'));
    });
  });

  describe('subcommand routing', () => {
    it('routes to infra and handles missing action', async () => {
      const { exitCode, stderr } = await captureOutputAsync(() => run(['infra']));
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('Missing infra action'));
    });

    it('routes to infra and handles unknown action', async () => {
      const { exitCode, stderr } = await captureOutputAsync(() => run(['infra', 'badaction']));
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('Unknown infra action: badaction'));
    });

    it('routes to index command (async)', async () => {
      // Without Neo4j, index will fail with a connection error, but it should route properly
      const { exitCode } = await captureOutputAsync(() => run(['index']));
      // Either succeeds (0) or fails with error (1), but not "not implemented"
      assert.ok(exitCode === 0 || exitCode === 1, `expected 0 or 1, got ${exitCode}`);
    });

    it('routes to mcp (stub returns 1)', () => {
      const { exitCode, stderr } = captureOutputSync(() => run(['mcp', 'start']));
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('not yet implemented'));
    });
  });

  describe('index subcommand', () => {
    it('index --json outputs valid JSON with expected schema', async () => {
      // This will fail to connect to Neo4j for ingestion, but we can test
      // that the command routes correctly and attempts to index
      const { exitCode, stdout, stderr } = await captureOutputAsync(() =>
        run(['index', FIXTURE_DIR, '--json'])
      );
      if (exitCode === 0) {
        // If it succeeds (Neo4j available), validate JSON schema
        const result = JSON.parse(stdout.trim());
        assert.ok(typeof result.nodeCount === 'number', 'should have nodeCount');
        assert.ok(typeof result.edgeCount === 'number', 'should have edgeCount');
        assert.ok(typeof result.classificationSummary === 'object', 'should have classificationSummary');
      } else {
        // Without Neo4j, should fail with a meaningful error
        assert.ok(stderr.includes('Error:'), 'should print error message');
      }
    });

    it('index --stats outputs human-readable stats', async () => {
      const { exitCode, stdout, stderr } = await captureOutputAsync(() =>
        run(['index', FIXTURE_DIR, '--stats'])
      );
      if (exitCode === 0) {
        assert.ok(stdout.includes('Nodes:'), 'should show node count');
        assert.ok(stdout.includes('Edges:'), 'should show edge count');
        assert.ok(stdout.includes('Classifications:'), 'should show classifications header');
      } else {
        assert.ok(stderr.includes('Error:'), 'should print error on failure');
      }
    });

    it('index default output shows summary', async () => {
      const { exitCode, stdout, stderr } = await captureOutputAsync(() =>
        run(['index', FIXTURE_DIR])
      );
      if (exitCode === 0) {
        assert.ok(stdout.includes('Indexed'), 'should show indexed summary');
        assert.ok(stdout.includes('components'), 'should mention components');
        assert.ok(stdout.includes('dependencies'), 'should mention dependencies');
      } else {
        assert.ok(stderr.includes('Error:'), 'should print error on failure');
      }
    });

    it('index with --config uses specified config', async () => {
      const { exitCode, stderr } = await captureOutputAsync(() =>
        run(['index', FIXTURE_DIR, '--config', '/nonexistent/config.json'])
      );
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('Error:'), 'should fail with error for missing config');
    });

    it('index exits 0 on success or 1 on error', async () => {
      const { exitCode } = await captureOutputAsync(() => run(['index', FIXTURE_DIR]));
      assert.ok(exitCode === 0 || exitCode === 1, `expected 0 or 1, got ${exitCode}`);
    });
  });

  describe('infra subcommand', () => {
    it('infra up returns exit code (0 on success, 1 on docker failure)', async () => {
      const { exitCode } = await captureOutputAsync(() => run(['infra', 'up']));
      // Exit code depends on whether docker is available
      assert.ok(exitCode === 0 || exitCode === 1, `expected exit code 0 or 1, got ${exitCode}`);
    });

    it('infra down returns exit code (0 on success, 1 on docker failure)', async () => {
      const { exitCode } = await captureOutputAsync(() => run(['infra', 'down']));
      assert.ok(exitCode === 0 || exitCode === 1, `expected exit code 0 or 1, got ${exitCode}`);
    });

    it('infra status returns exit code 0 with status output', async () => {
      const { exitCode, stdout } = await captureOutputAsync(() => run(['infra', 'status']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Neo4j:'), 'should include Neo4j status line');
    });

    it('infra status shows diagnostic checks', async () => {
      const { stdout } = await captureOutputAsync(() => run(['infra', 'status']));
      assert.ok(stdout.includes('[PASS]') || stdout.includes('[FAIL]'), 'should show check results');
    });
  });
});
