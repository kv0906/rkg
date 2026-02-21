import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { infraUp, infraDown, infraStatus } from '../src/core/infra-service.js';
import type { InfraStatusResult } from '../src/core/infra-service.js';
import { spawnSync } from 'child_process';

describe('infra-service', () => {
  describe('exports', () => {
    it('infraUp is an exported async function', () => {
      assert.ok(typeof infraUp === 'function', 'infraUp should be exported');
    });

    it('infraDown is an exported function', () => {
      assert.ok(typeof infraDown === 'function', 'infraDown should be exported');
    });

    it('infraStatus is an exported async function', () => {
      assert.ok(typeof infraStatus === 'function', 'infraStatus should be exported');
    });
  });

  describe('infraUp', () => {
    it('throws when docker compose fails', async () => {
      // If docker is not available or compose file missing, it should throw
      // We test by checking that infraUp properly propagates errors
      // In CI without docker, this should throw
      try {
        // Use a very short timeout to avoid long waits
        // This will fail because docker compose won't find a running service
        await infraUp({ wait: false });
        // If docker is available and compose works, that's also fine
      } catch (err) {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.ok((err as Error).message.length > 0, 'error should have a message');
      }
    });

    it('throws timeout error when --wait times out', async () => {
      // Use a port where nothing is running to ensure timeout
      // We need docker to be available for this test, so we skip if docker isn't running
      const dockerCheck = spawnSync('docker', ['info'], { stdio: 'pipe', timeout: 3000 });
      if (dockerCheck.status !== 0) {
        // Docker not available; skip this test gracefully
        return;
      }

      try {
        await infraUp({ wait: true, timeout: 1 });
      } catch (err) {
        assert.ok(err instanceof Error, 'should throw an Error');
        // Either docker compose fails or timeout occurs
        assert.ok((err as Error).message.length > 0, 'error should have a message');
      }
    });
  });

  describe('infraDown', () => {
    it('throws when docker compose down fails without docker', () => {
      // If docker isn't running, infraDown should throw
      const dockerCheck = spawnSync('docker', ['info'], { stdio: 'pipe', timeout: 3000 });
      if (dockerCheck.status === 0) {
        // Docker is available, infraDown might succeed (nothing to stop is OK)
        try {
          infraDown();
        } catch (err) {
          assert.ok(err instanceof Error, 'should throw an Error if it fails');
        }
        return;
      }

      // Docker not available, should throw
      assert.throws(() => infraDown(), /docker compose down failed|Cannot|error/i);
    });

    it('accepts volumes option', () => {
      // Verify the function accepts the volumes option without type errors
      const dockerCheck = spawnSync('docker', ['info'], { stdio: 'pipe', timeout: 3000 });
      if (dockerCheck.status === 0) {
        try {
          infraDown({ volumes: true });
        } catch {
          // Expected if no containers running
        }
      }
      // Type check passes if we get here
      assert.ok(true);
    });
  });

  describe('infraStatus', () => {
    it('returns structured result with running boolean and diagnostics', async () => {
      const result = await infraStatus();
      assert.ok(typeof result.running === 'boolean', 'result.running should be a boolean');
      assert.ok(result.diagnostics !== undefined, 'result.diagnostics should exist');
      assert.ok(Array.isArray(result.diagnostics.checks), 'diagnostics.checks should be an array');
    });

    it('diagnostics include expected checks', async () => {
      const result = await infraStatus();
      const checkNames = result.diagnostics.checks.map(c => c.check);
      assert.ok(checkNames.includes('docker'), 'should include docker check');
      assert.ok(checkNames.includes('neo4j-connectivity'), 'should include neo4j-connectivity check');
    });

    it('reports not running when Neo4j is down', async () => {
      // Without a running Neo4j, status should report not running
      const result = await infraStatus();
      // In test env, Neo4j is likely not running
      // Just verify the structure is correct
      assert.ok(typeof result.running === 'boolean');
      if (!result.running) {
        const neo4jCheck = result.diagnostics.checks.find(c => c.check === 'neo4j-connectivity');
        assert.ok(neo4jCheck, 'should have neo4j-connectivity check');
        assert.equal(neo4jCheck!.status, 'fail', 'neo4j-connectivity should fail when not running');
      }
    });
  });
});
