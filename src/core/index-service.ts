import { parseCodebase } from '../parser.js';
import {
  clearGraph,
  ingestComponents,
  ingestDependencies,
  ingestModules,
  ingestLayers,
  ingestProps,
  ingestHooks,
} from '../db.js';
import { buildEmbeddingText, generateEmbedding } from './embedding.js';
import { toGraphConfig } from '../config.js';
import type { RkgConfig } from '../types/config.js';
import type { GraphConfig } from '../types.js';

export interface IndexOptions {
  workspacePath?: string;
  configPath?: string;
  outputFormat?: 'human' | 'json';
  config?: RkgConfig;
}

export interface ClassificationSummary {
  [layer: string]: number;
}

export interface IndexResult {
  nodeCount: number;
  edgeCount: number;
  classificationSummary: ClassificationSummary;
}

/**
 * Run the indexing pipeline: parse workspace -> clear graph -> ingest nodes/edges -> return stats.
 */
export async function runIndex(options: IndexOptions): Promise<IndexResult> {
  // Build GraphConfig from RkgConfig or options
  let graphConfig: GraphConfig;

  if (options.config) {
    graphConfig = toGraphConfig(options.config);
  } else {
    // Caller must provide config
    throw new Error('config is required in IndexOptions');
  }

  // Override sourceDir if workspacePath is provided
  if (options.workspacePath) {
    graphConfig = { ...graphConfig, sourceDir: options.workspacePath };
  }

  const database = graphConfig.neo4j.database;

  // 1. Parse workspace with ts-morph
  const parseResult = parseCodebase(graphConfig);

  // 1b. Generate embeddings for each component
  for (const comp of parseResult.components) {
    const text = buildEmbeddingText(comp);
    comp.embedding = await generateEmbedding(text);
  }

  // 2. Clear existing graph
  await clearGraph(database);

  // 3. Ingest nodes and edges
  await ingestComponents(parseResult.components, database);
  await ingestDependencies(parseResult.dependencies, database);
  await ingestModules(parseResult.modules, parseResult.components, database);
  await ingestLayers(parseResult.layers, parseResult.components, database);
  await ingestProps(parseResult.components, database);
  await ingestHooks(parseResult.components, database);

  // 4. Build classification summary (count per layer)
  const classificationSummary: ClassificationSummary = {};
  for (const component of parseResult.components) {
    classificationSummary[component.layer] =
      (classificationSummary[component.layer] || 0) + 1;
  }

  return {
    nodeCount: parseResult.components.length,
    edgeCount: parseResult.dependencies.length,
    classificationSummary,
  };
}
