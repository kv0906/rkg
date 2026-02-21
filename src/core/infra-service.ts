import { execSync, spawnSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { runDiagnostics } from './health-service.js';
import type { DiagnosticReport } from './health-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// docker-compose.yml lives at the project root (two levels up from dist/src/core/)
function getComposeFile(): string {
  return resolve(__dirname, '..', '..', '..', 'docker-compose.yml');
}

export interface InfraUpOptions {
  wait?: boolean;
  timeout?: number; // seconds, default 60
}

export interface InfraDownOptions {
  volumes?: boolean;
}

export interface InfraStatusResult {
  running: boolean;
  diagnostics: DiagnosticReport;
}

/**
 * Start Neo4j via docker compose up -d.
 * Optionally poll until Neo4j is healthy.
 */
export async function infraUp(options?: InfraUpOptions): Promise<void> {
  const composeFile = getComposeFile();
  const result = spawnSync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const msg = result.stderr?.trim() || result.stdout?.trim() || 'docker compose up failed';
    throw new Error(msg);
  }

  if (options?.wait) {
    const timeout = (options.timeout ?? 60) * 1000;
    const start = Date.now();
    const pollInterval = 2000;

    while (Date.now() - start < timeout) {
      const report = await runDiagnostics();
      const neo4jCheck = report.checks.find(c => c.check === 'neo4j-connectivity');
      if (neo4jCheck?.status === 'pass') {
        return;
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error(`Neo4j did not become ready within ${options.timeout ?? 60}s`);
  }
}

/**
 * Stop Neo4j via docker compose down. Optionally remove volumes.
 */
export function infraDown(options?: InfraDownOptions): void {
  const composeFile = getComposeFile();
  const args = ['compose', '-f', composeFile, 'down'];
  if (options?.volumes) {
    args.push('-v');
  }

  const result = spawnSync('docker', args, {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const msg = result.stderr?.trim() || result.stdout?.trim() || 'docker compose down failed';
    throw new Error(msg);
  }
}

/**
 * Report infrastructure status using health diagnostics.
 */
export async function infraStatus(): Promise<InfraStatusResult> {
  const diagnostics = await runDiagnostics();
  const neo4jCheck = diagnostics.checks.find(c => c.check === 'neo4j-connectivity');
  const running = neo4jCheck?.status === 'pass';

  return { running, diagnostics };
}
