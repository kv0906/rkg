# PRD: Parser Accuracy & Layer Classification Fixes

## Introduction

The RKG parser currently indexes ~65% non-React-component files (API routes, type definitions, utilities, Zod schemas, server actions) and has a broken layer classification system where nested paths like `components/ui` are misclassified. This PRD addresses 5 critical issues identified in the MCP audit that distort graph accuracy and render layer-based queries (impact analysis, atomic design breakdown) unreliable.

## Goals

- Eliminate non-component nodes from the graph (API routes, type-only files, utilities, server actions)
- Fix layer classification to support nested path matching (`components/ui` → `atom`)
- Auto-detect Next.js App Router conventions (`page.tsx` → `page` layer)
- Skip type-only exports (`ButtonProps`, `ChartConfig`, interfaces, enums)
- Return all matching components when names collide instead of arbitrary first match

## User Stories

### US-001: Skip Type-Only Exports
**Description:** As a developer using RKG, I want the parser to skip type-only exports (interfaces, type aliases, enums) so that `ButtonProps`, `ChartConfig`, and similar type exports don't appear as "components" in the graph.

**Acceptance Criteria:**
- [ ] Named exports where all declarations are `InterfaceDeclaration`, `TypeAliasDeclaration`, or `EnumDeclaration` are skipped
- [ ] PascalCase names ending in `Props`, `Config`, `Options`, `Context`, `Type`, `Schema`, `Api`, `Enum`, `State`, `Action`, `Reducer` are skipped
- [ ] Default exports that are type/interface/enum declarations are skipped
- [ ] Real components with similar names (e.g., `SchemaViewer`) are NOT skipped (suffix check is on the export name, not substring)
- [ ] `npm run build` passes
- [ ] `npm test` passes (adjust component count assertions if needed)

**Files:** `src/parser.ts` — `extractComponent()` function (lines 118-189), add `isTypeOnlyExport()` and `isNonComponentName()` helpers

---

### US-002: Filter Non-Component Files
**Description:** As a developer using RKG, I want the parser to exclude non-React files (API route handlers, middleware, utilities, server actions) so that only actual React components appear in the graph.

**Acceptance Criteria:**
- [ ] Files named `route.ts`/`route.tsx` (Next.js API routes) are skipped — check `fileName === 'route'`
- [ ] Files named `middleware.ts`/`middleware.tsx` are skipped
- [ ] `.d.ts` type declaration files are skipped
- [ ] `.ts` files without JSX content are skipped (use regex `/<[A-Za-z][^>]*>/` or `/<>/` on file text)
- [ ] `.tsx` files pass through without JSX check (developer explicitly chose JSX extension)
- [ ] This is strict by default — no config option to disable
- [ ] `npm run build` passes
- [ ] `npm test` passes (update fixture-based component count assertions)

**Files:** `src/parser.ts` — top of `extractComponent()`, add `hasJsxContent()` and `isNonComponentFile()` helpers

---

### US-003: Support Nested Path Matching in Layer Classification
**Description:** As a developer configuring RKG, I want `layerMapping` to support multi-segment keys like `"components/ui": "atom"` so that nested directories are classified correctly without being overridden by parent directory matches.

**Acceptance Criteria:**
- [ ] `resolveLayer()` uses longest-prefix-match: keys sorted by segment count descending, first match wins
- [ ] Multi-segment keys work: `"components/ui": "atom"` matches `components/ui/Button.tsx`
- [ ] Longest match wins: with `{"components/ui": "atom", "components": "organism"}`, path `components/ui/Button.tsx` returns `atom`
- [ ] Single-segment keys still work: `{"atoms": "atom"}` matches `atoms/Button.tsx` (backward compatible)
- [ ] Matching is case-insensitive and uses segment boundaries (not substring)
- [ ] `npm run build` passes
- [ ] Existing tests pass without modification (backward compatible)

**Files:** `src/parser.ts` — rewrite `resolveLayer()` function (lines 191-201)

---

### US-004: Auto-detect Next.js App Router Pages
**Description:** As a developer indexing a Next.js App Router codebase, I want `page.tsx` files to auto-classify as `page` layer and `layout.tsx` as `template` without manual config, so that impact analysis correctly reports affected pages.

**Acceptance Criteria:**
- [ ] `app/**/page.tsx` and `app/**/page.jsx` auto-classify as `page` layer
- [ ] `app/**/layout.tsx` auto-classifies as `template` layer
- [ ] `app/**/loading.tsx`, `app/**/error.tsx`, `app/**/not-found.tsx` auto-classify as `template` layer
- [ ] Only triggers when path contains `app/` segment (no false positives for other directories)
- [ ] Config `layerMapping` overrides auto-detection — if a user explicitly maps `app` to something, that takes precedence
- [ ] Implementation: check layerMapping first, then fall back to App Router conventions
- [ ] `npm run build` passes
- [ ] `npm test` passes

**Files:** `src/parser.ts` — `resolveLayer()` function, add App Router fallback after config-based matching

---

### US-005: Return All Matches for Ambiguous Component Names
**Description:** As an AI agent or developer querying the graph, I want to receive data for all matching components when a name is ambiguous (e.g., multiple `Header` components) so I can make an informed decision about which one matters.

