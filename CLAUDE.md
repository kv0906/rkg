# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RKG (React Knowledge Graph) — a CLI tool and MCP server that parses React/Next.js codebases using ts-morph, builds a component dependency graph in Neo4j, and exposes it via MCP tools for AI-assisted code analysis.

**Package**: `@rkg/react-knowledge-graph`
**CLI binary**: `rkg`
**Runtime**: Node.js ≥ 20, ESM (`"type": "module"`)

## Build & Test Commands

```bash
npm run build          # tsc — compiles to dist/
npm run dev            # tsc --watch
npm test               # node --test dist/test/**/*.test.js
npm run build && npm test  # full cycle (must build before testing)
```

Tests use Node.js built-in test runner (`node:test` + `node:assert`). There is no separate test framework. Tests run against compiled JS in `dist/`, so always build first.

Run a single test file:
```bash
node --test dist/test/cli.test.js
```

## Architecture

### Data Flow
```
React codebase → parser.ts (ts-morph AST) → db.ts (Neo4j ingest) → index.ts (MCP server) / cli.ts (CLI)
```

### Key Modules

- **`src/cli.ts`** — CLI entrypoint using `node:util.parseArgs`. Dispatches to subcommands: `infra`, `index`, `mcp`, `help`, `version`. Exit codes: 0=success, 1=runtime error, 2=usage error.
- **`src/index.ts`** — MCP server over stdio. Registers 12 tools (graph queries, search, impact analysis, reindex, execute_cypher). Auto-indexes on startup if graph is empty.
- **`src/parser.ts`** — Uses ts-morph to parse React components, extract props/hooks/state/exports, resolve import dependencies, and build module hierarchy.
- **`src/db.ts`** — Neo4j driver wrapper. Manages connection, schema constraints, and CRUD for Component/Module/Layer nodes and DEPENDS_ON/CONTAINS/BELONGS_TO_LAYER edges.
- **`src/config.ts`** — Config loader with deprecation compatibility. Priority: CLI flags → `RKG_*` env vars → legacy `NEO4J_*`/`REACT_GRAPH_*` env vars → config file → defaults. `toGraphConfig()` bridges new `RkgConfig` to legacy `GraphConfig`.
- **`src/core/index-service.ts`** — Orchestrates parse → clear graph → ingest pipeline. Returns `IndexResult` with node/edge counts and classification summary.
- **`src/core/infra-service.ts`** — Docker compose operations for Neo4j (`up --wait`, `down --volumes`, `status`).
- **`src/core/health-service.ts`** — Diagnostics: Neo4j connectivity, auth, config file presence, Docker status.
- **`src/types/config.ts`** — `RkgConfig` interface and env var constants (`RKG_CONFIG`, `RKG_NEO4J_*`).
- **`src/types.ts`** — Legacy `GraphConfig`, `ParsedComponent`, `ParsedDependency`, `ParsedModule`, `ParseResult`, `ToolResponse` types.

### Neo4j Graph Schema
- **Nodes**: `Component` (filePath, name, layer, exportType, hasState, props, description, hooks), `Module` (path, name), `Layer` (name)
- **Edges**: `DEPENDS_ON` (importType), `CONTAINS` (Module→Module, Module→Component), `BELONGS_TO_LAYER` (Component→Layer)

### Config Files
- New: `rkg.config.json` (nested format with `indexing`, `classification`, `neo4j` keys)
- Legacy: `graph-config.json` (flat format with `sourceDir`, `include`, `exclude`, `layerMapping` at top level)
- Both formats are supported; legacy emits deprecation warnings to stderr

### Infrastructure
- Neo4j 5 Community via `docker-compose.yml` (ports 7474/7687, default auth `neo4j/neo4j`)
- `rkg infra up --wait` starts and polls for readiness

## Test Fixtures
- `test/fixture/` — Small synthetic React components for unit tests
- `test/fixture-realworld/` — Larger generated fixture (excluded from tsc via tsconfig)
- `test/fixture-config.json` / `test/fixture-realworld-config.json` — Config files pointing to fixtures

## Conventions
- All imports use `.js` extensions (ESM requirement with NodeNext resolution)
- Config precedence is strict: CLI > env vars (new > legacy) > config file > defaults
- MCP tool `execute_cypher` is read-only; write operations are rejected via regex guard
