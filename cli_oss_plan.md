# RGK CLI OSS Plan (Decision Complete)

## Summary
Rebrand and productize current codebase as RGK:
- Package: `@rgk/react-knowledge-graph`
- CLI: `rgk`
- Core workflow:
  1. `rgk infra up --wait`
  2. `rgk index --config ...`
  3. `rgk mcp start --config ...`

This plan supports both organized and messy React/Next.js repos by indexing raw graph truth first and layering classification/insights on top.

## Public CLI Surface

1. `rgk infra up [--wait] [--timeout <sec>]`
2. `rgk infra down [--volumes]`
3. `rgk infra status`
4. `rgk index [workspacePath] [--config <path>] [--stats] [--json]`
5. `rgk mcp start [--config <path>]`
6. `rgk mcp doctor [--config <path>]`
7. `rgk help [command]`
8. `rgk version`

## Rebrand and Compatibility

### New primary names
- Env:
  - `RGK_CONFIG`
  - `RGK_NEO4J_URI`
  - `RGK_NEO4J_USER`
  - `RGK_NEO4J_PASSWORD`
  - `RGK_NEO4J_DATABASE`
- Config default:
  - `./rgk.config.json`

### Deprecated aliases (v1 supported)
- `REACT_GRAPH_CONFIG`
- `./graph-config.json`
- existing `NEO4J_*` vars
- old naming emits warnings with replacement guidance.

## Architecture Changes

1. `src/cli.ts`
- main CLI router (`util.parseArgs`), command dispatch, exit code policy

2. `src/core/index-service.ts`
- reusable `runIndex` flow (parse -> clear -> ingest -> stats)

3. `src/core/health-service.ts`
- Neo4j and config diagnostics for `mcp doctor` + `infra status`

4. `src/mcp/server.ts`
- extracted MCP startup logic from current `src/index.ts`

5. `src/index.ts`
- compatibility wrapper to keep MCP behavior stable

6. `src/config.ts`
- implements new env/config precedence with deprecation warnings

## Messy Repo Indexing Strategy

1. Parse-first approach
- Index nodes/edges regardless of structure quality.
- Never fail solely due to missing Atomic conventions.

2. Adaptive classification
- infer `kind` from file role and AST:
  - `next_page`, `next_layout`, `next_route`, `react_component`, `hook`, `util`, `unknown`
- infer domain tags from paths/imports:
  - `admin`, `profile`, `storefront`, `api`, etc.
- record confidence score per inferred label.

3. Inference reporting
- coverage by confidence buckets
- unknown list
- hotspots:
  - high fan-in
  - high fan-out
  - orphans
  - duplicate/similar component candidates

4. Config override support
- path/glob rules to remap kind/domain/layer without code rewrite.

## Testing Plan

1. CLI behavior
- parse/usage errors return exit `2`
- runtime/config failures return exit `1`
- success returns exit `0`

2. Rebrand regression
- all logs and help text show RGK names
- MCP server identity updated to `rgk`

3. Compatibility tests
- old env/config still work with deprecation warnings
- new names take precedence when both are present

4. Infra tests
- `infra up --wait` reaches healthy Neo4j
- `infra status` reports state/auth correctly
- `infra down` cleanly stops services

5. Index tests
- fixture indexing yields expected counts
- `--json` schema stable
- messy sample still indexes with partial unknown classification, not failure

6. MCP tests
- `mcp start` works over stdio
- tools list/calls unchanged

## Documentation Deliverables

1. `README.md`
- 30-second quickstart
- install modes:
  - `npx @rgk/react-knowledge-graph ...`
  - global install option
- first-run troubleshooting

2. `MIGRATION.md`
- old -> new mapping table
- deprecation timeline and removal target version

3. `CLI.md`
- command-by-command reference and examples

## Release Plan

1. CI on tags `vX.Y.Z`
- install, build, run smoke tests, publish npm package, create GitHub release

2. Publish policy
- semantic versioning
- announce deprecations in release notes and doctor output

## Assumptions and Defaults
- CLI command is `rgk` only.
- Package namespace `@rgk` is available.
- Soft migration window lasts one major version.
- Detached daemon/watch mode is deferred beyond v1.
