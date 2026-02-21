import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { GraphConfig, Neo4jConnectionConfig } from './types.js';

const DEFAULT_NEO4J: Neo4jConnectionConfig = {
  uri: 'bolt://localhost:7687',
  user: 'neo4j',
  password: 'neo4j',
  database: 'neo4j',
};

export function loadConfig(configPath?: string): GraphConfig {
  const resolvedPath = configPath || process.env.REACT_GRAPH_CONFIG || './graph-config.json';
  const absolutePath = resolve(resolvedPath);

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(absolutePath, 'utf-8'));
  } catch (e) {
    throw new Error(`Failed to load config from ${absolutePath}: ${(e as Error).message}`);
  }

  if (!raw.sourceDir || typeof raw.sourceDir !== 'string') {
    throw new Error('Config requires "sourceDir" (string)');
  }
  if (!Array.isArray(raw.include) || raw.include.length === 0) {
    throw new Error('Config requires "include" (non-empty string array)');
  }
  if (!raw.layerMapping || typeof raw.layerMapping !== 'object') {
    throw new Error('Config requires "layerMapping" (object)');
  }

  // Resolve sourceDir relative to config file location
  const configDir = resolve(absolutePath, '..');
  const sourceDir = resolve(configDir, raw.sourceDir as string);

  // Neo4j config with env var overrides
  const rawNeo4j = (raw.neo4j || {}) as Partial<Neo4jConnectionConfig>;
  const neo4j: Neo4jConnectionConfig = {
    uri: process.env.NEO4J_URI || rawNeo4j.uri || DEFAULT_NEO4J.uri,
    user: process.env.NEO4J_USER || rawNeo4j.user || DEFAULT_NEO4J.user,
    password: process.env.NEO4J_PASSWORD || rawNeo4j.password || DEFAULT_NEO4J.password,
    database: process.env.NEO4J_DATABASE || rawNeo4j.database || DEFAULT_NEO4J.database,
  };

  return {
    sourceDir,
    include: raw.include as string[],
    exclude: (raw.exclude as string[]) || [],
    layerMapping: raw.layerMapping as Record<string, string>,
    defaultLayer: (raw.defaultLayer as string) || 'unknown',
    neo4j,
  };
}
