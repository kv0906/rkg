# RKG — React Knowledge Graph

Build a dependency graph of your React/Next.js codebase in Neo4j and query it through AI-powered MCP tools.

RKG parses your TypeScript/React source files, extracts components, props, hooks, state usage, and import relationships, then loads everything into a Neo4j graph. You can then query this graph through an MCP server — ask your AI assistant things like "what's the blast radius if I change this component?" or "find components similar to Button."

## Quick Start

```bash
# 1. Install
npm install -g @rkg/react-knowledge-graph

# 2. Start Neo4j (requires Docker)
rkg start

# 3. Index your codebase
cd your-react-project
rkg index ./src --stats

# 4. Start the MCP server
rkg mcp start

# When you're done
rkg stop
```

That's it. Your AI assistant can now query your component graph.

## Prerequisites

- **Node.js** >= 20
- **Docker** (for running Neo4j)

## Installation

```bash
# Global install
npm install -g @rkg/react-knowledge-graph

# Or run directly with npx
npx @rkg/react-knowledge-graph index ./src --stats
```

## Setup

### 1. Start Neo4j

RKG ships with a `docker-compose.yml` that runs Neo4j 5 Community Edition.

```bash
rkg start                    # Start and wait until Neo4j is ready
rkg stop                     # Stop Neo4j
rkg stop --volumes           # Stop and delete all graph data
```

For more control, the `rkg infra` subcommand is still available:

```bash
rkg infra up [--wait] [--timeout 90]
rkg infra down [--volumes]
rkg infra status
```

Neo4j will be available at:
- Browser UI: http://localhost:7474
- Bolt protocol: `bolt://localhost:7687`
- Default credentials: `neo4j` / `neo4j`

### 2. Index your codebase

No config file needed — `rkg start` launches Neo4j with default credentials (`neo4j`/`neo4j`) and `rkg index` connects to it automatically.

```bash
# Index a specific path
rkg index ./src

# See classification stats
rkg index ./src --stats

# Machine-readable output
rkg index --json

# Use a specific config file
rkg index --config ./my-config.json
```

Example output:
```
Indexed 142 components with 287 dependencies.
  atom: 23
  molecule: 34
  organism: 41
  page: 12
  unknown: 32
```

RKG handles messy codebases gracefully — it indexes everything it can find and classifies what it can. Components that don't match any layer mapping are tagged as `unknown`, not skipped.

### 3. Connect to your AI assistant (MCP)

Add RKG as an MCP server in your AI tool's configuration:

```json
{
  "mcpServers": {
    "react-graph": {
      "command": "rkg",
      "args": ["mcp", "start"],
      "cwd": "/path/to/your/react-project"
    }
  }
}
```

The MCP server auto-indexes your codebase on first startup if the graph is empty.

### Bring your own Neo4j

If you're running your own Neo4j instance (managed service, custom Docker setup, etc.), point RKG at it with environment variables:

```bash
export RKG_NEO4J_URI=bolt://your-host:7687
export RKG_NEO4J_USER=neo4j
export RKG_NEO4J_PASSWORD=your-password
export RKG_NEO4J_DATABASE=neo4j
```

### Config file (optional)

For custom indexing rules or layer classification, create `rkg.config.json` in your project root:

```json
{
  "indexing": {
    "sourceDir": "./src",
    "include": ["**/*.tsx", "**/*.ts"],
    "exclude": ["**/*.test.*", "**/*.spec.*", "**/*.stories.*", "**/__tests__/**"]
  },
  "classification": {
    "layerMapping": {
      "atoms": "atom",
      "molecules": "molecule",
      "organisms": "organism",
      "templates": "template",
      "pages": "page",
      "ui": "atom",
      "layout": "organism",
      "features": "organism"
    },
    "defaultLayer": "unknown"
  },
  "neo4j": {
    "uri": "bolt://localhost:7687",
    "user": "neo4j",
    "password": "neo4j",
    "database": "neo4j"
  }
}
```

**`layerMapping`** maps directory names in your project to Atomic Design layers. For example, if your components live in `src/ui/`, mapping `"ui": "atom"` classifies them as atoms. Components not matching any mapping get the `defaultLayer`.

You can also point to a config file via environment variable:

```bash
export RKG_CONFIG=./path/to/config.json
```

## MCP Tools

Once connected, your AI assistant has access to these tools:

| Tool | What it does |
|------|-------------|
| `reindex_codebase` | Re-parse and rebuild the graph after code changes |
| `get_component_info` | Detailed info about a component (layer, props, hooks, state) |
| `get_component_dependencies` | What a component imports (immediate or full tree) |
| `get_component_dependents` | What imports a component (blast radius) |
| `get_change_impact` | Full impact analysis: direct/transitive dependents, affected pages, risk level |
| `find_similar_components` | Find existing components similar to one you're about to create |
| `search_components` | Filter components by name, layer, state, hooks, props, export type |
| `get_layer_components` | List all components in a layer |
| `get_graph_summary` | Overview: counts per layer, most-connected components |
| `get_layer_summary` | Cross-layer dependency matrix |
| `get_module_contents` | Browse the module/directory hierarchy |
| `execute_cypher` | Run custom read-only Cypher queries |

## Graph Schema

RKG builds the following graph structure in Neo4j:

```
(Component)-[:DEPENDS_ON]->(Component)
(Module)-[:CONTAINS]->(Module)
(Module)-[:CONTAINS]->(Component)
(Component)-[:BELONGS_TO_LAYER]->(Layer)
```

**Component** properties: `name`, `filePath`, `layer`, `exportType`, `hasState`, `props` (JSON), `hooks` (JSON), `description`

**Module** properties: `path`, `name`

**Layer** properties: `name`

You can explore the graph directly in the Neo4j Browser at http://localhost:7474 or through the `execute_cypher` MCP tool:

```cypher
// Find components with the most dependents
MATCH (parent:Component)-[:DEPENDS_ON]->(c:Component)
RETURN c.name, count(parent) AS dependents
ORDER BY dependents DESC
LIMIT 10

// Find orphan components (no dependents, not a page)
MATCH (c:Component)
WHERE NOT ()-[:DEPENDS_ON]->(c) AND c.layer <> 'page'
RETURN c.name, c.filePath

// Cross-layer dependency violations
MATCH (a:Component)-[:DEPENDS_ON]->(b:Component)
WHERE a.layer = 'atom' AND b.layer IN ['molecule', 'organism', 'page']
RETURN a.name AS atom, b.name AS violates, b.layer
```

## CLI Reference

```
rkg start [--timeout <seconds>]                Start Neo4j and wait until ready
rkg stop [--volumes]                           Stop Neo4j
rkg index [path] [--config <path>] [--stats] [--json]    Index codebase
rkg mcp start [--config <path>]                Start MCP server
rkg mcp doctor [--config <path>]               Run diagnostics
rkg version                                    Print version
rkg help [command]                             Show help
```

Advanced infrastructure commands (same functionality, more flags):

```
rkg infra up [--wait] [--timeout <seconds>]    Start Neo4j
rkg infra down [--volumes]                     Stop Neo4j
rkg infra status                               Check Neo4j status
```

## Works with any React project

RKG doesn't require your project to follow Atomic Design or any specific structure. It works by:

1. **Parsing first** — indexes all components regardless of project organization
2. **Classifying adaptively** — infers component roles from file paths using your `layerMapping` config
3. **Never failing on structure** — messy projects get indexed with `unknown` classifications, not errors

Whether you have a clean Atomic Design setup or a flat `components/` folder with 200 files, RKG will index it.

## License

MIT
