import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.js';

// Capture stdout and stderr
function captureOutput(fn: () => number): { exitCode: number; stdout: string; stderr: string } {
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

  let exitCode: number;
  try {
    exitCode = fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { exitCode, stdout, stderr };
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
      const { exitCode, stdout } = captureOutput(() => run(['--version']));
      assert.equal(exitCode, 0);
      assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
    });
  });

  describe('version subcommand', () => {
    it('prints version and exits 0', () => {
      const { exitCode, stdout } = captureOutput(() => run(['version']));
      assert.equal(exitCode, 0);
      assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const { exitCode, stdout } = captureOutput(() => run(['--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk'));
      assert.ok(stdout.includes('Commands:'));
    });
  });

  describe('no arguments', () => {
    it('prints usage and exits 0', () => {
      const { exitCode, stdout } = captureOutput(() => run([]));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk'));
    });
  });

  describe('unknown command', () => {
    it('prints error to stderr and exits 2', () => {
      const { exitCode, stderr } = captureOutput(() => run(['foobar']));
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes('Unknown command: foobar'));
      assert.ok(stderr.includes('Usage: rgk'));
    });
  });

  describe('help subcommand', () => {
    it('prints usage when no target given', () => {
      const { exitCode, stdout } = captureOutput(() => run(['help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk'));
    });

    it('prints subcommand help for known command', () => {
      const { exitCode, stdout } = captureOutput(() => run(['help', 'infra']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk infra'));
    });

    it('prints error for unknown help target', () => {
      const { exitCode, stderr } = captureOutput(() => run(['help', 'unknown']));
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes('Unknown command: unknown'));
    });
  });

  describe('subcommand --help', () => {
    it('prints help for infra --help', () => {
      const { exitCode, stdout } = captureOutput(() => run(['infra', '--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk infra'));
    });

    it('prints help for index --help', () => {
      const { exitCode, stdout } = captureOutput(() => run(['index', '--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk index'));
    });

    it('prints help for mcp --help', () => {
      const { exitCode, stdout } = captureOutput(() => run(['mcp', '--help']));
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Usage: rgk mcp'));
    });
  });

  describe('subcommand routing', () => {
    it('routes to infra (stub returns 1)', () => {
      const { exitCode, stderr } = captureOutput(() => run(['infra', 'up']));
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('not yet implemented'));
    });

    it('routes to index (stub returns 1)', () => {
      const { exitCode, stderr } = captureOutput(() => run(['index']));
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('not yet implemented'));
    });

    it('routes to mcp (stub returns 1)', () => {
      const { exitCode, stderr } = captureOutput(() => run(['mcp', 'start']));
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('not yet implemented'));
    });
  });
});
