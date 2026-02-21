"""
CocoIndex flow for indexing a React/TypeScript codebase into a Neo4j component graph.

Reads .ts/.tsx files, extracts component metadata and import dependencies,
then exports Component nodes and DEPENDS_ON relationships to Neo4j.

Usage:
  # Set environment variables
  export COCOINDEX_DATABASE_URL="postgres://user:pass@localhost:5432/cocoindex"
  export NEO4J_URI="bolt://localhost:7687"
  export NEO4J_USER="neo4j"
  export NEO4J_PASSWORD="neo4jadmin"

  # Index the codebase
  cocoindex setup main
  cocoindex update main

  # Or run directly
  python main.py
"""

import os
import json
import re
from dataclasses import dataclass
from pathlib import Path

import cocoindex
from cocoindex.targets import (
    Neo4jConnection,
    Nodes,
    Relationships,
    NodeFromFields,
    TargetFieldMapping,
    Neo4jDeclaration,
)

# --- Configuration ---

def load_config() -> dict:
    """Load graph-config.json from the project being indexed."""
    config_path = os.environ.get("REACT_GRAPH_CONFIG", "./graph-config.json")
    with open(config_path) as f:
        return json.load(f)

CONFIG = load_config()
SOURCE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.environ.get("REACT_GRAPH_CONFIG", "./graph-config.json")), CONFIG["sourceDir"])
)
LAYER_MAPPING: dict[str, str] = CONFIG.get("layerMapping", {})
DEFAULT_LAYER: str = CONFIG.get("defaultLayer", "unknown")
INCLUDE_PATTERNS: list[str] = CONFIG.get("include", ["**/*.tsx", "**/*.ts"])
EXCLUDE_PATTERNS: list[str] = CONFIG.get("exclude", [])

# --- Neo4j Auth ---

neo4j_config = CONFIG.get("neo4j", {})
neo4j_conn = cocoindex.add_auth_entry(
    "react_graph_neo4j",
    Neo4jConnection(
        uri=os.environ.get("NEO4J_URI", neo4j_config.get("uri", "bolt://localhost:7687")),
        user=os.environ.get("NEO4J_USER", neo4j_config.get("user", "neo4j")),
        password=os.environ.get("NEO4J_PASSWORD", neo4j_config.get("password", "neo4j")),
        db=os.environ.get("NEO4J_DATABASE", neo4j_config.get("database", "neo4j")),
    ),
)

# --- Custom Functions ---

@cocoindex.op.function(behavior_version=1)
def extract_extension(filename: str) -> str:
    """Extract file extension (e.g., '.tsx' -> 'tsx')."""
    return os.path.splitext(filename)[1].lstrip(".")


def _resolve_layer(filepath: str) -> str:
    """Determine the Atomic Design layer from filepath segments."""
    segments = filepath.replace("\\", "/").split("/")
    for segment in segments:
        lower = segment.lower()
        if lower in LAYER_MAPPING:
            return LAYER_MAPPING[lower]
    return DEFAULT_LAYER


def _to_pascal_case(s: str) -> str:
    s = re.sub(r'[-_](\w)', lambda m: m.group(1).upper(), s)
    return s[0].upper() + s[1:] if s else s


def _is_pascal_case(s: str) -> bool:
    return bool(re.match(r'^[A-Z][a-zA-Z0-9]*$', s))


@dataclass
class PropInfoItem:
    """Extracted prop metadata."""
    name: str
    type: str
    required: bool
    default_value: str = ""


@dataclass
class ComponentInfo:
    """Extracted component metadata."""
    name: str
    file_path: str  # relative to sourceDir
    layer: str
    export_type: str  # 'default' | 'named'
    has_state: bool
    props: str = "[]"  # JSON string of PropInfoItem list
    description: str = ""
    hooks: str = "[]"  # JSON string of hook name list


@dataclass
class DependencyInfo:
    """Extracted import dependency."""
    source_file: str  # relative to sourceDir
    target_file: str  # relative to sourceDir
    import_type: str  # 'direct' | 'reexport'


def _extract_props_regex(content: str, component_name: str) -> str:
    """Extract props from inline type annotations using regex. Returns JSON string."""
    # Match: function Name({ prop1, prop2 }: { prop1: Type1; prop2?: Type2 })
    # or: function Name({ prop1, prop2 }: TypeName)
    pattern = rf"(?:function|const)\s+{re.escape(component_name)}\s*\(\s*\{{[^}}]*\}}\s*:\s*\{{([^}}]*)\}}"
    m = re.search(pattern, content)
    if not m:
        return "[]"

    type_body = m.group(1)
    props = []
    # Parse individual props: "name?: type" or "name: type"
    for prop_match in re.finditer(r"(\w+)(\??):\s*([^;,]+)", type_body):
        name = prop_match.group(1)
        optional = prop_match.group(2) == "?"
        prop_type = prop_match.group(3).strip()
        props.append({"name": name, "type": prop_type, "required": not optional})

    return json.dumps(props)


