# Glossary

Domain vocabulary for the wp-docs-health-monitor pipeline. Terms here have load-bearing meaning in code, prompts, and review discussions — drifting in usage causes drifting in design. Update inline when a term is sharpened or coined; this file is meant to be edited as decisions crystallise, not written once.

For project narrative see [ARCHITECTURE.md](./ARCHITECTURE.md) (the *why*) and [PLAN.md](../PLAN.md) (the *when*). For architectural-review vocabulary used during refactors (module, interface, seam, depth, locality), see `.claude/skills/improve-codebase-architecture/LANGUAGE.md`.

---

## The locked contract (`src/types/`)

These are the shapes the pipeline passes around. Zod schemas are the source of truth; TypeScript types are derived. `examples/results.schema.json` is generated — never hand-edited.

### ManifestEntry

One doc as listed in a doc index. Fields: `slug`, `title`, `markdown_source`, `parent`.

### Doc

A fetched and parsed doc. Carries ingest-time metrics (`wordCount`, `codeExampleCount`, `linkCount`); the validator never re-parses markdown.

### CodeTiers

Code files mapped to a doc, bucketed `{ primary, secondary, context }`. Tiers are token-budget hints, not categories: primary is always sent, context is dropped first under pressure.

### Issue

One drift finding. Required fields: `severity`, `type` (Claim Type), `evidence` (`docSays` / `codeSays` / `codeFile` / `codeRepo`), `suggestion`, `confidence`, `fingerprint`.

### DocResult

Full per-doc analysis: `healthScore`, `status`, `issues`, `positives`, `relatedCode`, `diagnostics`, `commitSha`, `analyzedAt`.

### RunResults

Envelope for one pipeline run: `runId`, `timestamp`, `overallHealth`, `models`, `repoUrls`, `repoRefs`, `totals`, `usage`, `docs[]`.

---

## Adapter slots

Four slots wired up by `src/adapters/index.ts` from `config.json`. Each is an interface; the pipeline never imports concrete adapters directly.

### DocSource

Produces `Doc[]` regardless of where docs live. Phase-1 adapter: `manifest-url`.

### CodeSource

Exposes `readFile(path, startLine?, endLine?)` and `getCommitSha()` against a repo pinned at a ref. Phase-1 adapter: `git-clone`. Note: `readFile` only slices when *both* line bounds are provided; partial bounds silently return the full file.

### DocCodeMapper

Answers "given this doc slug, which code files belong to which tier?" Returns `CodeTiers`. Phase-1 adapter: `manual-map` (slug-keyed JSON).

### Validator

`validateDoc(doc, codeTiers, codeSources) → DocResult`. Phase-1 adapter: `claude` (two-pass LLM).

---

## Validator vocabulary

### Pass 1

Candidate generation. Single Claude call with cached system prompt + tiered code context; structured tool use returns `RawIssue[]`.

### Pass 2

Targeted verification. Per-candidate agentic call that may use the `fetch_code(repo, path, startLine, endLine)` tool to re-inspect a region before confirming or rejecting.

### Verbatim Check

Runtime hallucination guard between Pass 1 and Pass 2. Both `evidence.docSays` and `evidence.codeSays` must literally appear (modulo whitespace and Markdown link normalisation) in the doc and the cited file. The `nonexistent-name` Claim Type is exempted from the `codeSays` half — absence has no quote to find.

### Drift

The system's narrow definition: a doc claim contradicts current code in a way that would mislead a reader following the doc. See `ARCHITECTURE.md` § *What counts as drift* / *What does not count as drift* for the load-bearing list.

### Evidence

Required pair on every Issue: `docSays` (verbatim doc quote) + `codeSays` (verbatim code quote, with file path). The contract that makes findings auditable.

### Authority

Per-section judgement of what a context section is canonical for. Appears as inline prompt notes ("Authoritative for: signatures. NOT authoritative for: runtime behaviour"). Some authority is structural and config-derivable; some is per-corpus and prose.

### Claim Type

Values in `Issue.type`: `type-signature`, `default-value`, `deprecated-api`, `broken-example`, `nonexistent-name`, `required-optional-mismatch`. The Verbatim Check and several prompt rules key off this.

### Confidence

0..1 self-reported by the model on each candidate. Pass 2 drops `< 0.7`.

### Weak Suggestion

