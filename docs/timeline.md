# Timeline

Back to [PLAN.md](../PLAN.md) · Tasks in [backlog.md](./backlog.md) · Architecture in [architecture.md](./architecture.md).

The distribution of work in [backlog.md](./backlog.md) across the month, expressed as **named milestones**. Each milestone has a target date, an owner, and a concrete "done when" check.

Dates are aspirational — adjust as reality hits. The *sequence* and *gates* matter more than the exact day.

---

## At a glance

| Phase | Window | Goal |
|-------|--------|------|
| **Week 1 — PoC** | 2026-04-21 → 2026-04-27 | 10 docs from Block API Reference, CLI + static dashboard, live publicly |
| **Week 2 — Automate mapping** | 2026-04-28 → 2026-05-03 | Symbol-search mapper; dashboard at scale |
| **Week 3 — Scale + CI** | 2026-05-04 → 2026-05-10 | 150-doc pipeline run; GitHub Action with weekly cron |
| **Week 4 — History & demo** | 2026-05-11 → ~2026-05-15 | Historical UI; full run; write-up |

**Capacity:** 2 devs × ~5 days × 6 focused hours ≈ 60 dev-hours per week. Plan ~50 productive, 20% buffer.

---

## Week 1 — PoC milestones

### ⚑ W1-M1: Foundation locked (target: end of Day 1 — Mon)

- **Owner:** Both (pair session)
- **Delivers:** Issue #1
- **Done when:** `main` contains the repo skeleton, all zod schemas (`MappingSchema`, `IssueSchema` with `fingerprint`, `DocResultSchema` with `diagnostics`, `RunResultsSchema`, `ConfigSchema`), stub `runPipeline()`, `fingerprintIssue()` helper, and `examples/mock-results.json` validating green. Both tracks can start independently tomorrow.

### ⚑ W1-M2: Ingestion pipeline ready (target: end of Day 2 — Tue)

- **Owner:** Track A
- **Delivers:** Issue #2
- **Done when:** `runPipeline` (with validator stubbed) prints each slug + its `primary` code-file list for all ~10 Block API Reference docs. `mappings/gutenberg-block-api.json` seeded via `scripts/bootstrap-mapping.ts`. Zero API cost to this point.

### ⚑ W1-M3: Dashboard against mock fixture (target: end of Day 3 — Wed)

- **Owner:** Track B
- **Delivers:** Issue #4 (most of it)
- **Done when:** `npm run analyze -- --dry-run` + feeding `examples/mock-results.json` through the dashboard generator produces a browsable static site at `out/` with `index.html`, `doc/<slug>.html`, and `folder/<parent>.html` all rendering and linking correctly. No real AI yet — proves the presentation layer independent of the pipeline.

### 🚪 W1-M4: Phase 0 validation gate (target: end of Day 3 — Wed)

- **Owner:** Track A + manual review
- **Delivers:** `docs/phase-0-results.md`
- **Done when:** validator (Pass 1 at minimum) run on 3 docs — one known-drifted, one known-clean, one uncertain. Metrics recorded: precision ≥80%, recall ≥70%, 0 false positives on the clean doc. Day-3 decision documented: **keep Pass 2** (proceed) / **cut Pass 2** (tighten `confidence ≥ 0.8`) / **abort** (honest conversation).

### ⚑ W1-M5: Full 10-doc run (target: end of Day 5 — Fri)

- **Owner:** Track A
- **Delivers:** Issue #3
- **Done when:** `npm run analyze` on the PoC config produces a valid `RunResults` over all ~10 docs, with real issues on drifted docs and 0 issues on healthy docs, under $1. Test fixtures (drifted + clean) pass in CI.

### ⚑ W1-M6: Dashboard complete (target: end of Day 5 — Fri)

- **Owner:** Track B
- **Delivers:** Issue #4 complete
- **Done when:** README written, screenshots captured, dashboard renders real results from W1-M5 correctly (overall health %, tree view, detail pages with evidence + suggestions + diagnostics + positives, folder rollups).

### ⚑ W1-M7: PoC live publicly (target: end of Day 7 — Sun/Mon)

- **Owner:** Track B
- **Delivers:** Issue #5
- **Done when:** dashboard reachable at `https://juanma-wp.github.io/wp-docs-health-monitor/`. `npm run publish` preserves `data/runs/<runId>/` on `gh-pages` for future M8 history UI.

### Dependency graph — Week 1

```
W1-M1 Foundation
  ├→ W1-M2 Ingestion ──┐
  │                    ├→ W1-M5 Full run
  │                    │    (validator on top of ingestion)
  │                    │
  └→ W1-M3 Dashboard mock ─→ W1-M6 Dashboard complete
                                ↓
                            W1-M4 Phase 0 gate (blocks W1-M5 if fails)
                                ↓
                            W1-M7 Live publish
```

Track B never waits for Track A — dashboard is built against the mock fixture from W1-M1 and swaps to real results once W1-M5 lands.

