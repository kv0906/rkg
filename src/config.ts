import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import type { GraphConfig } from './types.js';
import type { RgkConfig, Neo4jConfig } from './types/config.js';
import { DEFAULT_CONFIG_FILE, LEGACY_CONFIG_FILE, RGK_ENV } from './types/config.js';

const LEGACY_ENV = {
  CONFIG: 'REACT_GRAPH_CONFIG',
  NEO4J_URI: 'NEO4J_URI',
  NEO4J_USER: 'NEO4J_USER',
  NEO4J_PASSWORD: 'NEO4J_PASSWORD',
  NEO4J_DATABASE: 'NEO4J_DATABASE',
} as const;

const DEPRECATION_MAP: Record<string, string> = {
  [LEGACY_ENV.CONFIG]: RGK_ENV.CONFIG,
  [LEGACY_ENV.NEO4J_URI]: RGK_ENV.NEO4J_URI,
  [LEGACY_ENV.NEO4J_USER]: RGK_ENV.NEO4J_USER,
  [LEGACY_ENV.NEO4J_PASSWORD]: RGK_ENV.NEO4J_PASSWORD,
  [LEGACY_ENV.NEO4J_DATABASE]: RGK_ENV.NEO4J_DATABASE,
};

const DEFAULT_NEO4J: Neo4jConfig = {
  uri: 'bolt://localhost:7687',
  user: 'neo4j',
  password: 'neo4j',
  database: 'neo4j',
};

/**
 * Read an env var with deprecation fallback.
 * Checks new RGK_ name first, falls back to legacy name with stderr warning.
 */
function envWithDeprecation(
  newName: string,
  oldName: string,
  warnings: string[],
): string | undefined {
  const newVal = process.env[newName];
  const oldVal = process.env[oldName];

  if (newVal !== undefined) {
    return newVal;
  }
  if (oldVal !== undefined) {
    warnings.push(
      `[rgk] Deprecation: env var ${oldName} is deprecated. Use ${DEPRECATION_MAP[oldName]} instead.`,
    );
    return oldVal;
  }
  return undefined;
}

/**
 * Resolve config file path.
 * Priority: configPath arg > RGK_CONFIG env > REACT_GRAPH_CONFIG env > rgk.config.json > graph-config.json
 */
function resolveConfigPath(
  configPath: string | undefined,
  warnings: string[],
): string | null {
  // Explicit CLI flag
  if (configPath) {
    return resolve(configPath);
  }

  // RGK_CONFIG env var (new)
  const rgkConfig = process.env[RGK_ENV.CONFIG];
  if (rgkConfig) {
    return resolve(rgkConfig);
  }

  // REACT_GRAPH_CONFIG env var (legacy)
  const legacyConfig = process.env[LEGACY_ENV.CONFIG];
  if (legacyConfig) {
    warnings.push(
      `[rgk] Deprecation: env var ${LEGACY_ENV.CONFIG} is deprecated. Use ${RGK_ENV.CONFIG} instead.`,
    );
    return resolve(legacyConfig);
  }

  // Default file discovery
  const newPath = resolve(DEFAULT_CONFIG_FILE);
  if (existsSync(newPath)) {
    return newPath;
  }

  const oldPath = resolve(LEGACY_CONFIG_FILE);
  if (existsSync(oldPath)) {
    warnings.push(
      `[rgk] Deprecation: config file ${LEGACY_CONFIG_FILE} is deprecated. Rename to ${DEFAULT_CONFIG_FILE}.`,
    );
    return oldPath;
  }

  // No config file found - use defaults only
  return null;
}

/**
 * Parse a config file (supports both new nested and legacy flat formats).
 */
function parseConfigFile(absolutePath: string): {
  raw: Record<string, unknown>;
  isLegacyFormat: boolean;
} {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(absolutePath, 'utf-8'));
  } catch (e) {
    throw new Error(
      `Failed to load config from ${absolutePath}: ${(e as Error).message}`,
    );
  }

  // Detect format: new format has "indexing" key, legacy has "sourceDir" at top level
  const isLegacyFormat = !raw.indexing && typeof raw.sourceDir === 'string';
  return { raw, isLegacyFormat };
}

/**
 * Build RgkConfig from a parsed config file, env vars, and defaults.
 * Precedence: CLI flags > RGK_ env vars > legacy env vars > config file > defaults
 */
