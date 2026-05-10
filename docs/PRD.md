# PRD: WP Docs Health Monitor

Reading order: [PLAN.md](../PLAN.md) (phases) → this file (requirements) → [docs/ARCHITECTURE.md](./ARCHITECTURE.md) (why decisions were made).

---

## Problem statement

Documentation on developer.wordpress.org drifts from the code it describes silently.
API signatures change, parameters get renamed or removed, code examples stop working —
and no one knows. There is no systematic way for a doc author to find out which pages
need attention today, which are genuinely accurate, or what specifically is wrong.

The result is invisible rot: outdated docs that mislead developers, erode trust, and
create support burden with no one empowered to fix it because no one has a prioritised
list of what is wrong.

## Solution

An automated CLI tool that pulls documentation and source code, uses Claude to compare
them, and publishes a static dashboard a doc author can open to see the health of the
docs at a glance — overall score, per-doc issues ranked by severity with exact evidence
and suggested fixes, and explicit confirmation when docs are accurate.

---

## User stories

### Doc author (primary persona)

1. As a doc author, I want to see an overall health score (0–100) for the Block API
   Reference docs so that I know at a glance how the set is doing without reading every
   page.

2. As a doc author, I want to see all docs ranked by health score in a tree grouped by
   section so that I can decide where to start — worst first, or by section.

3. As a doc author, I want each issue to include an exact verbatim quote from the source
   code that contradicts what the doc says so that I can verify the finding is real
   before I start writing.

4. As a doc author, I want each issue to include a specific suggested fix so that I know
   what to change, not just that something is wrong.

5. As a doc author, I want to see what the doc gets RIGHT so that I do not waste time
   fixing things that are already correct, and so I can trust the tool is not just a
   bug list.

6. As a doc author, I want issues classified by severity (critical / major / minor) so
   that I can prioritise the changes that matter most to readers.

7. As a doc author, I want the tool to explicitly confirm when a doc is healthy so that
   "no issues" means "verified accurate," not "analysis failed silently."

8. As a doc author, I want to see a direct link to the original doc source for each
   result so that I can navigate straight to the page to start editing.

9. As a doc author, I want to see which code file each issue was found in so that I can
   read the current code myself and form my own judgement.

### Developer operating the tool

10. As a developer, I want a single CLI command (`npm run analyze`) to run the full
    analysis from a config file so that I do not need to understand the internals to
    get results.

11. As a developer, I want the output to be a static HTML site I can open directly from
    the filesystem so that sharing results requires no server or deployment
    infrastructure.

12. As a developer, I want a full 10-doc run to cost less than $1 so that it is viable
    to run regularly and share with non-technical stakeholders.

13. As a developer, I want failed doc fetches and missing mappings to appear as
    diagnostics on the affected result — not as crashes — so that a partial run is
    still useful.

14. As a developer, I want to define which code files are relevant to each doc in a
    JSON config file so that I can tune the analysis without modifying any code.

15. As a developer, I want each run's results stored with a unique run ID so that prior
    runs are preserved and I can compare over time.

### Automated system (Phase 2)

16. As the weekly cron job, I want to run the full analysis and publish the dashboard
    on a schedule without manual intervention so that the health score is always
    current.

17. As the weekly cron job, I want a hard cost cap enforced at runtime so that a
    runaway run cannot exceed a configured budget.

18. As a returning dashboard visitor, I want to see a trend line of the overall health
    score across past runs so that I can tell whether things are getting better or
    worse over time.

19. As a returning dashboard visitor, I want each issue badged as "new this week" or
    "persistent for N runs" so that I can see whether a problem is being addressed.

---

## Implementation decisions

### Validator design

- **Two-pass evaluation.** Pass 1 generates candidate issues; each must include a
  verbatim `codeSays` quote from the referenced file. A runtime check immediately
  drops any issue where the quote does not literally appear in the file — this catches
  hallucinated quotes before they reach output. Pass 2 uses targeted file reads
  (`fetch_code`) to re-evaluate surviving candidates.

- **Symbol existence pre-pass.** Before any Claude call, extract backtick-wrapped
  identifiers from the doc and check which do not appear in any assembled source file.
  Inject these as "potentially removed APIs" into the Pass 1 prompt. Relax the
  verbatim check for `nonexistent-name` issues — the evidence is absence, not a quote.
  This closes the blind spot where removed APIs are missed entirely because there is
  no code to quote as counter-evidence. (Discovered during the first real end-to-end
  run: `block-patterns` `source` property documented but absent from the registry.)

- **Confidence threshold.** Issues with `confidence < 0.7` are dropped after Pass 2.
  Critical/major issues with generic suggestions ("update", "revise") retry once with
  a sharper prompt; still weak → drop.

- **Eager code source warm-up.** All `git-clone` code sources are initialised in
  parallel at pipeline startup — before the validator loop — not lazily on first file
  read. Ensures commit SHAs are available upfront on all `DocResult`s and repos are
  ready before `p-limit(3)` concurrent validation begins.

- **Health score.** `100 − (critical×15 + major×7 + minor×2)`, clamped 0–100.
  Thresholds: ≥85 healthy, 60–84 needs-attention, <60 critical.

- **Positives.** Claude emits up to 3 evidence-backed positives per doc. This is what
  makes a `healthy` status meaningful — the tool must say what it verified, not just
  what it found wrong.

- **Prompt caching.** System prompt and shared code context are cached via the
  Anthropic SDK. Target cache hit rate >90%. Primary cost lever.

### Data contracts

- Zod schemas are the single source of truth. TypeScript types are derived from them,
  never declared separately. All boundary data (config, manifest JSON, Claude tool
  output, `results.json`) is validated at runtime.
