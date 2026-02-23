import { Project, SourceFile, Node } from 'ts-morph';
import { resolve, relative, dirname, basename } from 'path';
import { existsSync } from 'fs';
import type { GraphConfig, ParsedComponent, ParsedDependency, ParsedModule, ParseResult, PropInfo } from './types.js';

const NON_COMPONENT_NAME_SUFFIXES = [
  'Props',
  'Config',
  'Options',
  'Context',
  'Type',
  'Schema',
  'Api',
  'Enum',
  'State',
  'Action',
  'Reducer',
];

const NEXTJS_METADATA_FILES = new Set([
  'sitemap',
  'robots',
  'opengraph-image',
  'twitter-image',
  'manifest',
  'instrumentation',
  'global-error',
]);

export function parseCodebase(config: GraphConfig): ParseResult {
  const project = new Project({
    tsConfigFilePath: findTsConfig(config.sourceDir),
    skipAddingFilesFromTsConfig: true,
  });

  // Add source files matching include/exclude patterns
  const globPatterns = config.include.map(p => resolve(config.sourceDir, p));
  project.addSourceFilesAtPaths(globPatterns);

  // Remove excluded files
  for (const pattern of config.exclude) {
    const excluded = project.getSourceFiles(resolve(config.sourceDir, pattern));
    for (const f of excluded) {
      project.removeSourceFile(f);
    }
  }

  const sourceFiles = project.getSourceFiles();
  const components: ParsedComponent[] = [];
  const dependencies: ParsedDependency[] = [];

  // First pass: identify barrel files and all components
  const barrelFiles = new Set<string>();
  const componentFiles = new Map<string, ParsedComponent>();

  for (const sourceFile of sourceFiles) {
    const filePath = relative(config.sourceDir, sourceFile.getFilePath());
    const fileName = basename(sourceFile.getFilePath(), sourceFile.getExtension());
    const fileExtension = sourceFile.getExtension();

    if (isBarrelFile(sourceFile, fileName)) {
      barrelFiles.add(filePath);
      continue;
    }

    const component = extractComponent(sourceFile, filePath, fileName, fileExtension, config);
    if (component) {
      componentFiles.set(filePath, component);
      components.push(component);
    }
  }

  // Second pass: extract dependencies
  for (const sourceFile of sourceFiles) {
    const filePath = relative(config.sourceDir, sourceFile.getFilePath());
    if (barrelFiles.has(filePath)) continue;
    if (!componentFiles.has(filePath)) continue;

    const deps = extractDependencies(sourceFile, config, barrelFiles, componentFiles, project);
    dependencies.push(...deps);
  }

  // Reclassify layers using path heuristics and graph structure
  reclassifyComponents(components, dependencies, config);

  const modules = deriveModules(components);
  const layers = deriveLayers(components);

  return { components, dependencies, modules, layers };
}

function deriveModules(components: ParsedComponent[]): ParsedModule[] {
  const seen = new Set<string>();
  const modules: ParsedModule[] = [];

  for (const comp of components) {
    let dir = dirname(comp.filePath).replace(/\\/g, '/');
    while (dir && dir !== '.') {
      if (seen.has(dir)) break;
      seen.add(dir);
      const parent = dirname(dir).replace(/\\/g, '/');
      modules.push({
        path: dir,
        name: basename(dir),
        parentPath: parent === '.' ? null : parent,
      });
      dir = parent;
    }
  }

  return modules;
}

function deriveLayers(components: ParsedComponent[]): string[] {
  return [...new Set(components.map(c => c.layer))];
}

/**
 * Refine layer classification using path heuristics and dependency graph structure.
 *
 * Atoms: leaf components with zero fan-out (don't depend on other components).
 * Molecules: compose a small number of other components (fan-out 1-3).
 * Organisms: compose many components (fan-out > 3).
 *
 * Path override: components in ui/ or primitives/ directories are classified
 * purely by fan-out, regardless of any prior mapping.
 */
