/**
 * RGK configuration interfaces.
 *
 * Env var names:
 *   RGK_CONFIG           - path to config file (default: rgk.config.json)
 *   RGK_NEO4J_URI        - Neo4j connection URI
 *   RGK_NEO4J_USER       - Neo4j username
 *   RGK_NEO4J_PASSWORD   - Neo4j password
 *   RGK_NEO4J_DATABASE   - Neo4j database name
 *
 * Default config file: rgk.config.json
 */

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database: string;
}

export interface IndexingConfig {
  sourceDir: string;
  include: string[];
  exclude: string[];
}

export interface ClassificationRule {
  glob: string;
  kind?: string;
  domain?: string;
  layer?: string;
}

export interface ClassificationConfig {
  layerMapping: Record<string, string>;
  defaultLayer: string;
  rules?: ClassificationRule[];
}

export interface RgkConfig {
  neo4j: Neo4jConfig;
  indexing: IndexingConfig;
  classification: ClassificationConfig;
}

export const DEFAULT_CONFIG_FILE = 'rgk.config.json';
export const LEGACY_CONFIG_FILE = 'graph-config.json';

export const RGK_ENV = {
  CONFIG: 'RGK_CONFIG',
  NEO4J_URI: 'RGK_NEO4J_URI',
  NEO4J_USER: 'RGK_NEO4J_USER',
  NEO4J_PASSWORD: 'RGK_NEO4J_PASSWORD',
  NEO4J_DATABASE: 'RGK_NEO4J_DATABASE',
} as const;