function buildConfig(
  raw: Record<string, unknown> | null,
  isLegacyFormat: boolean,
  configDir: string,
  warnings: string[],
): RgkConfig {
  // Extract file-level values based on format
  let fileNeo4j: Partial<Neo4jConfig> = {};
  let fileSourceDir: string | undefined;
  let fileInclude: string[] | undefined;
  let fileExclude: string[] | undefined;
  let fileLayerMapping: Record<string, string> | undefined;
  let fileDefaultLayer: string | undefined;

  if (raw && isLegacyFormat) {
    // Legacy flat format
    fileSourceDir = raw.sourceDir as string | undefined;
    fileInclude = raw.include as string[] | undefined;
    fileExclude = raw.exclude as string[] | undefined;
    fileLayerMapping = raw.layerMapping as Record<string, string> | undefined;
    fileDefaultLayer = raw.defaultLayer as string | undefined;
    fileNeo4j = (raw.neo4j || {}) as Partial<Neo4jConfig>;
  } else if (raw && !isLegacyFormat) {
    // New nested format
    const indexing = (raw.indexing || {}) as Record<string, unknown>;
    const classification = (raw.classification || {}) as Record<
      string,
      unknown
    >;
    fileSourceDir = indexing.sourceDir as string | undefined;
    fileInclude = indexing.include as string[] | undefined;
    fileExclude = indexing.exclude as string[] | undefined;
    fileLayerMapping = classification.layerMapping as
      | Record<string, string>
      | undefined;
    fileDefaultLayer = classification.defaultLayer as string | undefined;
    fileNeo4j = (raw.neo4j || {}) as Partial<Neo4jConfig>;
  }

  // Neo4j config: env vars > config file > defaults
  const neo4j: Neo4jConfig = {
    uri:
      envWithDeprecation(RGK_ENV.NEO4J_URI, LEGACY_ENV.NEO4J_URI, warnings) ||
      fileNeo4j.uri ||
      DEFAULT_NEO4J.uri,
    user:
      envWithDeprecation(
        RGK_ENV.NEO4J_USER,
        LEGACY_ENV.NEO4J_USER,
        warnings,
      ) ||
      fileNeo4j.user ||
      DEFAULT_NEO4J.user,
    password:
      envWithDeprecation(
        RGK_ENV.NEO4J_PASSWORD,
        LEGACY_ENV.NEO4J_PASSWORD,
        warnings,
      ) ||
      fileNeo4j.password ||
      DEFAULT_NEO4J.password,
    database:
      envWithDeprecation(
        RGK_ENV.NEO4J_DATABASE,
        LEGACY_ENV.NEO4J_DATABASE,
        warnings,
      ) ||
      fileNeo4j.database ||
      DEFAULT_NEO4J.database,
  };

  // Resolve sourceDir relative to config file directory
  const sourceDir = fileSourceDir
    ? resolve(configDir, fileSourceDir)
    : resolve('.');

  return {
    neo4j,
    indexing: {
      sourceDir,
      include: fileInclude || ['**/*.tsx', '**/*.ts'],
      exclude: fileExclude || [],
    },
    classification: {
      layerMapping: fileLayerMapping || {},
      defaultLayer: fileDefaultLayer || 'unknown',
    },
  };
}

export function loadConfig(configPath?: string): RgkConfig {
  const warnings: string[] = [];

  const resolvedPath = resolveConfigPath(configPath, warnings);

  let config: RgkConfig;

  if (resolvedPath && existsSync(resolvedPath)) {
    const { raw, isLegacyFormat } = parseConfigFile(resolvedPath);
    const configDir = dirname(resolvedPath);
    config = buildConfig(raw, isLegacyFormat, configDir, warnings);
  } else if (resolvedPath) {
    // Path was explicitly specified but doesn't exist
    throw new Error(`Config file not found: ${resolvedPath}`);
  } else {
    // No config file - use pure defaults + env vars
    config = buildConfig(null, false, resolve('.'), warnings);
  }

  // Print all deprecation warnings to stderr
  for (const warning of warnings) {
    console.error(warning);
  }

  return config;
}

/**
 * Convert RgkConfig to legacy GraphConfig for backward compatibility.
 */
export function toGraphConfig(rgk: RgkConfig): GraphConfig {
  return {
    sourceDir: rgk.indexing.sourceDir,
    include: rgk.indexing.include,
    exclude: rgk.indexing.exclude,
    layerMapping: rgk.classification.layerMapping,
    defaultLayer: rgk.classification.defaultLayer,
    neo4j: rgk.neo4j,
  };
}