export function reclassifyComponents(
  components: ParsedComponent[],
  dependencies: ParsedDependency[],
  config: GraphConfig
): void {
  // Build fan-out map (how many components does this component import)
  const fanOut = new Map<string, number>();
  for (const dep of dependencies) {
    fanOut.set(dep.sourceFile, (fanOut.get(dep.sourceFile) || 0) + 1);
  }

  for (const comp of components) {
    // Never reclassify page or template — those come from App Router detection
    if (comp.layer === 'page' || comp.layer === 'template') continue;

    const segments = comp.filePath.toLowerCase().split('/');
    const out = fanOut.get(comp.filePath) || 0;

    // Path-based: ui/ and primitives/ directories are atomic design primitives
    if (segments.includes('ui') || segments.includes('primitives')) {
      comp.layer = classifyByFanOut(out);
      continue;
    }

    // Only auto-classify components at the default layer (unknown/unmatched)
    if (comp.layer !== config.defaultLayer) continue;

    comp.layer = classifyByFanOut(out);
  }
}

function classifyByFanOut(fanOut: number): string {
  if (fanOut === 0) return 'atom';
  if (fanOut <= 3) return 'molecule';
  return 'organism';
}

function findTsConfig(sourceDir: string): string | undefined {
  // Walk up from sourceDir looking for tsconfig.json
  let dir = resolve(sourceDir);
  while (dir !== dirname(dir)) {
    const tsConfigPath = resolve(dir, 'tsconfig.json');
    if (existsSync(tsConfigPath)) {
      return tsConfigPath;
    }
    dir = dirname(dir);
  }
  return undefined;
}

function isBarrelFile(sourceFile: SourceFile, fileName: string): boolean {
  if (fileName !== 'index') return false;

  // A barrel file primarily re-exports from other files
  const exportDeclarations = sourceFile.getExportDeclarations();
  const hasReExports = exportDeclarations.length > 0;

  // Check if it has any substantial code (functions, classes, variables with initializers)
  const functions = sourceFile.getFunctions();
  const classes = sourceFile.getClasses();
  const hasSubstantialCode = functions.length > 0 || classes.length > 0;

  return hasReExports && !hasSubstantialCode;
}

function extractComponent(
  sourceFile: SourceFile,
  filePath: string,
  fileName: string,
  fileExtension: string,
  config: GraphConfig
): ParsedComponent | null {
  if (isNonComponentFile(filePath, fileName, fileExtension, sourceFile.getFullText())) {
    return null;
  }

  let name: string | undefined;
  let exportType: 'default' | 'named' = 'named';

  // Check for default export
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declarations = defaultExport.getDeclarations();
    if (!isTypeOnlyExport(declarations)) {
      exportType = 'default';
      // Try to get the name from the declaration
      for (const decl of declarations) {
        if (Node.isFunctionDeclaration(decl) || Node.isClassDeclaration(decl)) {
          const declName = decl.getName();
          if (declName) {
            name = declName;
            break;
          }
        }
        if (Node.isExportAssignment(decl)) {
          const expr = decl.getExpression();
          if (Node.isIdentifier(expr)) {
            name = expr.getText();
            break;
          }
        }
      }
      // Fallback to PascalCase filename
      if (!name) {
        name = toPascalCase(fileName);
      }
    }
  }

  // Check for named exports if no default
  if (!name) {
    const namedExports = sourceFile.getExportedDeclarations();
    if (namedExports.size === 0) return null;

    // Pick the first non-type exported declaration that looks like a component (PascalCase).
    for (const [exportName, declarations] of namedExports) {
      if (exportName === 'default') continue;
      if (!isPascalCase(exportName)) continue;
      if (isTypeOnlyExport(declarations)) continue;
      if (isNonComponentName(exportName)) continue;
      name = exportName;
      exportType = 'named';
      break;
    }
  }

  if (!name) return null;
  if (isNonComponentName(name)) return null;

  // Filter custom hooks (e.g., useNameCapitalization)
  if (/^use[A-Z]/.test(name)) return null;

  // Filter Error subclasses (e.g., AIError, OCRError)
  if (isErrorClass(sourceFile, name)) return null;

  const layer = resolveLayer(filePath, config);
  const hasState = detectState(sourceFile);
  const props = extractProps(sourceFile, name);
  const description = extractDescription(sourceFile, name);
  const hooks = extractHooks(sourceFile);

  return { name, filePath, layer, exportType, hasState, props, description, hooks };
}

