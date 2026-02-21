# PRD: RGK CLI Open-Source Release

## Introduction

RGK (React Knowledge Graph) is a CLI tool that makes local infrastructure, codebase indexing, and MCP workflows easy and reliable for React/Next.js repositories — including messy, unstructured codebases. This PRD covers the full lifecycle from refactoring the existing `react-graph` codebase into a branded, publishable CLI (`rgk`) through to npm release, with adaptive indexing that works on real-world projects regardless of how organized they are.

The primary target is new developers discovering RGK for the first time. The onboarding experience must be clean, self-explanatory, and forgiving — no assumed familiarity with the old `react-graph` naming.

## Goals

- Publish `@rgk/react-knowledge-graph` to npm with a working `rgk` CLI binary
- Deliver the core workflow: `rgk infra up` → `rgk index` → `rgk mcp start`
- Support messy repos with adaptive classification and confidence-scored inference
- Provide full rebrand with soft-migration compatibility for one major version
- Ship documentation (README, CLI reference, migration guide) sufficient for cold-start adoption
- Maintain full test coverage including Docker-based infra integration tests

## User Stories

### US-001: Finalize package identity and config schema
**Description:** As a maintainer, I want the package name, CLI binary, env vars, and config file names locked down so that all subsequent work builds on a stable identity.

**Acceptance Criteria:**
- [ ] `package.json` name is `@rgk/react-knowledge-graph`
- [ ] `bin` field maps `rgk` to the CLI entrypoint
- [ ] Default config file is `rgk.config.json`
- [ ] Env vars prefixed with `RGK_` (`RGK_CONFIG`, `RGK_NEO4J_URI`, `RGK_NEO4J_USER`, `RGK_NEO4J_PASSWORD`, `RGK_NEO4J_DATABASE`)
- [ ] Config schema documented in a TypeScript interface
- [ ] Typecheck passes

### US-002: Create CLI entrypoint and command router
**Description:** As a developer, I want a `src/cli.ts` entrypoint that parses arguments and dispatches to subcommands so that all CLI interactions go through one consistent interface.

**Acceptance Criteria:**
- [ ] `src/cli.ts` uses `util.parseArgs` for argument parsing
- [ ] Routes to subcommands: `infra`, `index`, `mcp`, `help`, `version`
- [ ] Unknown commands print usage and exit code `2`
- [ ] `--help` flag works on root and each subcommand
- [ ] `--version` prints package version and exits `0`
- [ ] Typecheck passes

### US-003: Extract index service
**Description:** As a developer, I want indexing logic extracted into `src/core/index-service.ts` so that both the CLI and MCP server can reuse it without duplication.

**Acceptance Criteria:**
- [ ] `src/core/index-service.ts` exports a `runIndex(options)` function
- [ ] Flow: parse workspace → clear graph → ingest nodes/edges → return stats
- [ ] Accepts workspace path, config path, and output format options
- [ ] Returns structured result (node count, edge count, classification summary)
- [ ] Existing MCP index tool calls this service instead of inline logic
- [ ] Typecheck passes

### US-004: Extract health service
**Description:** As a developer, I want health/diagnostic logic in `src/core/health-service.ts` so that `mcp doctor` and `infra status` share the same checks.

**Acceptance Criteria:**
- [ ] `src/core/health-service.ts` exports diagnostic functions
- [ ] Checks: Neo4j connectivity, auth validity, config file presence, Docker status
- [ ] Returns structured health report (each check: pass/fail/message)
- [ ] Typecheck passes

### US-005: Implement `rgk infra up/down/status`
**Description:** As a new developer, I want to run `rgk infra up --wait` to start Neo4j locally so that I don't have to manually configure Docker.

**Acceptance Criteria:**
- [ ] `rgk infra up` starts Neo4j via `docker-compose.yml`
- [ ] `--wait` flag polls until Neo4j is healthy (default 60s timeout)
- [ ] `--timeout <sec>` overrides wait duration
- [ ] `rgk infra down` stops services; `--volumes` removes data volumes
- [ ] `rgk infra status` reports running/stopped state and Neo4j auth health
- [ ] Exit code `0` on success, `1` on failure
- [ ] Typecheck passes

