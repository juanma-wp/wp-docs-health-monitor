# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm test` — run the Vitest suite once.
- `npm run test:watch` — Vitest in watch mode.
- `npx vitest run <path>` — run a single test file (e.g. `npx vitest run src/adapters/doc-source/__tests__/manifest-url.test.ts`). Add `-t "<name>"` to match a single `it`/`describe`.
- `npm run typecheck` — `tsc --noEmit`. CI-equivalent correctness check; run before pushing.
- `npm run gen:schema` — regenerates `examples/results.schema.json` from `src/types/results.ts` (Zod → JSON Schema). Run after changing any of the `*Schema` exports in `src/types/`.
- `npx tsx scripts/verify-ingestion.ts` — smoke-tests the full ingestion pipeline end-to-end against `config/gutenberg-block-api.json` (clones Gutenberg, fetches ~10 docs). Network-dependent; produces clone under `tmp/`.

Node 20+ required. ESM throughout (`"type": "module"`); intra-package imports use `.js` suffixes even for `.ts` sources.

## Architecture

Read these in order when orienting: `PLAN.md` (phases + decisions) → `docs/prd.md` (requirements + user stories) → `docs/architecture.md` (why decisions were made) → `AGENTS.md` (role-scoped reviewing/implementation) → `src/pipeline.ts` (the wire-up).

### The contract is the center of gravity

`src/types/results.ts` and `src/types/mapping.ts` define every object that crosses a component boundary — `ManifestEntry`, `CodeTiers`, `Issue`, `DocResult`, `RunResults`. These are **Zod schemas with inferred TypeScript types**; the schemas are the source of truth, the types are derivatives. Two implications:

1. Every boundary-crossing value (config files, manifest JSON, Claude tool output, `results.json`) is parsed through a schema — no ambient trust.
2. `examples/mock-results.json` must round-trip `RunResultsSchema.parse()` successfully. It's the coordination artifact that lets the dashboard track build against a contract while the pipeline track is still implementing it. `examples/results.schema.json` is a generated artifact — never edit by hand; re-run `npm run gen:schema`.

`AGENTS.md` codifies this: `src/types/` is locked. Neither the Backend Engineer nor Frontend Engineer role is permitted to modify those contracts.

### Adapter pattern drives the pipeline

The pipeline (`src/pipeline.ts`) never imports concrete adapters. It depends on three interfaces — `DocSource`, `CodeSource`, `DocCodeMapper` — and asks `src/adapters/index.ts` to instantiate implementations based on config type strings:

```
config → adapters/index.ts factory → concrete adapter → pipeline uses interface only
```

`createDocSource` / `createCodeSources` throw `NotImplementedError` for unrecognised type strings. Those throws are the documented extension point — adding a new adapter means a new file plus one branch in `src/adapters/index.ts`, nothing else.

Current Phase 1 adapters:
- `manifest-url` (DocSource) — `src/adapters/doc-source/manifest-url.ts`. Fetches a Gutenberg-style `manifest.json`, filters by `parentSlug`, concurrently fetches each doc's raw markdown, strips frontmatter (`gray-matter`), counts code blocks + links (`remark`). Bounded concurrency via `p-limit(5)`.
- `git-clone` (CodeSource) — `src/adapters/code-source/git-clone.ts`. Shallow-clones a repo into `tmp/<slug>-<ref>/`, lazy-initialized on first `readFile` / `listDir` / `getCommitSha`. Subsequent runs reuse the cached `.git` dir.
- `manual-map` (DocCodeMapper) — `src/adapters/doc-code-mapper/manual-map.ts`. Loads a slug-keyed JSON file (see `mappings/`), cross-validates every `CodeFile.repo` against the configured `codeSources` at construction time (throws `ConfigError` on mismatch). Unknown slugs throw `MappingError`, which the pipeline now catches per-doc (see `pipeline.ts:30-36`) rather than aborting the run.

### Error-handling stance

The pipeline is designed to **produce a valid `RunResults` even when individual docs fail**. Failed fetches and mapping errors become per-doc `diagnostics` entries with `status: 'critical'` — never uncaught exceptions. Tests enforce this stance: see `src/types/__tests__/schemas.test.ts` (`runPipeline` block) and `src/adapters/doc-source/__tests__/manifest-url.test.ts` (error-handling block).

Adapter-level invariants worth knowing before touching this code:
- `deriveSourceUrl` in `manifest-url.ts` has two branches (URL-base transform vs. GitHub UI fallback); both are covered by tests. The transform requires a `/docs/` segment and falls through to the fallback if absent.
- `GitCloneSource.readFile(path, startLine?, endLine?)` only slices when **both** bounds are provided. Partial bounds silently return the full file — this is the current contract, pinned by tests.
- Metrics (`wordCount`, `codeExampleCount`, `linkCount`) are computed **at ingest**, not at validation time. The validator receives pre-parsed `Doc` objects.

### AGENTS.md and role boundaries

`AGENTS.md` defines three roles (Backend Engineer, Frontend Engineer, QA Engineer) with hard boundaries. When acting on a PR via `@claude act as the <Role>`, those boundaries are enforceable rules, not suggestions:

- Backend owns `src/pipeline.ts`, all adapters, validator, storage, config. Cannot touch `src/types/` or frontend.
- Frontend owns the static HTML dashboard + CLI. No frameworks, no build step (Tailwind via CDN). Cannot touch `src/types/`, pipeline, or validator.
- QA owns the entire test suite. Writes tests only — never modifies feature code, never weakens an existing assertion. "A test is only worth writing if it can fail."

Read `AGENTS.md` before assuming scope on any PR-driven task.

### Phase context

This repo is in **Phase 1 (PoC)** — ~10 docs from the Gutenberg Block API Reference, end-to-end. The Drift Validator and Dashboard are not yet implemented; `runPipeline` currently produces stub `DocResult`s with `healthScore: 0` and `status: 'critical'`. The `console.log` at `pipeline.ts:32` is intentional PoC-stage debug output and should not be mistaken for production logging. Phase 2 scope (symbol-search mapper, full handbook, weekly cron) is documented in `PLAN.md` and `docs/timeline.md` — do not proactively implement Phase 2 work unless a task explicitly targets it.

## Repository layout quick reference

- `src/adapters/` — interface types live in `types.ts` files next to implementations; `src/adapters/index.ts` is the factory registry.
- `src/types/` — **locked contracts.** Zod schemas that drive everything else.
- `config/*.json` — runtime configs (parsed through `src/config/schema.ts`).
- `mappings/*.json` — doc-slug → tiered code-file mappings. `mappings/test.json` is an empty `{}` used by the unit tests.
- `tests/fixtures/` — `mini-manifest.json`, `mini-mapping.json`, `sample-doc.md` for adapter tests.
- `examples/mock-results.json` — the canonical `RunResults` fixture; must round-trip through `RunResultsSchema`.
- `scripts/` — one-off tools (`bootstrap-mapping.ts` is a dev-time accelerator for generating mappings via Claude; `verify-ingestion.ts` is the end-to-end smoke test; `gen-schema.ts` regenerates the JSON Schema from Zod).
