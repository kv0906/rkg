export interface Neo4jConnectionConfig {
  uri: string;
  user: string;
  password: string;
  database?: string;
}

export interface GraphConfig {
  sourceDir: string;
  include: string[];
  exclude: string[];
  layerMapping: Record<string, string>;
  defaultLayer: string;
  neo4j: Neo4jConnectionConfig;
}

export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

export interface ParsedComponent {
  name: string;
  filePath: string;
  layer: string;
  exportType: 'default' | 'named' | 'barrel';
  hasState: boolean;
  props: PropInfo[];
  description: string;
  hooks: string[];
}

export interface ParsedDependency {
  sourceFile: string;
  targetFile: string;
  importType: 'direct' | 'reexport';
}

export interface ParsedModule {
  path: string;
  name: string;
  parentPath: string | null;
}

export interface ParseResult {
  components: ParsedComponent[];
  dependencies: ParsedDependency[];
  modules: ParsedModule[];
  layers: string[];
}

export interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  suggestion?: string;
  metadata?: { elapsed_ms: number };
}