### US-006: Implement `rgk index`
**Description:** As a new developer, I want to run `rgk index` to scan my React project and populate the knowledge graph so that I can query my codebase structure.

**Acceptance Criteria:**
- [ ] `rgk index [workspacePath]` indexes the given or current directory
- [ ] `--config <path>` overrides config file location
- [ ] `--stats` prints summary (nodes, edges, classifications) to stdout
- [ ] `--json` outputs machine-readable JSON instead of human-readable text
- [ ] Messy repos index successfully with partial `unknown` classifications (no hard failure)
- [ ] Exit code `0` on success, `1` on error
- [ ] Typecheck passes

### US-007: Implement adaptive classification for messy repos
**Description:** As a developer with a messy Next.js codebase, I want RGK to infer file roles and domain tags so that the graph is useful even without strict project conventions.

**Acceptance Criteria:**
- [ ] Infers `kind` from file role + AST: `next_page`, `next_layout`, `next_route`, `react_component`, `hook`, `util`, `unknown`
- [ ] Infers domain tags from paths and imports: `admin`, `profile`, `storefront`, `api`, etc.
- [ ] Each inferred label has a confidence score (0-1)
- [ ] Coverage report shows breakdown by confidence bucket (high/medium/low/unknown)
- [ ] Hotspot detection: high fan-in, high fan-out, orphans, duplicate/similar candidates
- [ ] Config override support: path/glob rules to remap kind/domain/layer
- [ ] Typecheck passes

### US-008: Implement `rgk mcp start` and `rgk mcp doctor`
**Description:** As a developer, I want to start the MCP server via CLI so that my editor can query the knowledge graph through the standard MCP protocol.

**Acceptance Criteria:**
- [ ] `rgk mcp start` launches MCP server over stdio (foreground)
- [ ] `--config <path>` overrides config location
- [ ] MCP server identity is `rgk` (not `react-graph-mcp`)
- [ ] All existing MCP tools remain functional
- [ ] `rgk mcp doctor` runs health checks and prints diagnostic report
- [ ] Exit code `0` on success, `1` on failure
- [ ] Typecheck passes

### US-009: Implement rebrand with deprecation compatibility
**Description:** As a maintainer, I want old env vars and config file names to still work (with warnings) so that existing setups don't break on upgrade.

**Acceptance Criteria:**
- [ ] `src/config.ts` checks new `RGK_*` env vars first, falls back to old `REACT_GRAPH_*` / `NEO4J_*` vars
- [ ] `rgk.config.json` is primary; `graph-config.json` is fallback
- [ ] When old names are used, stderr prints deprecation warning with replacement guidance
- [ ] New names take precedence when both old and new are present
- [ ] All logs, help text, and error messages use RGK branding
- [ ] Typecheck passes

### US-010: Write full test suite
**Description:** As a maintainer, I want comprehensive tests so that regressions are caught before release.

**Acceptance Criteria:**
- [ ] CLI tests: parse/usage errors → exit `2`, runtime errors → exit `1`, success → exit `0`
- [ ] Rebrand tests: all output references RGK names, no stale `react-graph` strings
- [ ] Compatibility tests: old env/config work with warnings, new names take precedence
- [ ] Infra integration tests (Docker): `infra up --wait` reaches healthy Neo4j, `infra status` reports correctly, `infra down` cleans up
- [ ] Index tests: fixture indexing yields expected counts, `--json` output schema is stable, messy sample indexes with partial unknowns
- [ ] MCP tests: `mcp start` works over stdio, tools list/calls unchanged
- [ ] All tests pass in CI environment
- [ ] Typecheck passes

### US-011: Write documentation
**Description:** As a new developer, I want clear documentation so that I can go from install to working graph in under 5 minutes.

**Acceptance Criteria:**
- [ ] `README.md` with 30-second quickstart (npx and global install)
- [ ] `README.md` includes first-run troubleshooting section
- [ ] `CLI.md` with command-by-command reference and examples
- [ ] `MIGRATION.md` with old→new mapping table and deprecation timeline
- [ ] All code examples in docs are tested/accurate