A suggestion that doesn't name a concrete identifier or matches a generic phrase ("update the documentation", "revise this section"). Critical/major weak suggestions get one retry; if still weak, dropped. Minor weak suggestions are dropped without retry.

### Self-Rejection

Pass 2 sometimes drafts a finding and then explicitly rejects it ("rejected: …", "no change needed"). Such suggestions cause the Issue to be dropped.

### Candidate

An Issue that has passed Pass 1 but not yet Pass 2. Internally typed today as `RawIssue` / `Pass1Candidate`; the term *Candidate* is the conventional one in design discussion.

### Fingerprint

Stable hash stamped on every surviving `Issue`. Same fingerprint across runs = same issue. Powers "new this week" / "persistent for N runs" badges without a database.

### Positive

Evidence-backed claim that the doc gets something right. Capped at 3 per doc to force substantive picks. The health report must be able to credibly say a doc is healthy, not only find problems.

---

## Health and status

### Health Score

`100 − (critical × 15 + major × 7 + minor × 2)`, clamped 0..100.

### Status

Derived from score: `healthy` (≥85) / `needs-attention` (60–84) / `critical` (<60). Plus `not-mapped` (no mapping entry → `healthScore: null`, doc excluded from the run average).

### Diagnostic

Per-doc caveat string. Used when assessment has known limits (missing file, fetch error, validator throw). Never an `inconclusive` status — the dashboard renders score + diagnostics side-by-side instead.

### Overall Health

Average `healthScore` across docs whose `status !== 'not-mapped'`.

---

## Mapping and ingestion

### Slug

The join key between Manifest and Mapping. Slug renames break mappings silently — known Phase-2 lint target.

### Manifest

Site-published doc index. Decoupled from Mapping by design: doc sites can own and regenerate the manifest; mapping is owned by the analysis team.

### Mapping

Slug → tiered file list. Hand-curated JSON in Phase 1. The bootstrap script (`scripts/bootstrap-mapping.ts`) is a dev-time accelerator, not a runtime dependency.

### Tier

One of `primary` / `secondary` / `context`. Token-budget hint: primary always sent, context dropped first.

### Site

One configured docs-and-code pair (one config file + one mapping file). The pipeline is generic; per-site knowledge lives in config plus optional Site Extension.

---

## Layering rule (where prompt rules belong)

When a new validator rule is needed, walk these layers broadest-first and pick the broadest one the rule honestly fits.

### Common system prompt

`src/adapters/validator/prompts/system.md`. Rules true for *any* docs/code pair regardless of language, framework, corpus.

### Language Pack

`prompts/lang-<lang>.md` (e.g. `lang-jsts.md`, `lang-php.md`). Conventions true for any corpus in that ecosystem. Sites declare which packs apply via `validator.languagePacks` in config. *Not yet present in `prompts/` — only `system.md` ships today.*

### Config field + auto-injection

Declarative facts that vary per site (e.g. `internalPrefixes`, `documentedSchemas`). The assembler injects rule text from structured config at prompt-build time.

### Site Extension

`prompts/<site>.md`. One-corpus carve-outs and the TP/FP example list earned from real reviews on this corpus. Discipline: before writing here, articulate in one sentence why the rule cannot live in a broader layer.

---

## Operational vocabulary

### Run

One invocation of `runPipeline()`. Identified by `runId` (`YYYYMMDD-HHMMSS`).

### Cost Accumulator

Token tally on the validator, summed across Pass 1, Pass 2, and retries. Translated to USD via `config.pricing` and emitted on `RunResults.usage`.

### Experiment Seam

Public entry point used by scripts to vary one pipeline stage without rerunning the full pipeline. Today: `Validator.runPass1Only(...)` (skip Pass 2 and the Verbatim Check) and the `DUMP_PASS1=1` env gate (capture raw Pass 1 output for diagnosis).

### Dashboard

Static HTML site generated from `RunResults`. No build step; Tailwind via CDN. Three page types: index, per-doc detail, folder rollup.

### History

Append-only `data/history.json` on `gh-pages`, indexing every run for trend rendering. The branch doubles as published dashboard host and data store.

### Stretch / Phase 2

Explicit "later" buckets in `PLAN.md`. The `symbol-search` mapper, the `wordpress-rest` DocSource, the change detector, and release-ref pinning all live here.