---

## Phase 2 — Scale-up milestones

### ⚑ P2-M1: Symbol-search mapper validated (target: end of Week 2)

- **Owner:** Track A
- **Delivers:** Backlog milestones M1 + M2
- **Done when:** auto-generated mappings agree with the Week-1 manual mappings ≥70% on `primary` files, ≥60% on `secondary` for the 10 PoC slugs. Editorial-only filter turns the 424-entry manifest into ~150 entries.

### ⚑ P2-M2: Dashboard handles scale (target: end of Week 2)

- **Owner:** Track B
- **Delivers:** Backlog milestone M4
- **Done when:** dashboard renders a 200-doc fixture. Initial load <1s. Search/filter by slug/title/status works. Tree collapse/expand for sections.

### ⚑ P2-M3: 150-doc pipeline (target: mid Week 3)

- **Owner:** Track A
- **Delivers:** Backlog milestone M3
- **Done when:** full editorial-handbook run completes under `--cost-cap 5`. Concurrency `p-limit(5)` with rate-limit backoff. Checkpointing: `SIGINT` → resume from last completed doc. Total cost logged at run end.

### ⚑ P2-M4: First automated cron run (target: end of Week 3)

- **Owner:** Track B
- **Delivers:** Backlog milestone M7
- **Done when:** one **scheduled** Monday 06:00 UTC Action run completes green and auto-publishes the full handbook dashboard to GitHub Pages. `ANTHROPIC_API_KEY` secret configured. `--cost-cap 5` enforced. Manual `workflow_dispatch` also functional.

### ⚑ P2-M5: Historical UI (target: mid Week 4)

- **Owner:** Track B
- **Delivers:** Backlog milestone M8
- **Depends on:** P2-M4 having produced ≥2 archived runs
- **Done when:** dashboard index shows a trend line of `overallHealth` across runs; issues have "persistent · N runs" and "new this week" badges via `Issue.fingerprint`; per-doc detail pages show a health sparkline. Gracefully hides widgets when only 1 run exists.

### ⚑ P2-M6: Month-end demo (target: ~2026-05-15)

- **Owner:** Both
- **Delivers:** Backlog milestones M5 + M6
- **Done when:** live public dashboard with ≥2 weekly runs of history visible. Write-up drafted summarizing precision %, total issues, surprises, costs — ready for the Radical Speed Month P2 post. `docs/runbook.md` complete so any teammate can reproduce a manual run.

### Dependency graph — Phase 2

```
P2-M1 Symbol-search ─┐
P2-M2 Dashboard scale ┤
                      ├→ P2-M3 Pipeline at scale ─┬→ P2-M4 Cron run ─→ P2-M5 History UI ─→ P2-M6 Demo
                      │                           │
                      └──────────────────────────→┘
```

---

## Milestone calendar (headline dates)

| Date | Milestone | Kind |
|------|-----------|------|
| Day 1 (~Apr 21) | W1-M1 Foundation locked | ⚑ delivery |
| Day 2 (~Apr 22) | W1-M2 Ingestion pipeline | ⚑ delivery |
| Day 3 (~Apr 23) | W1-M3 Dashboard on mock | ⚑ delivery |
| Day 3 (~Apr 23) | W1-M4 Phase 0 gate | 🚪 go/no-go |
| Day 5 (~Apr 25) | W1-M5 Full 10-doc run | ⚑ delivery |
| Day 5 (~Apr 25) | W1-M6 Dashboard complete | ⚑ delivery |
| Day 7 (~Apr 27) | W1-M7 PoC live | 🎯 **Week-1 demo** |
| End Week 2 (~May 3) | P2-M1 Symbol-search validated | ⚑ delivery |
| End Week 2 (~May 3) | P2-M2 Dashboard at scale | ⚑ delivery |
| Mid Week 3 (~May 6) | P2-M3 150-doc pipeline | ⚑ delivery |
| End Week 3 (~May 10) | P2-M4 First cron run | 🎯 **CI live** |
| Mid Week 4 (~May 13) | P2-M5 History UI | ⚑ delivery |
| Month-end (~May 15) | P2-M6 Month-end demo | 🎯 **Final demo** |

---

## Risks that can shift the schedule

- **W1-M4 fails** → cut Pass 2, re-plan W1-M5 as Pass-1-only. ~½ day of prompt iteration cost.
- **P2-M1 agreement <70%** → fall back to auto-bootstrap: run `bootstrap-mapping.ts` across all 150 slugs with human spot-check. P2-M3 still happens.
- **Cost overrun on full run** (~P2-M3) → `--cost-cap 5` hard-stops the run. Tighten context budget or downgrade Pass 1 to Haiku 4.5 for bulk, keep Sonnet 4.6 for Pass 2 verification only.
- **P2-M4 non-obvious config issue** → slip to Week 4. Month-end demo becomes "manual trigger" rather than "automated", which is a softer story but still shippable.