def _extract_description(content: str) -> str:
    """Extract JSDoc description from the first JSDoc comment before an export."""
    m = re.search(r"/\*\*\s*\n?\s*\*?\s*(.*?)\s*\*/\s*\nexport", content)
    if m:
        return m.group(1).strip().rstrip(".")  + "."  # Normalize trailing period
    # Single-line JSDoc: /** description */
    m = re.search(r"/\*\*\s+(.*?)\s+\*/\s*\nexport", content)
    if m:
        return m.group(1).strip()
    return ""


def _extract_hooks(content: str) -> str:
    """Extract all React hooks imported from 'react'. Returns JSON string."""
    hooks = []
    for m in re.finditer(r"import\s+.*\{([^}]*)\}.*from\s+['\"]react['\"]", content):
        imports_str = m.group(1)
        for name in re.findall(r"\b(use\w+)\b", imports_str):
            hooks.append(name)
    return json.dumps(hooks)


@cocoindex.op.function(behavior_version=1)
def extract_component(filename: str, content: str) -> list[ComponentInfo]:
    """
    Extract component metadata from a TypeScript/React file.
    Returns a list (usually 0 or 1 items). Empty list for barrel/non-component files.
    """
    rel_path = os.path.relpath(os.path.join(SOURCE_DIR, filename), SOURCE_DIR)
    base_name = Path(filename).stem

    # Skip barrel files (index.ts that only re-export)
    if base_name == "index":
        # Check if file only has export declarations (re-exports)
        lines = content.strip().splitlines()
        has_reexports = any(
            re.match(r"^export\s+\{[^}]*\}\s+from\s+", line.strip()) or
            re.match(r"^export\s+\*\s+from\s+", line.strip())
            for line in lines
        )
        has_functions = any(
            re.match(r"^(export\s+)?(function|class|const\s+\w+\s*=\s*(function|\())", line.strip())
            for line in lines
        )
        if has_reexports and not has_functions:
            return []

    # Detect state usage
    has_state = bool(re.search(r"import\s+.*\{[^}]*(useState|useReducer)[^}]*\}.*from\s+['\"]react['\"]", content))

    # Detect exports
    name = None
    export_type = "named"

    # Default export with name
    m = re.search(r"export\s+default\s+function\s+(\w+)", content)
    if m:
        name = m.group(1)
        export_type = "default"

    if not name:
        m = re.search(r"export\s+default\s+class\s+(\w+)", content)
        if m:
            name = m.group(1)
            export_type = "default"

    # Anonymous default export -> use filename
    if not name and re.search(r"export\s+default\s", content):
        name = _to_pascal_case(base_name)
        export_type = "default"

    # Named exports
    if not name:
        named_exports = re.findall(r"export\s+(?:function|class|const|let|var)\s+(\w+)", content)
        # Pick first PascalCase export (likely a component)
        for exp in named_exports:
            if _is_pascal_case(exp):
                name = exp
                export_type = "named"
                break

        # If no PascalCase export, use filename (e.g., helpers.ts)
        if not name and named_exports:
            name = base_name
            export_type = "named"

    if not name:
        return []

    layer = _resolve_layer(rel_path)
    props = _extract_props_regex(content, name)
    description = _extract_description(content)
    hooks = _extract_hooks(content)

    return [ComponentInfo(
        name=name,
        file_path=rel_path,
        layer=layer,
        export_type=export_type,
        has_state=has_state,
        props=props,
        description=description,
        hooks=hooks,
    )]


@cocoindex.op.function(behavior_version=1)
def extract_dependencies(filename: str, content: str) -> list[DependencyInfo]:
    """
    Extract import dependencies from a TypeScript/React file.
    Resolves barrel imports to their source files.
    """
    rel_path = os.path.relpath(os.path.join(SOURCE_DIR, filename), SOURCE_DIR)
    base_name = Path(filename).stem

    # Skip barrel files
    if base_name == "index":
        lines = content.strip().splitlines()
        has_reexports = any(
            re.match(r"^export\s+\{[^}]*\}\s+from\s+", line.strip()) or
            re.match(r"^export\s+\*\s+from\s+", line.strip())
            for line in lines
        )
        has_functions = any(
            re.match(r"^(export\s+)?(function|class|const\s+\w+\s*=\s*(function|\())", line.strip())
            for line in lines
        )
        if has_reexports and not has_functions:
            return []

    deps: list[DependencyInfo] = []
    file_dir = os.path.dirname(os.path.join(SOURCE_DIR, rel_path))

    # Find all imports from relative paths
    import_pattern = re.compile(
        r"import\s+(?:(?:\{[^}]*\}|\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+))*\s+from\s+)?['\"]([^'\"]+)['\"]"
    )

    for m in import_pattern.finditer(content):
        module_spec = m.group(1)

        # Skip external packages
        if not module_spec.startswith("."):
            continue

        # Resolve to actual file
        resolved = _resolve_import(file_dir, module_spec)
        if not resolved:
            continue

        resolved_rel = os.path.relpath(resolved, SOURCE_DIR)

        # Check if it's a barrel file (index.ts)
        if os.path.basename(resolved).startswith("index."):
            # Follow re-exports in the barrel
            barrel_targets = _resolve_barrel(resolved)
            for target in barrel_targets:
                target_rel = os.path.relpath(target, SOURCE_DIR)
                deps.append(DependencyInfo(
                    source_file=rel_path,
                    target_file=target_rel,
                    import_type="reexport",
                ))
        else:
            deps.append(DependencyInfo(
                source_file=rel_path,
                target_file=resolved_rel,
                import_type="direct",
            ))

    return deps