export function hasJsxContent(fileText: string): boolean {
  return /<[A-Za-z][^>]*>|<>/.test(fileText);
}

export function isNonComponentFile(
  filePath: string,
  fileName: string,
  fileExtension: string,
  fileText: string
): boolean {
  if (fileName === 'route' || fileName === 'middleware') {
    return true;
  }

  // Next.js metadata/special files are not components
  if (NEXTJS_METADATA_FILES.has(fileName)) {
    return true;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.endsWith('.d.ts')) {
    return true;
  }

  // .ts files (not .tsx) cannot contain JSX syntax; only include if they use
  // React.createElement directly (very rare but valid)
  if (fileExtension === '.ts' && !fileText.includes('React.createElement')) {
    return true;
  }

  return false;
}

export function isTypeOnlyExport(declarations: Node[]): boolean {
  if (declarations.length === 0) return false;
  return declarations.every(decl =>
    Node.isInterfaceDeclaration(decl) ||
    Node.isTypeAliasDeclaration(decl) ||
    Node.isEnumDeclaration(decl)
  );
}

export function isNonComponentName(name: string): boolean {
  if (!isPascalCase(name)) return false;
  return NON_COMPONENT_NAME_SUFFIXES.some(suffix => name.endsWith(suffix));
}

function isErrorClass(sourceFile: SourceFile, name: string): boolean {
  for (const cls of sourceFile.getClasses()) {
    if (cls.getName() === name) {
      const ext = cls.getExtends();
      if (ext) {
        const text = ext.getText();
        // Matches Error, TypeError, CustomError, etc.
        if (/Error\b/.test(text)) return true;
      }
    }
  }
  return false;
}