### US-012: Set up CI and npm release pipeline
**Description:** As a maintainer, I want automated CI on tags so that publishing is reliable and repeatable.

**Acceptance Criteria:**
- [ ] CI triggers on `vX.Y.Z` tags
- [ ] Pipeline: install → build → typecheck → test (unit + integration) → publish to npm → create GitHub release
- [ ] Semantic versioning enforced
- [ ] Deprecation notices included in release notes template
- [ ] `rgk version` output matches published version
- [ ] Typecheck passes

## Functional Requirements

- FR-1: The CLI binary is `rgk`, installed via `@rgk/react-knowledge-graph`
- FR-2: `rgk infra up [--wait] [--timeout <sec>]` starts Neo4j via Docker Compose and optionally waits for healthy status
- FR-3: `rgk infra down [--volumes]` stops services and optionally removes data volumes
- FR-4: `rgk infra status` reports service state and Neo4j auth health
- FR-5: `rgk index [workspacePath] [--config <path>] [--stats] [--json]` parses the workspace, clears the graph, ingests nodes/edges, and reports results
- FR-6: The indexer infers file kind (`next_page`, `next_layout`, `next_route`, `react_component`, `hook`, `util`, `unknown`) using AST analysis and file path signals
- FR-7: The indexer infers domain tags from import paths and directory structure with per-label confidence scores
- FR-8: The indexer reports coverage by confidence bucket and flags hotspots (high fan-in/out, orphans, duplicates)
- FR-9: Config supports path/glob override rules for kind/domain/layer remapping
- FR-10: `rgk mcp start [--config <path>]` launches the MCP server over stdio in the foreground
- FR-11: `rgk mcp doctor [--config <path>]` runs Neo4j, config, and Docker diagnostics and prints results
- FR-12: `rgk help [command]` prints usage for the given command or general help
- FR-13: `rgk version` prints the package version
- FR-14: Default output is human-readable; `--json` switches to machine-readable JSON
- FR-15: Exit codes: `0` success, `1` runtime/config error, `2` usage/parse error
- FR-16: Old env vars (`REACT_GRAPH_CONFIG`, `NEO4J_*`) and config file (`graph-config.json`) work as fallbacks with deprecation warnings
- FR-17: New `RGK_*` env vars and `rgk.config.json` take precedence over old names

## Non-Goals

- No detached daemon mode or background MCP server (deferred post-v1)
- No watch/auto-reindex on file changes (deferred post-v1)
- No GUI or web dashboard
- No Python indexer path in v1 — TypeScript `ts-morph` only
- No remote/cloud Neo4j support — local Docker only
- No plugin/extension system
- No automatic project scaffolding or code generation

## Technical Considerations

- **Parser engine:** `ts-morph` for TypeScript AST analysis (not the Python indexer)
- **CLI argument parsing:** Node.js built-in `util.parseArgs` (no external dependency)
- **Infra management:** Shells out to `docker compose` commands against the bundled `docker-compose.yml`
- **MCP protocol:** stdio transport, foreground process — must maintain backward compatibility with existing tool definitions
- **Config precedence:** CLI flags > env vars > config file > defaults
- **Existing code reuse:** Extract from `src/index.ts` (MCP server), `src/config.ts` (config), `src/parser.ts` (indexing), `src/db.ts` (Neo4j)
- **Build target:** ESM, Node.js 18+
- **Docker requirement:** Docker and Docker Compose must be installed for infra commands

## Success Metrics

- New developer can go from `npx @rgk/react-knowledge-graph infra up --wait` to querying the graph in under 5 minutes
- Messy repos (no Atomic structure) index successfully with >70% of files classified above `unknown`
- All tests (unit + Docker integration) pass in CI
- Zero stale `react-graph` references in user-facing output
- Package published to npm and installable globally

## Open Questions

- Is the `@rgk` npm scope available, or do we need a fallback name?
- Should `rgk index` support incremental re-indexing in v1 or always full clear-and-rebuild?
- What is the minimum Node.js version to support (18 LTS vs 20 LTS)?
- Should `rgk.config.json` support YAML alternative (`rgk.config.yaml`)?
- How should `rgk infra up` handle an already-running Neo4j instance (skip, warn, error)?