def _resolve_import(from_dir: str, module_spec: str) -> str | None:
    """Resolve a relative import specifier to an actual file path."""
    base = os.path.normpath(os.path.join(from_dir, module_spec))
    extensions = [".tsx", ".ts", ".jsx", ".js"]

    # Try direct file
    for ext in extensions:
        candidate = base + ext
        if os.path.isfile(candidate):
            return candidate

    # Try index file in directory
    if os.path.isdir(base):
        for ext in extensions:
            candidate = os.path.join(base, f"index{ext}")
            if os.path.isfile(candidate):
                return candidate

    return None


def _resolve_barrel(barrel_path: str) -> list[str]:
    """Parse a barrel file and return the resolved file paths of re-exported modules."""
    targets = []
    try:
        with open(barrel_path) as f:
            barrel_content = f.read()
    except IOError:
        return targets

    barrel_dir = os.path.dirname(barrel_path)

    # Match: export { X } from './Y'  or  export * from './Y'
    for m in re.finditer(r"export\s+(?:\{[^}]*\}|\*)\s+from\s+['\"]([^'\"]+)['\"]", barrel_content):
        module_spec = m.group(1)
        resolved = _resolve_import(barrel_dir, module_spec)
        if resolved:
            targets.append(resolved)

    return targets


# --- CocoIndex Flow ---

@cocoindex.flow_def(name="ReactComponentGraph")
def react_component_graph(flow_builder: cocoindex.FlowBuilder, data_scope: cocoindex.DataScope):
    """
    CocoIndex flow that reads React/TypeScript source files,
    extracts component metadata and dependencies,
    and exports them to Neo4j as a component graph.
    """

    # Declare Component node schema for relationship references
    flow_builder.declare(
        Neo4jDeclaration(
            connection=neo4j_conn,
            nodes_label="Component",
            primary_key_fields=["filePath"],
        )
    )

    # Source: read code files from disk
    data_scope["files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=SOURCE_DIR,
            included_patterns=INCLUDE_PATTERNS,
            excluded_patterns=EXCLUDE_PATTERNS + [".*", "**/node_modules"],
        )
    )

    # Collectors
    component_collector = data_scope.add_collector()
    dependency_collector = data_scope.add_collector()

    with data_scope["files"].row() as file:
        # Extract components
        file["components"] = file["content"].transform(
            extract_component,
            filename=file["filename"],
        )

        with file["components"].row() as comp:
            component_collector.collect(
                filePath=comp["file_path"],
                name=comp["name"],
                layer=comp["layer"],
                exportType=comp["export_type"],
                hasState=comp["has_state"],
                props=comp["props"],
                description=comp["description"],
                hooks=comp["hooks"],
            )

        # Extract dependencies
        file["dependencies"] = file["content"].transform(
            extract_dependencies,
            filename=file["filename"],
        )

        with file["dependencies"].row() as dep:
            dependency_collector.collect(
                sourceFile=dep["source_file"],
                targetFile=dep["target_file"],
                importType=dep["import_type"],
            )

    # Export Component nodes to Neo4j
    component_collector.export(
        "component_nodes",
        cocoindex.targets.Neo4j(
            connection=neo4j_conn,
            mapping=Nodes(label="Component"),
        ),
        primary_key_fields=["filePath"],
    )

    # Export DEPENDS_ON relationships to Neo4j
    dependency_collector.export(
        "depends_on_relationships",
        cocoindex.targets.Neo4j(
            connection=neo4j_conn,
            mapping=Relationships(
                rel_type="DEPENDS_ON",
                source=NodeFromFields(
                    label="Component",
                    fields=[TargetFieldMapping(source="sourceFile", target="filePath")],
                ),
                target=NodeFromFields(
                    label="Component",
                    fields=[TargetFieldMapping(source="targetFile", target="filePath")],
                ),
            ),
        ),
        primary_key_fields=["sourceFile", "targetFile"],
    )


# --- Entry Point ---

def main():
    """Run the indexer: setup and update the CocoIndex flow."""
    # cocoindex.init() reads COCOINDEX_DATABASE_URL from env
    cocoindex.init()
    react_component_graph.setup()
    react_component_graph.update()
    print(f"Indexing complete. Components and dependencies exported to Neo4j.")


if __name__ == "__main__":
    main()
