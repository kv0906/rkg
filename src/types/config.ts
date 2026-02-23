/**
 * RKG configuration interfaces.
 *
 * Env var names:
 *   RKG_CONFIG           - path to config file (default: rkg.config.json)
 *   RKG_NEO4J_URI        - Neo4j connection URI
 *   RKG_NEO4J_USER       - Neo4j username
 *   RKG_NEO4J_PASSWORD   - Neo4j password
 *   RKG_NEO4J_DATABASE   - Neo4j database name
 *
 * Default config file: rkg.config.json
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

export interface RkgConfig {
  neo4j: Neo4jConfig;
  indexing: IndexingConfig;
  classification: ClassificationConfig;
}

export const DEFAULT_CONFIG_FILE = 'rkg.config.json';
export const LEGACY_CONFIG_FILE = 'graph-config.json';

export const RKG_ENV = {
  CONFIG: 'RKG_CONFIG',
  NEO4J_URI: 'RKG_NEO4J_URI',
  NEO4J_USER: 'RKG_NEO4J_USER',
  NEO4J_PASSWORD: 'RKG_NEO4J_PASSWORD',
  NEO4J_DATABASE: 'RKG_NEO4J_DATABASE',
} as const;
