# Architecture

Back to [PLAN.md](../PLAN.md).

Technical decisions, patterns, and the rationale behind them. Not a file map — for that, read the source. This document explains *why* the system is built the way it is and what to reach for when building each part.

---

## Contents

- [Stack](#stack)
- [Adapter Pattern](#adapter-pattern)
- [Project Foundation — Shared Contract](#project-foundation--shared-contract)
- [Doc Ingestion](#doc-ingestion-docsource)
- [Code Ingestion](#code-ingestion-codesource)
- [Doc–Code Mapping](#doccode-mapping-doccodemapper)
- [Drift Validator](#drift-validator)
  - [What counts as drift](#what-counts-as-drift)
  - [What does not count as drift](#what-does-not-count-as-drift)
- [Dashboard + CLI](#dashboard--cli)
- [Results Storage & History](#results-storage--history)
- [Risks and Mitigations](#risks-and-mitigations)

---

## Stack

**Node.js 20 + TypeScript (strict).** Matches the Gutenberg ecosystem tooling, has first-class support from the Anthropic SDK, and fits naturally into a GitHub Action (`setup-node`). Strict TypeScript catches interface mismatches between adapters at compile time, which matters when two devs build against the same contract.

**Zod for runtime validation.** All data that crosses a boundary — config files, manifest JSON, Claude's tool-use output, `results.json` — is validated with Zod schemas. The same schemas generate the JSON Schema for documentation and the TypeScript types for the rest of the codebase. Single source of truth; no manual sync.

**Anthropic SDK (`@anthropic-ai/sdk`).** Used with prompt caching (system prompt + shared code context cached across a run) and structured tool use (Claude emits typed `Issue[]` rather than free prose). Always fetch current SDK docs via the context7 MCP before writing Claude API code — caching and tool-use APIs change between model generations.

**`simple-git`** for repo operations. **`gray-matter` + `remark`** for markdown parsing (frontmatter extraction + code block / link counting). **`p-limit`** for bounded concurrency across docs. **`eta`** or plain template literals for HTML generation — no frontend framework, no build step. Tailwind via CDN keeps the dashboard self-contained.

**Config format: JSON.** Config files (`config/*.json`) and mapping files (`mappings/*.json`) use JSON rather than YAML — consistent with the rest of the data layer, no extra parser dependency, and easier to validate with the same Zod schemas used everywhere else.

---

## Adapter Pattern

Every component that touches an external system — doc sources, code sources, mappers, the validator — is behind an interface with a pluggable implementation. The pipeline wires adapters together at runtime from config; it doesn't import concrete implementations directly.

```
config.json
  └── adapter type string ("manifest-url", "git-clone", "manual-map", "claude")
        └── registry resolves → concrete adapter instance
              └── pipeline calls interface methods only
```

**Why:** isolates change. Adding a `wordpress-rest` DocSource doesn't touch the pipeline. Swapping the mapper from `manual-map` to `symbol-search` doesn't touch the validator. Unimplemented adapters throw `NotImplementedError` — they document the extension surface without adding dead code.

**Registry pattern:** a central `adapters/index.ts` maps type strings to factory functions. This is the only place where concrete adapter modules are imported. Everything else depends on the interface types.

---

## Project Foundation — Shared Contract

Before either track writes domain code, both agree on the shape of every data object the system passes around. These are the types that matter:

- **`ManifestEntry`** — one doc as listed in the index (`slug`, `title`, `markdown_source`, `parent`).
- **`CodeTiers`** — the code files mapped to a doc, split into `primary` / `secondary` / `context` tiers. Tiers are token-budget hints: primary is always sent; context is dropped first.
- **`Issue`** — one drift finding: `severity`, `type`, `evidence` (what the doc says vs. what the code says, with exact file + verbatim quote), `suggestion`, `confidence`, and a stable `fingerprint` hash used to track the same issue across runs.
- **`DocResult`** — the full analysis of one doc: health score, status, issues, positives, related code list with `includedInAnalysis` flags, and `diagnostics` (caveats like "2 mapped files not found").
- **`RunResults`** — the complete output of one pipeline run: all `DocResult`s, aggregated totals, overall health score.

A mock fixture (`examples/mock-results.json`) exercises every schema and unblocks dashboard development before any real pipeline output exists. This is the primary coordination mechanism between Track A and Track B.

---

## Doc Ingestion (`DocSource`)

**Purpose:** produce a normalised list of docs with their content, regardless of where they live. The rest of the pipeline — mapping, validation, dashboard — should never know whether a doc came from a git repo, a WordPress site, or a local filesystem. DocSource is the boundary that absorbs that complexity.

**Pattern:** source-agnostic fetch, normalised output. Each `DocSource` implementation returns `Doc[]` with a consistent shape regardless of where the docs came from.

**Phase 1 — `manifest-url`:** fetches a Gutenberg-style `manifest.json`, filters entries by `parent` slug, fetches each `markdown_source` URL, parses frontmatter via `gray-matter`, and counts code blocks + links via `remark`. Graceful 404/500 handling — a failed fetch produces a diagnostic, not a crash.

**Why manifest-first:** Gutenberg already publishes a `manifest.json`. Consuming it verbatim means zero maintenance for the doc index on the most important PoC target. Later sources (`wordpress-rest`, `fs-walk`) produce the same manifest shape so nothing downstream changes.

**Key decision — metrics at ingest time:** word count, code example count, and link counts are computed here during fetch, not during validation. The Validator receives a `Doc` that already has these; it never re-parses markdown.

---

## Code Ingestion (`CodeSource`)

**Purpose:** give the validator access to exact, current file contents from the source repository — the ground truth the docs are supposed to reflect. Without this, the validator would have to trust the doc's own claims about the code rather than verifying them directly.

**Pattern:** fetch-once, cache by commit SHA. The code source clones (or reads) a repository into a local cache dir and exposes `readFile(path)` and `listDir(path)`. Callers never know if the file came from a fresh clone or a cache hit.

**Phase 1 — `git-clone`:** shallow-clone via `simple-git` into a temp dir keyed by repo URL + commit SHA. On re-runs the cache dir exists and clone is skipped — the full run goes from ~30s clone to <1s. Exposes line-range reads (`readFile(path, startLine, endLine)`) for Pass 2 targeted verification.

**Key decision — commit SHA on `DocResult`:** the SHA of the code repo at analysis time is stored on every `DocResult`. This enables the change detector (deferred to Stretch): next run compares current SHA to stored SHA and skips docs whose mapped code hasn't changed.

**Release-pinning policy — `ref` per `codeSource` reflects what users actually run:** the `git-clone` adapter accepts a `ref` per source, and each source must pick a ref deliberately rather than defaulting to `trunk`. `trunk` contains unreleased code that no end user runs, so default-to-`trunk` flags healthy docs against unreleased refactors and silently approves docs describing APIs nobody can use yet.

Current policy for the Gutenberg Block API site (`config/gutenberg-block-api.json`):

- **`wordpress-develop` → current WP release branch** (e.g. `6.9`). The Block Editor Handbook's audience is running a stable WP release, so the WP-core side of the analysis is grounded against the code those users actually execute. Bumped manually when a new core major ships.
- **`gutenberg` → `trunk`**. The published Handbook (`developer.wordpress.org/block-editor/`) is generated from `gutenberg/trunk/docs/manifest.json`, so docs and code are read from the same ref — the comparison is internally consistent for the page as published.

Two extensions remain deferred (see [release-pinning.md](./design/release-pinning.md)): auto-resolving Gutenberg's latest plugin release tag — captures the orthogonal drift "doc claims an API that hasn't shipped to plugin users yet" — and the bundled-into-core Gutenberg snapshot (the version frozen into the pinned `wordpress-develop` branch, which is what core-only users actually run).

---

## Doc–Code Mapping (`DocCodeMapper`)

**Purpose:** tell the validator *which* code files are relevant to each doc. This is the bridge between the documentation world and the source world — without it, the validator would have no idea where to look and would either guess wrong or ignore large parts of the codebase. Getting the mapping right is the single biggest factor in the quality of the analysis.

**Pattern:** slug → tiered file list. The mapper answers "given this doc slug, which code files should the validator read?" It produces a `CodeTiers` object that the context assembler turns into a token-budgeted file set.

**Phase 1 — `manual-map`:** reads a slug-keyed JSON file checked into the repo. Deterministic, zero cost, auditable. A dev-time LLM helper (`scripts/bootstrap-mapping.ts`) proposes initial entries — it asks Claude "given this doc content and this repo file tree, which files are primary/secondary/context?" — but a human reviews and commits the result. The bootstrap script is a one-time accelerator, not a runtime dependency.

**Two files, decoupled concerns:**
- `manifest.json` (doc index) — *what docs exist*. Could be upstreamed, machine-generated, owned by doc authors.
- `mapping.json` (doc → code) — *what code each doc relates to*. Tool-specific knowledge, owned by the analysis team.

This separation means adding a new site requires only a new `mapping.json`. The manifest comes from the site itself.

**Phase 2 — `symbol-search`:** extracts symbols from doc prose and code fences (function names, hooks, attribute names, import paths), runs AST search over the Gutenberg codebase via `ast-grep` or `tree-sitter`, and ranks candidates by symbol specificity × package centrality × recency. Validated against Phase 1 manual mappings (target: ≥70% agreement on `primary`). The manual `mapping.json` becomes an overrides layer — corrections that the automatic search can't infer.

**Known limitation:** slug renames break mappings silently. If `block-metadata` is renamed in the manifest, the mapping key becomes stale and the validator reports "no mapping found." Mitigation is a lint step at run-start — deferred.

---

## Drift Validator

**Purpose:** determine whether each doc accurately describes the code it maps to, and produce actionable findings a doc author can act on. This is where the core problem is solved — comparing what a doc claims against what the code actually does, at a level of specificity that makes the output trustworthy rather than just suggestive. It also needs to confidently report when a doc is healthy, not just find problems.

**Pattern:** two-pass LLM evaluation with evidence requirements and a runtime fabrication check.

**Pass 1 — candidate generation.** A single Claude call with a cached system prompt receives the full doc + tiered code context assembled to a token budget (~50k tokens). Claude uses structured tool use to emit `Issue[]` — not free prose. Each issue must include a verbatim `codeSays` quote from the referenced file. A runtime check immediately after the call drops any issue where `evidence.codeSays` doesn't literally appear in the referenced file — catches hallucinations the prompt missed.

**Pass 2 — targeted verification.** For each surviving candidate, Claude can call a `fetch_code(path, startLine, endLine)` tool to read a specific file region and re-evaluate. Issues with `confidence < 0.7` are dropped. Critical/major issues with weak suggestions (generic words like "update", "revise") retry once; if still weak, the issue is dropped. Pass 2 can be cut entirely (fall back to confidence ≥ 0.8 threshold in Pass 1 only) if the Phase 0 validation gate reveals it adds noise rather than signal.

**Prompt caching:** the system prompt (which includes the drift definition, severity calibration, and evidence rules) and the shared code context are cached across the run. Cache hit rate >90% on a typical run cuts both cost and latency significantly.

**Positives:** the validator also emits evidence-backed `positives` — specific things the doc gets right. Capped at 3 per doc to force substantive picks, not boilerplate praise. The health report must be able to say "this doc is healthy" credibly, not just find problems.

**Health scoring:** `100 − (critical×15 + major×7 + minor×2)`, clamped 0..100. Thresholds: ≥85 = healthy, 60–84 = needs-attention, <60 = critical. Overall score = average across docs.

**Graceful degradation:** when the validator can't fully assess a doc (stale mapping, missing file, budget exhausted), it proceeds and records caveats in `DocResult.diagnostics`. No special `inconclusive` status — the dashboard shows diagnostics next to the score so readers know the assessment has caveats.

---

### What counts as drift

- Type signature changes (param added/removed/renamed, return type changed).
- Default value changes.
- Deprecated APIs shown as current or recommended.
- Code examples that would throw against current code.
- Function/hook/attribute names that no longer exist.
- Required parameters documented as optional (or vice versa).

### What does not count as drift

- Teaching simplifications — intentional omission of edge cases for clarity.
- Undocumented optional parameters (unless commonly used and their absence would surprise a reader).
- Style, grammar, typos.
- Broken external links (a future phase).

**Judgment rule for partial coverage:** if the documented behavior is a strict subset of actual behavior *and* the omission doesn't mislead a reader following the doc, it's not drift. If the omission would cause a reader's code to fail or produce a surprise, it is drift.

---

## Dashboard + CLI

**Purpose:** make the findings useful to doc authors, not just developers. The pipeline produces a `results.json`; the dashboard turns that into something a human can open, browse, and act on. The CLI is the operational entry point that ties everything together. These two concerns are coupled by the output format but otherwise independent — Track B can build and validate the full dashboard experience before a single real analysis run exists.

**Pattern:** pipeline orchestrator + static site generator, built against a contract not an implementation.

The CLI is the entry point: loads config, wires adapters, calls `runPipeline()`, writes `results.json`, invokes the dashboard generator. Track B builds the dashboard against the mock fixture from day one — `runPipeline()` is a stub that returns mock data until Track A's implementation lands. The CLI and dashboard never import concrete pipeline code directly; they depend on the `RunResults` type and the `runPipeline` function signature.

**Static HTML, no framework.** Templates (`eta` or plain template literals) + Tailwind CDN. No build step means the dashboard can be opened directly from the filesystem without a local server — important for the publish flow. Three page types: index (overall health + tree view), per-doc detail (issues, evidence, suggestions, positives, diagnostics), folder rollup (section aggregation).

**Tree structure:** docs are grouped by `parent` slug from the manifest. Folder health scores are weighted averages of their docs. The tree builder must handle ≥200 docs without layout collapse — Phase 2 adds collapse/expand and search/filter on top of the same data structure.

---

## Results Storage & History

**Purpose:** preserve every run's output so the dashboard can show trends over time and issues can be tracked across runs — without a database. The `gh-pages` branch doubles as both the published dashboard host and the append-only data store.

Run output is stored on the `gh-pages` branch, not in the source repo:

```
data/
  runs/<runId>/results.json     # one per run, never overwritten
  history.json                  # index: [{runId, timestamp, commitSha, overallHealth, totals}]
```

The `publish` script copies the generated `out/` into `gh-pages` while *preserving* any existing `data/runs/` dirs — it never clobbers prior run data.

**Issue fingerprinting:** `Issue.fingerprint` is a stable hash of `slug + type + evidence.codeFile + normalize(issue.text)`. Same fingerprint across runs = same issue. Tolerant of doc line shifts. Enables "new this week" and "persistent for N runs" badges without a database — the history index is the only persistent state.

**Retention:** no pruning for PoC. ~50–200 KB per `results.json` × 52 weeks ≈ 2–10 MB/year on `gh-pages`. Revisit if it grows.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| AI hallucination / false positives | Two-pass validation + runtime verbatim check + `confidence ≥ 0.7`. Clean-doc fixture in tests catches validator regression. |
| Pass 2 adds noise rather than signal | Phase 0 gate at 3 docs measures this explicitly. Fallback: cut Pass 2, tighten confidence to ≥ 0.8 for Pass-1-only ship. |
| Track A / Track B divergence | Day-1 schema handshake + mock fixture. Track B never blocks on Track A. |
| Mapping inaccuracy | Hand-curated via bootstrap script, reviewed and committed. Mapping errors are cheap to fix. |
| Slug renames breaking mappings silently | Deferred. A lint step at run-start will surface stale keys when we hit it. |
| Cost overrun | 50k input-token cap per doc + prompt caching. Per-run cost logged to console. Phase 2 adds a hard `--cost-cap` flag. |
| Premature abstraction | Adapter interfaces designed broadly, implemented narrowly. `NotImplementedError` stubs document the surface without adding dead code to maintain. |