**Acceptance Criteria:**
- [ ] `get_component_info("Header")` returns data for ALL components named Header (with their file paths)
- [ ] `get_component_dependencies("Header")` returns dependencies for all matching components, each identified by filePath
- [ ] `get_component_dependents("Header")` returns dependents for all matching components
- [ ] `get_change_impact("Header")` returns impact analysis for all matching components
- [ ] Support `filePath:componentName` format (e.g., `components/admin/Header.tsx:Header`) for exact single-component lookup
- [ ] When using `filePath:componentName`, if the path doesn't match, return an error with suggestion
- [ ] Tool descriptions updated to document the new `filePath:componentName` format
- [ ] `npm run build` passes
- [ ] `npm test` passes

**Files:** `src/index.ts` — add `parseComponentIdentifier()` and update MCP tool handlers (`handleGetComponentInfo`, `handleGetComponentDependencies`, `handleGetComponentDependents`, `handleGetChangeImpact`)

---

### US-006: Add Parser Unit Tests
**Description:** As a maintainer, I want unit tests covering the new parser logic so that regressions are caught early.

**Acceptance Criteria:**
- [ ] Test `resolveLayer()` with nested path matching (multi-segment keys, single-segment keys, no match → default)
- [ ] Test `resolveLayer()` with App Router auto-detection (page.tsx, layout.tsx, non-app paths)
- [ ] Test `resolveLayer()` config override of App Router conventions
- [ ] Test that `isTypeOnlyExport()` correctly identifies interface/type/enum declarations
- [ ] Test that `isNonComponentName()` catches suffix patterns and passes real component names
- [ ] Test that `hasJsxContent()` detects JSX and rejects plain TS
- [ ] Test that `isNonComponentFile()` catches route.ts, middleware.ts, .d.ts
- [ ] Test `parseComponentIdentifier()` with plain names and filePath:name format
- [ ] All tests use `node:test` + `node:assert/strict`
- [ ] `npm run build && npm test` passes

**Files:** `test/parser.test.ts` (new file), possibly export helper functions from `src/parser.ts` for direct unit testing

---

## Functional Requirements

- FR-1: `extractComponent()` must skip files named `route`, `middleware`, or ending in `.d.ts`
- FR-2: `extractComponent()` must skip `.ts` files that contain no JSX syntax (regex-based detection)
- FR-3: `extractComponent()` must skip named exports where all declarations are type/interface/enum
- FR-4: `extractComponent()` must skip PascalCase exports ending in `Props`, `Config`, `Options`, `Context`, `Type`, `Schema`, `Api`, `Enum`, `State`, `Action`, `Reducer`
- FR-5: `resolveLayer()` must sort `layerMapping` keys by segment count descending and use longest-prefix-match
- FR-6: `resolveLayer()` must support multi-segment keys like `"components/ui"` with segment-boundary matching
- FR-7: `resolveLayer()` must auto-detect App Router conventions (`page.tsx` → `page`, `layout.tsx` → `template`) as a fallback when no `layerMapping` matches
- FR-8: Config `layerMapping` must take precedence over App Router auto-detection
- FR-9: MCP tool handlers must return data for all matching components when a name query matches multiple
- FR-10: MCP tools must accept `filePath:componentName` format for exact lookup, using last colon as delimiter
- FR-11: MCP tool descriptions must document the `filePath:componentName` format

## Non-Goals

- No new config options for toggling strict component detection (strict by default, no opt-out)
- No changes to dependency extraction logic (`extractDependencies()`)
- No changes to Neo4j schema or database structure
- No changes to barrel file detection
- No support for custom component detection heuristics (e.g., "any file importing React is a component")
- No changes to the config loading pipeline (`src/config.ts`)

## Technical Considerations

- All changes are in `src/parser.ts` (Fixes 1-4) and `src/index.ts` (Fix 5) — no new files except tests
- Helper functions (`isTypeOnlyExport`, `isNonComponentName`, `hasJsxContent`, `isNonComponentFile`, `parseComponentIdentifier`) should be exported for unit testing
- `resolveLayer()` currently accepts `GraphConfig` — the `layerMapping` type (`Record<string, string>`) already supports multi-segment keys without type changes
- The `ClassificationRule` interface in `types/config.ts` (with `glob`, `kind`, `domain`, `layer` fields) is already defined but unused — this PRD does not activate it
- Existing test `test/index-service.test.ts` has `result.components.length >= 20` assertion that will need adjustment after filtering
- JSX detection regex `/<[A-Za-z][^>]*>/` may match HTML-like strings in comments — acceptable tradeoff for simplicity
- ts-morph `ExportedDeclarations` is the union type returned by `getExportedDeclarations()` — use `Node.isInterfaceDeclaration()` etc. for type checking

## Success Metrics

- "unknown" layer nodes reduced by >60% (from ~467 to <180)
- Zero API route handlers (GET, POST, etc.) in graph
- Zero type-only exports (ButtonProps, ChartConfig) in graph
- `get_layer_components("atom")` returns ui/ components when `"components/ui": "atom"` is configured
- `get_layer_components("page")` returns app/ page.tsx components without explicit config
- `get_change_impact` reports non-zero `affectedPages` for widely-used components

## Open Questions

- Should `resolveLayer()` App Router detection also handle `app/**/template.tsx` (Next.js template files)? Currently not included since they're uncommon.
- Should the parser track skipped files and report counts (e.g., "skipped 80 non-component files") in `IndexResult` for debugging visibility?
