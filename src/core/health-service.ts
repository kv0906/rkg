import neo4j from 'neo4j-driver';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { loadConfig } from '../config.js';
import { DEFAULT_CONFIG_FILE, LEGACY_CONFIG_FILE } from '../types/config.js';

export interface DiagnosticCheck {
  check: string;
  status: 'pass' | 'fail';
  message: string;
}

export interface DiagnosticReport {
  checks: DiagnosticCheck[];
}

/**
 * Check if a config file exists (rkg.config.json or graph-config.json).
 */
function checkConfigFile(): DiagnosticCheck {
  const newPath = resolve(DEFAULT_CONFIG_FILE);
  if (existsSync(newPath)) {
    return { check: 'config-file', status: 'pass', message: `Found ${DEFAULT_CONFIG_FILE}` };
  }

  const oldPath = resolve(LEGACY_CONFIG_FILE);
  if (existsSync(oldPath)) {
    return { check: 'config-file', status: 'pass', message: `Found ${LEGACY_CONFIG_FILE} (deprecated, rename to ${DEFAULT_CONFIG_FILE})` };
  }

  return { check: 'config-file', status: 'fail', message: `No config file found (expected ${DEFAULT_CONFIG_FILE})` };
}

/**
 * Check if Docker daemon is running.
 */
function checkDocker(): DiagnosticCheck {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 5000 });
    return { check: 'docker', status: 'pass', message: 'Docker is running' };
  } catch {
    return { check: 'docker', status: 'fail', message: 'Docker is not running or not installed' };
  }
}

/**
 * Check Neo4j connectivity by attempting to get server info.
 */
async function checkNeo4jConnectivity(uri: string, user: string, password: string): Promise<DiagnosticCheck> {
  let driver;
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), { connectionTimeout: 5000 });
    await driver.getServerInfo();
    return { check: 'neo4j-connectivity', status: 'pass', message: `Connected to Neo4j at ${uri}` };
  } catch (e) {
    return { check: 'neo4j-connectivity', status: 'fail', message: `Cannot connect to Neo4j at ${uri}: ${(e as Error).message}` };
  } finally {
    if (driver) {
      await driver.close();
    }
  }
}

/**
 * Check Neo4j authentication by running a simple query.
 */
async function checkNeo4jAuth(uri: string, user: string, password: string, database: string): Promise<DiagnosticCheck> {
  let driver;
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), { connectionTimeout: 5000 });
    await driver.executeQuery('RETURN 1 AS ok', {}, { database });
    return { check: 'neo4j-auth', status: 'pass', message: 'Neo4j authentication successful' };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('Unauthorized') || msg.includes('authentication') || msg.includes('credentials')) {
      return { check: 'neo4j-auth', status: 'fail', message: `Neo4j authentication failed: ${msg}` };
    }
    // If we can't connect at all, report auth as fail with connection context
    return { check: 'neo4j-auth', status: 'fail', message: `Neo4j auth check failed (connection issue): ${msg}` };
  } finally {
    if (driver) {
      await driver.close();
    }
  }
}

export interface DiagnosticOptions {
  configPath?: string;
}

/**
 * Run all diagnostic checks and return a structured health report.
 */
export async function runDiagnostics(options?: DiagnosticOptions): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = [];

  // 1. Config file check
  checks.push(checkConfigFile());

  // 2. Docker check
  checks.push(checkDocker());

  // 3. Load config for Neo4j settings
  let neo4jConfig;
  try {
    const config = loadConfig(options?.configPath);
    neo4jConfig = config.neo4j;
  } catch {
    // If config can't load, use defaults for Neo4j checks
    neo4jConfig = {
      uri: 'bolt://localhost:7687',
      user: 'neo4j',
      password: 'neo4j',
      database: 'neo4j',
    };
  }

  // 4. Neo4j connectivity check
  checks.push(await checkNeo4jConnectivity(neo4jConfig.uri, neo4jConfig.user, neo4jConfig.password));

  // 5. Neo4j auth check
  checks.push(await checkNeo4jAuth(neo4jConfig.uri, neo4jConfig.user, neo4jConfig.password, neo4jConfig.database));

  return { checks };
}
