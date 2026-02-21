# Notes: RGK CLI OSS Strategy

## Sources
### Source 1: Local repository inspection
- Paths inspected:
  - `src/index.ts`
  - `src/config.ts`
  - `src/db.ts`
  - `src/parser.ts`
  - `indexer/main.py`
  - `package.json`
  - `graph-config.json`
  - `docker-compose.yml`
  - `test/*`
- Key findings:
  - Existing project is MCP-first (`react-graph-mcp`) with no dedicated CLI bin.
  - Existing code already supports indexing, Neo4j ingestion, and rich graph queries.
  - Current naming is `react-graph` in logs/server identity/env vars.
  - Python indexer exists but v1 CLI should default to ts-morph path for consistency.

### Source 2: Product/UX decisions from collaboration
- Key decisions:
  - Use `rgk` CLI + scoped package `@rgk/react-knowledge-graph`.
  - Keep old names as deprecated aliases for one major version.
  - Focus on practical local workflow:
    1. `rgk infra up --wait`
    2. `rgk index`
    3. `rgk mcp start`

## Synthesized Findings

### Why RGK works
- Short and memorable command (`rgk`).
- Explicit package naming improves discoverability.
- Clear brand while preserving migration path from existing users.

### What helps messy repos
- Index everything first (nodes/edges), classify second.
- Use adaptive classification (file role + AST + imports + path signals).
- Surface confidence and unknowns instead of hard failing.
- Allow rule-based overrides in config for gradual improvement.

### v1 scope discipline
- Keep v1 tight:
  - infra lifecycle
  - indexing
  - MCP start/doctor
- Defer detached daemon/watch/reindex loop until base UX is stable.
