# WP Docs Health Monitor — Plan

Reading order: this file first (phases + decisions) → [docs/prd.md](./docs/prd.md)
(full requirements with user stories) → [docs/architecture.md](./docs/architecture.md)
(why each decision was made) → [AGENTS.md](./AGENTS.md) (role boundaries).

The original plan (component breakdown, timeline, backlog) is preserved in
[PLAN-original.md](./PLAN-original.md) for reference.

---

## Contents

- [How to prompt each phase](#how-to-prompt-each-phase)
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
Do [phase name] from @docs/prd.md and @PLAN.md.
User stories in scope: [numbers from prd.md].
[Paste the phase block below.]
```

That is all. The PRD is the destination; this file is the journey; the phase block
scopes the work. After each phase: commit, clear context, move to the next.

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

Document the decision in `docs/phase-0-results.md`:

- **Go** — precision ≥ 80% AND clean doc shows 0 issues → proceed as-is
- **No-go** — iterate system prompt up to half a day, then cut Pass 2 and raise
  confidence threshold to ≥ 0.8 for a Pass-1-only ship
- **Abort** — still failing after cuts → honest conversation about PoC viability

**Done when:** `npm run analyze -- --config config/gutenberg-block-api.json
--output ./out` produces valid `RunResults` with real issues on drifted docs and 0
issues on healthy docs, for under $1. `docs/phase-0-results.md` records the decision.
Commit.

---

## Phase 4 — Integration + Publish

*User stories: 1, 2, 4, 5, 6, 7, 8, 11, 12, 15*

**Track B:** Swap `examples/mock-results.json` for the real `results.json` produced by
Phase 3. Confirm all three page types render correctly with real data. Fix any edge
cases that only appear with real results (empty issue lists, diagnostics present, varied
severity distributions).

Add `scripts/publish.sh` (aliased as `npm run publish`): uses a `gh-pages` git
worktree, copies `out/` into it while preserving any existing `data/runs/<runId>/`
directories from prior runs, commits, pushes. A second run must append to `data/runs/`
without clobbering the first.

**Done when:** `npm run analyze && npm run publish` results in a publicly reachable
dashboard at `https://juanma-wp.github.io/wp-docs-health-monitor/`. Commit.

---

## Phase 5 — Scale (Weeks 2–4)

*User stories: 16, 17, 18, 19. Break into issues at Phase 4 completion.*

Coarse milestones only — scope depends on Phase 3 and 4 findings.

- **Symbol-search mapper** — auto-generate mappings for ~150 docs via AST search;
  validated against Phase 3 manual mappings (≥70% agreement on primary files)
- **Editorial filter** — exclude auto-generated package READMEs; ~424 → ~150 docs
- **DocSource git-refactor** — share the existing Gutenberg clone between DocSource
  and CodeSource; eliminates 150+ per-doc HTTP requests per run
- **Pipeline at scale** — `p-limit(5)`, `--cost-cap` flag, checkpointing on `SIGINT`
- **Dashboard at scale** — collapse/expand tree, search/filter, <1s initial load
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
