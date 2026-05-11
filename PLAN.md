# WP Docs Health Monitor — Plan

Reading order: this file first (phases + decisions) → [docs/PRD.md](./docs/PRD.md)
(full requirements with user stories) → [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
(why each decision was made) → [AGENTS.md](./AGENTS.md) (role boundaries).

The original plan (component breakdown, timeline, backlog) is preserved in
[PLAN-original.md](./PLAN-original.md) for reference.

---

## Contents

- [How to prompt each phase](#how-to-prompt-each-phase)
- [MVP framing](#mvp-framing)
- [Phase 1 — Foundation](#phase-1--foundation--complete)
- [Phase 2 — Tracer bullet](#phase-2--tracer-bullet)
- [Phase 3 — Full pipeline + Phase 0 gate](#phase-3--full-pipeline--phase-0-gate)
- [Phase 4 — Integration + Publish](#phase-4--integration--publish)
- [Phase 5 — Scale](#phase-5--scale-weeks-24)
- [Durable architectural decisions](#durable-architectural-decisions)

---

## How to prompt each phase

For every phase, open a fresh context window and use this prompt:

```
Do [phase name] from @docs/PRD.md and @PLAN.md.
User stories in scope: [numbers from PRD.md].
[Paste the phase block below.]
```

That is all. The PRD is the destination; this file is the journey; the phase block
scopes the work. After each phase: commit, clear context, move to the next.

---

## MVP framing

The phases map onto three product MVPs. This overlay is useful for communicating
scope and validating signal at each level before investing in the next.

| MVP | Phases | Goal |
|-----|--------|------|
| **MVP 1 — Tracer bullet** | [Phase 2 — Track A](#track-a--one-doc-full-stack) | One doc, full stack, result to console. Does the idea work? |
| **MVP 2 — PoC usable (local)** | [Phase 2 — Track B](#track-b--dashboard-against-mock-parallel) + [Phase 3](#phase-3--full-pipeline--phase-0-gate) | Ten docs, dashboard browsable locally, real issues, cost measured. Does it generate useful signal? |
| **MVP 3 — PoC published** | [Phase 4](#phase-4--integration--publish) + [Phase 5](#phase-5--scale-weeks-24) | Dashboard published to GitHub Pages, ~150 docs, weekly cron, historical UI, cost cap. |

Acceptance criteria scale with the MVP:

- **MVP 1:** one `DocResult` produced end-to-end; at least one real issue detected OR
  explicit `healthy` status; cost < $0.10.
- **MVP 2:** precision ≥ 80%; zero false positives on a known-clean doc; dashboard
  renders all three page types locally; `usage` field populated in `results.json`; full
  10-doc run < $1.
- **MVP 3:** dashboard publicly reachable at GitHub Pages; 150-doc run under cost cap;
  cron runs unattended; historical badges correct across ≥ 2 archived runs; dashboard
  responsive with 150 docs.

---

## Phase 1 — Foundation ✅ complete

*Schemas locked. Mock fixture passing. Both tracks can work independently.*

**What was built:** Zod schemas (`ManifestEntry`, `CodeTiers`, `Issue`, `DocResult`,
`RunResults`, `Config`), stub `runPipeline()`, `fingerprintIssue()`,
`examples/mock-results.json` passing `RunResultsSchema`, `results.schema.json`
generated via `npm run gen:schema`. Doc and code ingestion pipeline (`manifest-url`,
`git-clone`, `manual-map`) with unit tests.

**Durable decisions locked here:**
- Zod schemas are the source of truth; `src/types/` is frozen for the rest of the project
- `examples/mock-results.json` is the coordination artifact between tracks
- Adapters registered by config type string; `NotImplementedError` for unimplemented ones

---

## Phase 2 — Tracer bullet

*User stories: 3, 5, 7, 9, 10, 13, 14*

Both tracks run in parallel. Track A confirms full pipeline integration on a single doc.
Track B builds the complete dashboard presentation layer against the mock fixture. By
the end of this phase, every layer of the system has been touched at least once — the
biggest unknown unknowns are flushed out before the full build begins.

### Track A — One doc, full stack

Wire the entire pipeline on a single doc (`block-metadata`): manifest fetch → git clone
→ mapping lookup → symbol existence pre-pass → Pass 1 Claude call → verbatim check →
health scorer → `DocResult` printed to console. No Pass 2 yet. No CLI flags. No
`results.json` write.

**Symbol pre-pass belongs here.** Implement `extractDocSymbols()` and
`findMissingSymbols()` in `context-assembler.ts` and inject the "potentially removed
APIs" hint into the Pass 1 prompt in the same session. (This closes the blind spot
discovered in the first real run: `block-patterns` `source` property was documented
but absent from the registry — the verbatim check cannot catch a removed API because
there is no code to quote.)

**Eager clone warm-up belongs here.** Call `getCommitSha()` on all code sources in
parallel before the validator loop begins. This ensures commit SHAs are available
upfront for all `DocResult`s and that repos are ready before concurrent validation
starts.

**Done when:** a one-off script produces a valid `DocResult` for `block-metadata` with
at least one real issue OR an explicit `healthy` status. Cost: <$0.10. Commit.

### Track B — Dashboard against mock (parallel)

Complete static HTML dashboard against `examples/mock-results.json`. All three page
types rendered and linking correctly:
- Index: overall health %, tree view grouped by parent slug with per-folder scores
- Per-doc detail: issues (severity, confidence, quoted evidence, suggested fix),
  positives, related-code list, diagnostics strip, source URL link
- Folder rollup: section-level aggregation

Tailwind CDN. No build step. Must open from the filesystem.

**Done when:** `npm run dashboard -- --input examples/mock-results.json --output ./out`
produces a browsable static site with working navigation between all three page types.
Commit.

---

## Phase 3 — Full pipeline + Phase 0 gate

*User stories: 1, 2, 4, 6, 8, 11, 12, 13, 14, 15*

Extend the Phase 2 tracer bullet to all 10 mapped docs. Add Pass 2 (targeted
`fetch_code` verification, `confidence < 0.7` dropped, weak-suggestion retry logic).
Wire into CLI with `--config` and `--output` flags. Write
`out/data/runs/<runId>/results.json`. Add `p-limit(3)` concurrency and a per-run cost
meter printed at completion.

**Usage tracking belongs here.** Accumulate `inputTokens`, `outputTokens`,
`cacheReadTokens`, `cacheWriteTokens` across all Claude calls in the run. Compute
`estimatedCostUsd` using the current Sonnet 4.6 pricing. Populate `RunResults.usage`
before writing `results.json`. Print a cost summary to console at run completion:
```
Run complete: 10 docs | $0.42 | 98,234 input | 12,100 output | cache hit 88%
```

Then run the **Phase 0 gate** before calling this phase complete.

### Phase 0 gate

Manually read 3 docs against their primary code files. Write down the real issues.
Run the validator. Measure:

| Metric | Target |
|--------|--------|
| Precision (true positives / issues reported) | ≥ 80% |
| Recall (true positives / human-found issues) | ≥ 70% |
| False positives on known-clean doc | = 0 |

Suggested docs:

| Role | Slug | Why |
|------|------|-----|
| Known-drifted | `block-registration` | Large API surface, higher chance of drift |
| Known-clean | `block-context` | Small, stable API |
| Uncertain | your pick | Interesting signal |

Document the decision in the commit message and PR:

- **Go** — precision ≥ 80% AND clean doc shows 0 issues → proceed as-is
- **No-go** — iterate system prompt up to half a day, then cut Pass 2 and raise
  confidence threshold to ≥ 0.8 for a Pass-1-only ship
- **Abort** — still failing after cuts → honest conversation about PoC viability

Outcome: gate passed 2026-04-28 with precision 6/6 and 0 clean-doc FPs (run
`20260428-190955`).

**Done when:** `npm run analyze -- --config config/gutenberg-block-api.json
--output ./out` produces valid `RunResults` with real issues on drifted docs and 0
issues on healthy docs, for under $1. Commit.

---

## Phase 4 — Publish *(MVP 3)*

*User stories: 1, 2, 4, 5, 6, 7, 8, 11, 12, 15*

Add `scripts/publish.sh` (aliased as `npm run publish`): uses a `gh-pages` git
worktree, copies `out/` into it while preserving any existing `data/runs/<runId>/`
directories from prior runs, commits, pushes. A second run must append to `data/runs/`
without clobbering the first.

Fix any edge cases that only appear with real results (empty issue lists, diagnostics
present, varied severity distributions) before publishing.

**Done when:** `npm run analyze && npm run publish` results in a publicly reachable
dashboard at `https://juanma-wp.github.io/wp-docs-health-monitor/`. Commit.

---

## Phase 5 — Scale (Weeks 2–4)

*User stories: 16, 17, 18, 19. Break into issues at Phase 4 completion.*

Coarse milestones only — scope depends on Phase 3 and 4 findings.

- **Symbol-search mapper** — auto-generate mappings for ~150 docs via AST search;
  validated against Phase 3 manual mappings (≥70% agreement on primary files).
  Manual mappings have priority: if a slug already has a hand-written entry in
  `mappings/*.json`, the auto-generated mapping is stored separately (e.g.
  `mappings/gutenberg-block-api.auto.json`) and never overwrites it. The pipeline
  merges both at load time, preferring manual entries on conflict.
- **Editorial filter** — exclude auto-generated package READMEs; ~424 → ~150 docs
- **DocSource git-refactor** — share the existing Gutenberg clone between DocSource
  and CodeSource; eliminates 150+ per-doc HTTP requests per run
- **Pipeline at scale** — `p-limit(5)`, `--cost-cap` flag, checkpointing on `SIGINT`
- **Dashboard at scale** — collapse/expand tree, sortable/filterable table view,
  <1s initial load. Table columns: health score, issue count, max severity,
  section/parent, status (healthy/needs-attention/critical), estimated cost,
  last analyzed, new-this-run badge, persistent-N-runs badge. Sortable on all
  numeric/enum columns; filterable by section, status, and free-text slug/title.
- **GitHub Action** — weekly cron Mon 06:00 UTC, `--cost-cap 5`, auto-publish
- **Historical UI** — trend line across runs, "new this week" / "persistent N runs"
  badges via `Issue.fingerprint`

---

## Durable architectural decisions

Safe to rely on across context windows. Unlikely to change in any phase.

| Decision | Value |
|----------|-------|
| Runtime | Node.js 20, ESM throughout, `.js` suffixes on intra-package imports |
| Type contracts | Zod schemas in `src/types/`; TypeScript types are derived, never duplicated |
| Adapter registry | `src/adapters/index.ts`; factory functions keyed by type string |
| Claude model | Sonnet 4.6 for Pass 1 + Pass 2; prompt caching on system prompt + code context |
| Dashboard stack | Static HTML + Tailwind CDN; no framework; no build step |
| Storage | `gh-pages` branch; `data/runs/<runId>/results.json` + `data/history.json` |
| Concurrency | `p-limit(3)` for Phase 1 PoC; `p-limit(5)` at scale |
| Health formula | `100 − (critical×15 + major×7 + minor×2)`, clamped 0–100 |
| Confidence cutoff | Issues below 0.7 are dropped; never shown in output |
