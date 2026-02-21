# Task Plan: RGK Open-Source CLI Rebrand and Productization

## Goal
Publish RGK (`@rgk/react-knowledge-graph`) as an open-source CLI (`rgk`) that makes local infra, indexing, and MCP workflows easy and reliable for React/Next.js repositories, including messy codebases.

## Phases
- [ ] Phase 1: Finalize naming, compatibility policy, and command surface
- [ ] Phase 2: Refactor code into shared services + CLI entrypoint
- [ ] Phase 3: Implement rebrand and soft-migration compatibility
- [ ] Phase 4: Add docs, onboarding flows, and migration guide
- [ ] Phase 5: Validate end-to-end and prepare npm/GitHub release

## Key Questions
1. What is the package identity?
2. What command should developers use?
3. How long do we support old `react-graph` names?
4. How do we onboard messy Next.js repos with no Atomic structure?
5. What is the minimum v1 command set for strong adoption?

## Decisions Made
- Package name: `@rgk/react-knowledge-graph`
- CLI command: `rgk`
- Product name: `RGK (React Knowledge Graph)`
- Migration strategy: soft migration for one major version
- v1 infra scope: Neo4j + MCP lifecycle
- v1 default index engine: TypeScript `ts-morph`
- MCP start mode: foreground stdio by default
- Output default: human-readable with `--json` optional

## Errors Encountered
- None yet.

## Status
**Currently in Phase 1** - Decision-complete plan prepared for implementation.