- `src/types/` is locked — no pipeline or dashboard code modifies it after Phase 1.
- `examples/mock-results.json` must always pass `RunResultsSchema.parse()`. It is the
  coordination artifact between parallel tracks: the dashboard never waits for the
  pipeline.

### Adapter pattern

- The pipeline never imports concrete adapters. Three interfaces — `DocSource`,
  `CodeSource`, `DocCodeMapper` — are resolved from config type strings at runtime.
- Unimplemented adapters throw `NotImplementedError`, documenting extension points
  without adding dead code.

### Dashboard

- Static HTML with Tailwind CDN. No framework. No build step. Must open from the
  filesystem without a local server.
- Three page types: index (overall health + tree view by section), per-doc detail
  (issues, evidence, suggestions, positives, diagnostics, source link), folder rollup
  (section aggregation with weighted health scores).
- At scale (Phase 5) the index includes a sortable, filterable table view. Columns:
  health score, issue count, max severity, section/parent, status, estimated cost,
  last analyzed, new-this-run badge, persistent-N-runs badge. This makes the dashboard
  an operational tool, not just a report.

### Results storage

- `gh-pages` branch doubles as static host and append-only data store:
  `data/runs/<runId>/results.json` + `data/history.json` index.
- Publish script preserves all existing run directories. Never overwrites prior data.
- Each `results.json` carries an optional `usage` field populated by the pipeline once
  real Claude calls are wired up (Phase 3+):
  ```json
  "usage": {
    "inputTokens": 123456,
    "outputTokens": 23456,
    "cacheReadTokens": 90000,
    "cacheWriteTokens": 12000,
    "estimatedCostUsd": 3.42
  }
  ```
  The field is optional so Phase 1–2 fixtures validate without it.
- Issue fingerprinting: stable hash of `slug + type + codeRepo + codeFile`.
  Deliberately excludes LLM-generated text — Claude may paraphrase the same finding
  differently across runs, which would produce a different hash and make persistent
  issues look new. Using only structured fields ensures the same issue maps to the
  same fingerprint even when the description varies. Enables story 19 without a
  database. Multiple issues of the same `type` on the same file for the same doc are
  rare in practice given the specificity of the type enum.

### Operability

The dashboard must surface enough information to answer "what did this run cost and
was it within budget?" for both development runs and production crons.

Required information per run (rendered in the dashboard index header):

| Field | Description |
|-------|-------------|
| Run cost | `estimatedCostUsd` from `usage` |
| Input tokens | raw + formatted with commas |
| Output tokens | raw + formatted with commas |
| Cache hit rate | `cacheReadTokens / (inputTokens + cacheReadTokens)` × 100% |
| Cost cap | configured value; highlight in red if run approached it |
| Docs analyzed | count from `totals.docs` |
| Docs skipped | count from diagnostics entries |
| Run duration | seconds from start to completion |

This information also answers the "how much does it cost at scale?" question:
measuring real token usage per doc makes projecting to 150–200 docs straightforward
without guessing.

---

## Out of scope

- Grammar, style, or typo fixes in docs
- Broken external link detection
- Auto-opening PRs or drafting post updates (read-only for now)
- `wordpress-rest` DocSource — WordPress-hosted docs pulled via REST API; replaced in
  Phase 2 by the scraper-repo pattern (a separate repo fetches and commits WP pages
  as markdown; this tool clones that repo like any other)
- `fs-walk` DocSource — markdown repos without a manifest
- Auto-generated package READMEs — excluded from the manifest; low drift signal
- Themes Handbook, WooCommerce docs, A8C-internal sites (post-Phase 2)
- Historical trend UI for Phase 1 PoC — data groundwork ships in Phase 1; the UI
  needs at least two real runs to be meaningful
- Change detector (skip docs whose code SHA hasn't changed since last run) — Phase 2
  cost lever

---

## Further notes

### On false positives vs false negatives

The worst outcome is a tool that cries wolf. A doc author who sees two false positives
stops trusting the output and ignores real findings. Every mechanism in the validator
(verbatim check, symbol pre-pass, confidence threshold, Pass 2, two-retry rule) exists
to push precision high. The Phase 0 gate (3-doc manual run before scaling) is the
empirical check that these mechanisms are actually working.

### On "healthy" as a first-class outcome

A tool that only finds problems cannot be trusted. If it reports nothing, you cannot
know whether the doc is clean or whether the analysis failed silently. Positives (up to
3 per doc) and an explicit `healthy` status exist to make the tool's silence
meaningful. Story 7 is one of the most important acceptance criteria in this PRD.

### On the DOCER research

The `lastModified` decision (capture at ingest, anchor validation to the code revision
current when the doc was last edited) and `codeElementRefs` extraction are informed by
Tan, Wagner & Treude (2024) "Detecting outdated code element references in software
repository documentation." Without `lastModified`, any API added to Gutenberg after
the last doc edit would produce false positives.

### On release pinning

Each `codeSource` pins its `ref` to reflect what users actually run for that channel:
`wordpress-develop` to the current WP release branch (`6.9` today), `gutenberg` to
`trunk` (the published Handbook is generated from trunk, so the comparison is
internally consistent). Two extensions remain deferred: auto-resolving Gutenberg's
latest plugin release tag, and the bundled-into-core Gutenberg snapshot. See
[ARCHITECTURE.md § Code Ingestion](./ARCHITECTURE.md#code-ingestion-codesource) for
the applied policy and [docs/design/release-pinning.md](./design/release-pinning.md)
for the deferred work.