function matchesSegmentSequence(pathSegments: string[], keySegments: string[]): boolean {
  if (keySegments.length === 0 || keySegments.length > pathSegments.length) return false;
  for (let start = 0; start <= pathSegments.length - keySegments.length; start++) {
    let matched = true;
    for (let offset = 0; offset < keySegments.length; offset++) {
      if (pathSegments[start + offset] !== keySegments[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

export function resolveLayer(filePath: string, config: GraphConfig): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath
    .split('/')
    .filter(Boolean)
    .map(segment => segment.toLowerCase());

  const sortedMappings = Object.entries(config.layerMapping)
    .map(([rawKey, layer]) => ({
      keySegments: rawKey
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .map(segment => segment.toLowerCase()),
      layer,
    }))
    .sort((a, b) => b.keySegments.length - a.keySegments.length);

  for (const mapping of sortedMappings) {
    if (matchesSegmentSequence(segments, mapping.keySegments)) {
      return mapping.layer;
    }
  }

  const appIndex = segments.indexOf('app');
  if (appIndex !== -1) {
    const lowerPath = normalizedPath.toLowerCase();
    if (lowerPath.endsWith('/page.tsx') || lowerPath.endsWith('/page.jsx')) {
      return 'page';
    }
    if (
      lowerPath.endsWith('/layout.tsx') ||
      lowerPath.endsWith('/layout.jsx') ||
      lowerPath.endsWith('/loading.tsx') ||
      lowerPath.endsWith('/loading.jsx') ||
      lowerPath.endsWith('/error.tsx') ||
      lowerPath.endsWith('/error.jsx') ||
      lowerPath.endsWith('/not-found.tsx') ||
      lowerPath.endsWith('/not-found.jsx')
    ) {
      return 'template';
    }
  }

  return config.defaultLayer;
}

function detectState(sourceFile: SourceFile): boolean {
  const imports = sourceFile.getImportDeclarations();
  for (const imp of imports) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (moduleSpecifier !== 'react') continue;

    const namedImports = imp.getNamedImports();
    for (const named of namedImports) {
      const importName = named.getName();
      if (importName === 'useState' || importName === 'useReducer') {
        return true;
      }
    }
  }
  return false;
}

function extractProps(sourceFile: SourceFile, componentName: string): PropInfo[] {
  const props: PropInfo[] = [];

  // Find the function declaration or variable declaration for the component
  const func = sourceFile.getFunction(componentName);
  const varDecl = !func ? sourceFile.getVariableDeclaration(componentName) : undefined;

  // Get the first parameter's type
  let paramNode: import('ts-morph').ParameterDeclaration | undefined;
  if (func) {
    paramNode = func.getParameters()[0];
  } else if (varDecl) {
    const init = varDecl.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      paramNode = init.getParameters()[0];
    }
  }

  if (!paramNode) return props;

  // Handle destructured parameter with inline type or type reference
  const typeNode = paramNode.getTypeNode();
  if (typeNode && Node.isTypeLiteral(typeNode)) {
    // Inline type literal: { children: ReactNode; onClick?: () => void }
    for (const member of typeNode.getMembers()) {
      if (Node.isPropertySignature(member)) {
        const name = member.getName();
        const type = member.getType().getText(member);
        const required = !member.hasQuestionToken();
        props.push({ name, type, required });
      }
    }
  } else if (typeNode && Node.isTypeReference(typeNode)) {
    // Named type reference: ButtonProps — resolve the interface/type
    const typeName = typeNode.getText();
    const typeAlias = sourceFile.getTypeAlias(typeName);
    const iface = sourceFile.getInterface(typeName);
    if (iface) {
      for (const member of iface.getProperties()) {
        props.push({
          name: member.getName(),
          type: member.getType().getText(member),
          required: !member.hasQuestionToken(),
        });
      }
    } else if (typeAlias) {
      const aliasType = typeAlias.getType();
      for (const prop of aliasType.getProperties()) {
        const decls = prop.getDeclarations();
        const decl = decls[0];
        const isOptional = decl && Node.isPropertySignature(decl) ? decl.hasQuestionToken() : false;
        props.push({
          name: prop.getName(),
          type: prop.getTypeAtLocation(typeAlias).getText(),
          required: !isOptional,
        });
      }
    }
  }

  // Check for default values in destructuring pattern
  const nameNode = paramNode.getNameNode();
  if (Node.isObjectBindingPattern(nameNode)) {
    for (const element of nameNode.getElements()) {
      const init = element.getInitializer();
      if (init) {
        const propName = element.getName();
        const existing = props.find(p => p.name === propName);
        if (existing) {
          existing.defaultValue = init.getText();
        }
      }
    }
  }

  return props;
}

function extractDescription(sourceFile: SourceFile, componentName: string): string {
  // Try function declaration
  const func = sourceFile.getFunction(componentName);
  if (func) {
    const jsDocs = func.getJsDocs();
    if (jsDocs.length > 0) {
      return jsDocs[0].getDescription().trim();
    }
  }

  // Try variable declaration (arrow functions)
  const varDecl = sourceFile.getVariableDeclaration(componentName);
  if (varDecl) {
    const varStmt = varDecl.getParent()?.getParent();
    if (varStmt && Node.isVariableStatement(varStmt)) {
      const jsDocs = varStmt.getJsDocs();
      if (jsDocs.length > 0) {
        return jsDocs[0].getDescription().trim();
      }
    }
  }

  return '';
}

function extractHooks(sourceFile: SourceFile): string[] {
  const hooks: string[] = [];
  const imports = sourceFile.getImportDeclarations();
  for (const imp of imports) {
    if (imp.getModuleSpecifierValue() !== 'react') continue;
    for (const named of imp.getNamedImports()) {
      const name = named.getName();
      if (name.startsWith('use')) {
        hooks.push(name);
      }
    }
  }
  return hooks;
}

function extractDependencies(
  sourceFile: SourceFile,
  config: GraphConfig,
  barrelFiles: Set<string>,
  componentFiles: Map<string, ParsedComponent>,
  project: Project
): ParsedDependency[] {
  const deps: ParsedDependency[] = [];
  const sourceFilePath = relative(config.sourceDir, sourceFile.getFilePath());
  const imports = sourceFile.getImportDeclarations();

  for (const imp of imports) {
    const moduleSpecifier = imp.getModuleSpecifierValue();

    // Skip external packages
    if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('@/')) {
      continue;
    }

    // Resolve the import to an actual file
    const resolvedSourceFile = resolveImportToSourceFile(imp, sourceFile, project);
    if (!resolvedSourceFile) continue;

    const resolvedPath = relative(config.sourceDir, resolvedSourceFile.getFilePath());

    // Check if resolved path is within sourceDir
    if (resolvedPath.startsWith('..')) continue;

    // If it resolves to a barrel file, follow the re-exports
    if (barrelFiles.has(resolvedPath)) {
      const namedImports = imp.getNamedImports();
      const resolvedTargets = resolveBarrelImports(
        resolvedSourceFile,
        namedImports.map(n => n.getName()),
        config,
        componentFiles,
        project
      );

      for (const target of resolvedTargets) {
        deps.push({
          sourceFile: sourceFilePath,
          targetFile: target,
          importType: 'reexport',
        });
      }
    } else if (componentFiles.has(resolvedPath)) {
      deps.push({
        sourceFile: sourceFilePath,
        targetFile: resolvedPath,
        importType: 'direct',
      });
    }
  }

  return deps;
}

function resolveImportToSourceFile(
  imp: ReturnType<SourceFile['getImportDeclarations']>[0],
  sourceFile: SourceFile,
  project: Project
): SourceFile | undefined {
  const moduleSpecifier = imp.getModuleSpecifierValue();
  const sourceDir = dirname(sourceFile.getFilePath());

  // Try to resolve via ts-morph's module resolution
  const moduleSourceFile = imp.getModuleSpecifierSourceFile();
  if (moduleSourceFile) {
    return moduleSourceFile;
  }

  // Manual resolution fallback
  const extensions = ['.tsx', '.ts', '.jsx', '.js'];
  let basePath: string;

  if (moduleSpecifier.startsWith('.')) {
    basePath = resolve(sourceDir, moduleSpecifier);
  } else if (moduleSpecifier.startsWith('@/')) {
    // Resolve @/ alias to sourceDir root (common convention)
    const rootSourceDir = project.getCompilerOptions().baseUrl || sourceDir;
    basePath = resolve(rootSourceDir, moduleSpecifier.slice(2));
  } else {
    return undefined;
  }

  // Try direct file
  for (const ext of extensions) {
    const sf = project.getSourceFile(basePath + ext);
    if (sf) return sf;
  }

  // Try index file
  for (const ext of extensions) {
    const sf = project.getSourceFile(resolve(basePath, `index${ext}`));
    if (sf) return sf;
  }

  return undefined;
}

function resolveBarrelImports(
  barrelFile: SourceFile,
  importNames: string[],
  config: GraphConfig,
  componentFiles: Map<string, ParsedComponent>,
  project: Project
): string[] {
  const resolved: string[] = [];
  const exportDeclarations = barrelFile.getExportDeclarations();

  for (const exportDecl of exportDeclarations) {
    const moduleSourceFile = exportDecl.getModuleSpecifierSourceFile();
    if (!moduleSourceFile) continue;

    const targetPath = relative(config.sourceDir, moduleSourceFile.getFilePath());

    // Check which of our requested imports come from this export declaration
    const namedExports = exportDecl.getNamedExports();
    if (namedExports.length === 0 && !exportDecl.getNamespaceExport()) {
      // Wildcard star export: export * from './X'
      // All components from this module become candidates
      if (componentFiles.has(targetPath)) {
        resolved.push(targetPath);
      }
    }
    for (const namedExport of namedExports) {
      const exportedName = namedExport.getAliasNode()?.getText() || namedExport.getName();
      if (importNames.length === 0 || importNames.includes(exportedName)) {
        if (componentFiles.has(targetPath)) {
          resolved.push(targetPath);
        }
      }
    }
  }

  return resolved;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, c => c.toUpperCase());
}

function isPascalCase(str: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(str);
}
