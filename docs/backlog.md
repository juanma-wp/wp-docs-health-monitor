# Backlog

Back to [PLAN.md](../PLAN.md) · Schedule in [timeline.md](./timeline.md) · Architecture and schemas in [architecture.md](./architecture.md).

## Contents

- [Week 1 Issues](#week-1-issues)
  - [Issue #1 — Project foundation & shared contracts](#issue-1--project-foundation--shared-contracts)
  - [Issue #2 — Doc + code ingestion pipeline](#issue-2--doc--code-ingestion-pipeline)
  - [Issue #3 — Claude drift validator with two-pass evaluation](#issue-3--claude-drift-validator-with-two-pass-evaluation)
  - [Issue #4 — Static HTML dashboard + CLI](#issue-4--static-html-dashboard--cli)
  - [Issue #5 — Publish to GitHub Pages](#issue-5--publish-to-github-pages)
- [Phase 0 Validation Gate](#phase-0-validation-gate-day-3--decision-point)
- [End-to-end Verification](#end-to-end-verification-day-67)
- [Phase 2 — Scale-up](#phase-2--scale-up-to-full-block-editor-handbook-weeks-24)

---

**What to build.** Not *when* — that's in [timeline.md](./timeline.md).

**Week 1: five ambitious feature-level issues**, each with a clear outcome and a detailed checklist of what's inside. Breaking each into smaller sub-PRs during implementation is fine — the issue here is the *unit of agreement*, not the unit of merge.

Sizes: **S** <1h, **M** 1–3h, **L** 3–6h, **XL** 6+h (likely multi-day).

Every issue has:
- **Track** (A = pipeline / B = presentation / Either) — suggested, swap freely. Both devs using Claude Code so either can pick up either track.
- **Outcome** — one-line "done" that a reviewer can check.
- **Includes** — the concrete deliverables inside.
- **Deps** — prerequisite issues that must land first.

---

## Week 1 Issues

Five feature-level issues. Each can be broken into smaller sub-PRs during implementation — the issue is the *unit of agreement* on scope and outcome, not necessarily the unit of merge.

---

### Issue #1 — Project foundation & shared contracts

**Track:** Either (pair session on Day 1) · **Size:** M (~5h) · **Deps:** —

**Outcome:** Repo skeleton in place, every zod schema locked, CLI entry stub compiles, mock fixture passes validation. After this lands on `main`, both tracks work fully in parallel with zero schema ambiguity.

**Includes:**
- `package.json`, `tsconfig.json` (strict), ESLint + Prettier, `.gitignore`, placeholder `src/index.ts`. `npm run typecheck` passes on an empty project.
- `src/types/mapping.ts` — `ManifestEntrySchema`, `CodeTiersSchema`, `MappingSchema` (zod). Matches the Shared Contract in [architecture.md](./architecture.md#shared-contract-day-1-before-branching).
- `src/types/results.ts` — `IssueSchema` (with `fingerprint`), `DocResultSchema` (with `diagnostics`), `RunResultsSchema`.
- `src/config/schema.ts` — `ConfigSchema` (project, docs source, code source, mapping path, output dir).
- `src/pipeline.ts` — exports stub `runPipeline(config: Config): Promise<RunResults>` returning an empty-but-valid `RunResults`. This is the interface Track B codes against from Day 2 onward.
- `src/history.ts` — exports `fingerprintIssue(slug, type, codeFile, issueText) → string` (stable hash, line-shift tolerant). Output layout documented: `out/data/runs/<runId>/results.json` + `out/data/history.json` run index.
- `examples/results.schema.json` — generated from zod via `zod-to-json-schema`. `npm run gen:schema` rebuilds it.
- `examples/mock-results.json` — ~4 fake docs (one healthy, one needs-attention, one critical, one with varied issue types) passing `RunResultsSchema`. **This unblocks Track B entirely.**

---

### Issue #2 — Doc + code ingestion pipeline

**Track:** A (pipeline) · **Size:** L (~12h) · **Deps:** #1

**Outcome:** The pipeline can pull the Gutenberg manifest, filter to Block API Reference slugs, fetch each doc's markdown, clone Gutenberg source, and resolve tiered code mappings from a slug-keyed JSON file. Returns typed `{Doc, CodeTiers}` pairs for every doc in scope. No AI yet — pure plumbing, cost $0.

**Includes:**
- `src/adapters/index.ts` — registry + `NotImplementedError` for unimplemented adapters.
- `DocSource` interface in `src/adapters/doc-source/types.ts`. Returns `Doc[]` with `{slug, title, parent, sourceUrl, content, codeExamples, metrics}`.
- `manifest-url` DocSource: fetches manifest JSON, validates against `ManifestEntrySchema`, filters by `parent` slug (e.g. `block-api`), fetches each `markdown_source` URL with graceful 404/500 handling, parses frontmatter via `gray-matter`, counts code blocks + links via `remark`.
- `CodeSource` interface + `git-clone` implementation: shallow-clones a repo into a cache dir, exposes `readFile(path, startLine?, endLine?)` and `listDir(path)`, caches by commit SHA so reruns are <1s.
- `DocCodeMapper` interface + `manual-map` implementation: reads `mappings/<project>.json`, validates against `MappingSchema`, returns `CodeTiers` by slug, throws a helpful error on missing slugs.
- `scripts/bootstrap-mapping.ts <slug>` — LLM helper that proposes a `{slug: CodeTiers}` JSON snippet using Claude with doc content + repo file tree. Human-reviewed output pastes into `mappings/*.json`. Dev-time only, not a runtime adapter.
- `mappings/gutenberg-block-api.json` seeded with the ~10 PoC slugs (`block-metadata`, `block-registration`, `block-attributes`, `block-supports`, `block-variations`, `block-context`, `block-deprecation`, `block-transforms`, `block-patterns`, `block-bindings`). Caps: ≤3 primary, ≤5 secondary, ≤8 context per slug.
- Unit tests against a checked-in mini-manifest fixture (no network).

**Done when:** calling `runPipeline(config)` (validator stubbed) prints each slug + its primary code file list for all ~10 docs. Zero API cost.

---

### Issue #3 — Claude drift validator with two-pass evaluation

**Track:** A (pipeline) · **Size:** XL (~18h) · **Deps:** #2

**Outcome:** End-to-end pipeline produces a valid `RunResults` over all ~10 docs. Each doc has a health score, evidence-backed issues (or 0 issues when healthy), evidence-backed positives, and diagnostics where relevant. Day-3 Phase 0 gate documented (Go, No-go with Pass 2 cut, or Abort).

**Includes:**
- `Validator` interface in `src/adapters/validator/types.ts`.
- Context assembler: `assembleContext(doc, mapping, budget) → {files, stats}`. Loads `primary + secondary`, appends `context` until the 50k-token budget is hit, records dropped files in `DocResult.relatedCode[].includedInAnalysis`.
- **Pass 1** — Claude Sonnet 4.6 call with a cached system prompt encoding the Validator Behavior rules from [architecture.md](./architecture.md#validator-behavior-prompt-rules) (drift definition, severity calibration, evidence-backed positives cap 3, suggestion quality bar). Tool-use emits `Issue[]` matching `IssueSchema`. `Issue.fingerprint` computed from `src/history.ts`.
- Runtime verbatim evidence check: any issue whose `evidence.codeSays` doesn't literally appear in the referenced code file is silently dropped. Drop counter logged.
- **Pass 2** — for each Pass-1 candidate, Claude can call a `fetch_code(path, startLine?, endLine?)` tool to verify. Issues with `confidence < 0.7` dropped. Critical/major issues with weak suggestions (generic words like "update", "revise") retry once with a sharper prompt; still-weak → drop.
- `src/health-scorer.ts` — `scoreDoc(issues) → {healthScore, status}`. Formula `100 − (critical*15 + major*7 + minor*2)`, clamped 0..100. Thresholds: ≥85 `healthy`, 60–84 `needs-attention`, <60 `critical`. Overall = average across docs.
- Pipeline orchestrator: wires DocSource → CodeSource → Mapper → ContextAssembler → Validator → HealthScorer. Concurrency `p-limit(3)`. Run-end cost meter.
- Test fixtures: `tests/fixtures/drifted/` (hand-tampered doc+code, must yield ≥1 critical) and `tests/fixtures/clean/` (known-accurate, must yield 0 issues post-filter).
- **Day-3 Phase 0 gate** — run the validator on 3 docs (1 known-drifted, 1 known-clean, 1 uncertain). Measure precision ≥80%, recall ≥70%, clean-doc false positives = 0. Document results + decision in `docs/phase-0-results.md`. If no-go, cut Pass 2 and tighten `confidence ≥ 0.8` for Pass-1-only ship. If still failing, abort honestly.

**Done when:** `npm run analyze` on the PoC config produces a valid `RunResults` with real issues on drifted docs, 0 issues on healthy docs, for under $1 per 10-doc run. `docs/phase-0-results.md` documents the decision.

---

### Issue #4 — Static HTML dashboard + CLI

**Track:** B (presentation) · **Size:** L (~12h) · **Deps:** #1

**Outcome:** `npm run analyze -- --config config/gutenberg-block-api.json --output ./out` runs the pipeline (or reads `results.json`) and produces a browsable static dashboard with overall health %, tree view of docs by parent slug, per-doc detail pages with issues + evidence + suggestions + diagnostics + positives, and per-folder rollups. Track B builds against the mock fixture from #1 and never waits for #2 or #3.

**Includes:**
- `src/config/loader.ts` — `loadConfig(path)` reads YAML, validates via `ConfigSchema`, returns typed `Config`.
- `src/cli.ts` — flags `--config`, `--output`, `--only <slug>`, `--dry-run`. `npm run analyze -- --help` prints usage. Wires config loader → `runPipeline` → writes `out/data/runs/<runId>/results.json` + `out/data/logs.txt`.
- `src/dashboard/generate.ts` — reads and validates `results.json`, exposes `generate(results, outDir)` that writes the full static site.
- `src/dashboard/tree-builder.ts` — `buildTree(docs) → TreeNode[]` groups by parent slug, doc-count-weighted health aggregation. Handles ≥200 docs for Phase 2.
- Templates (`eta` or plain template literals), rendered with Tailwind via CDN (no build step):
  - `out/index.html` — overall health %, totals (critical/major/minor), tree view grouped by parent with per-folder aggregated scores.
  - `out/doc/<slug>.html` — title, health score, metrics, issues (severity, confidence, quoted evidence, proposed action), positives, related-code list, diagnostics strip, source URL link.
  - `out/folder/<parent>.html` — section rollup + list of its docs.
- `README.md` — install, `ANTHROPIC_API_KEY` setup, CLI usage, sample invocation, cost expectation (~$1/10-doc run), screenshot of the dashboard.

**Done when:** feeding `examples/mock-results.json` through the dashboard generator produces a browsable static site at `out/` with working navigation between index, folders, and per-doc pages. The same command works with a real `results.json` from Issue #3 once it lands.

---

### Issue #5 — Publish to GitHub Pages

**Track:** B (presentation) · **Size:** S (~2h) · **Deps:** #4

**Outcome:** One command publishes the generated dashboard publicly at `https://juanma-wp.github.io/wp-docs-health-monitor/`. Prior runs are preserved under `data/runs/<runId>/` on the `gh-pages` branch so Phase 2's historical UI (M8) has data to draw on.

**Includes:**
- `scripts/publish.sh` (also `npm run publish`) — uses a `gh-pages` git worktree, copies `out/` into it *preserving* any existing `data/runs/<runId>/` directories from prior runs, commits, pushes.
- Repo settings: public visibility confirmed, GitHub Pages source = `gh-pages` branch root.
- Runbook entry in `docs/runbook.md`: one paragraph on how to run it, what to expect, how to revert if the publish goes wrong.

**Done when:** `npm run analyze && npm run publish` results in a publicly reachable dashboard URL. A second run archives its `results.json` under `data/runs/<runId>/` without clobbering the first.

---

## Phase 0 Validation Gate (Day 3 — Decision Point)

Embedded in Issue #3 but called out here because it's the project's single most important gate.

### Method

1. Pick 3 of the ~10 docs — ideally **one known-drifted, one known-clean, one uncertain** so we can measure both precision and recall.
2. Manually read each doc + its mapped code. Write down (a) the real drift issues a human reviewer would flag, and (b) that the clean doc is actually clean.
3. Run the validator on those 3 docs.
4. **Measure:**
   - **Precision** — of issues reported, how many are real? Target ≥80%.
   - **Recall** — of the human-found issues, how many did the tool surface? Target ≥70%.
   - **Clean-doc false positives** — on the clean doc, tool must report 0 issues (or all <0.7 confidence, which we filter). This is the single most important check: a tool that fabricates issues on good docs is worse than useless.
5. **Day-3 decision:**
   - **Go** (precision ≥80% + clean doc shows 0 issues): keep two-pass validation, proceed to full 10-doc run.
   - **No-go** (precision <80% OR clean doc shows false positives): iterate the system prompt for up to half a day. If still failing, **cut Pass 2**, tighten `confidence ≥ 0.8`, rely on the runtime verbatim-evidence check, and ship the Pass-1-only version. Dashboard still demos.
   - **Fail** (still bad after cuts): honest conversation about whether the PoC is viable — better to surface that at day 3 than day 7.

---

## End-to-end Verification (Day 6–7)

1. `npm install`
2. `export ANTHROPIC_API_KEY=...`
3. `npm run analyze -- --config config/gutenberg-block-api.json --output ./out`
4. `open out/index.html` — verify overall health %, tree view renders all ~10 docs grouped under `block-api`, clicking a doc opens a detail page with issues, evidence, proposed actions, and a link to the source URL.
5. Manual precision check on 10 random issues: confirm they're real drift, not hallucination.
6. Clean-doc check: at least one doc shows `healthy` status with 0 issues (or proves the tool can recognize health).
7. Cost check: ≤$1 for the full 10-doc run. Flag if it exceeds $5.
8. `npm run publish` (or `scripts/publish.sh`) pushes `out/` to the `gh-pages` branch; verify the dashboard loads at `https://juanma-wp.github.io/wp-docs-health-monitor/`.

---

## Phase 2 — Scale-up to Full Block Editor Handbook (Weeks 2–4)

Committed. Break into individual issues at Week-2 kickoff once Week-1 findings are in. Keeping milestones coarse here on purpose — we'll know more after the PoC.

### Goals

- All ~150 editorial Block Editor Handbook docs analyzed end-to-end.
- `symbol-search` replaces hand-written mapping for scale.
- Dashboard stays fast and readable at 150-doc scale.
- One production-shaped weekly run, published to GitHub Pages.

### Milestones

- **M1 — `symbol-search` Mapper** · Track A · ~3 days
  - Symbol extractor: parse doc's code fences + prose for function names, types, hooks, attribute names, import paths.
  - AST-grep the Gutenberg repo (via `ast-grep` or `tree-sitter`) for definitions of those symbols (not usages, which are noisier).
  - Ranker: score each candidate by `symbol_match_strength × symbol_specificity × package_centrality × recency`.
  - Tiering: top 3 → `primary`, next 5 → `secondary`, next 10 → `context`.
  - Acceptance: for the ~10 Week-1 slugs, agreement with manual mappings is ≥70% on `primary`, ≥60% on `secondary`. Break further if you need unit tests or benchmarks.

- **M2 — Editorial filter** · Track A · S
  - Extend `manifest-url` with an option to exclude entries whose `markdown_source` resolves under `packages/*/README.md` or `packages/components/src/*/README.md`.
  - Acceptance: filter on → ~150 docs returned; filter off → ~424.

- **M3 — Pipeline at scale** · Track A · M
  - Raise concurrency to `p-limit(5)` (or higher with rate-limit backoff).
  - Per-run cost meter: sum input + output tokens × model pricing, print running total, hard-stop at `$5` (configurable via `--cost-cap`).
  - Checkpointing: after each doc, write partial `results.json` so a crash/interrupt doesn't redo work.
  - Acceptance: 150-doc run completes under cap, can resume after `SIGINT`.

- **M4 — Dashboard at scale** · Track B · ~1–2 days
  - Tree view collapses/expands section groups.
  - Search/filter docs by `slug`/`title`/`status`/parent.
  - Performance: initial page load <1s with 150 docs in fixture.
  - Acceptance: scroll through 150 docs smoothly, filter narrows the list instantly.

- **M5 — Full-handbook production run** · Both · ~1 day
  - Run the pipeline on all ~150 editorial docs (triggered via `workflow_dispatch` on the Action once M7 is in).
  - Manual precision check on 20 randomly-selected issues.
  - Publish to Pages. Write up findings (precision %, total issues, surprises) for the Radical Speed Month P2 post.
  - Acceptance: dashboard live at the public URL, write-up drafted.

- **M6 — Runbook** · Either · S
  - Document the end-to-end manual steps in `docs/runbook.md`: when to run, which commands, how to verify, how to publish. Backup path when the Action is down or under development.
  - Acceptance: a teammate could run an ad-hoc update using just the runbook.

- **M7 — GitHub Action with weekly cron** · Track B · ~1–2 days
  - `.github/workflows/analyze-docs.yml` with `workflow_dispatch` (manual) and `schedule: - cron: '0 6 * * 1'` (weekly, Mon 06:00 UTC).
  - Uses `ANTHROPIC_API_KEY` as a repo secret (set this up in Settings once).
  - Steps: checkout → setup-node 20 → `npm ci` → `npm run analyze -- --config config/gutenberg-block-api.json --output ./out` → upload `out/results.json` as artifact → `actions/deploy-pages` for the dashboard.
  - Cost-cap flag (`--cost-cap 5`) on the CLI so a runaway run can't blow the budget.
  - Slack/email notification on failure (stretch — can be step-level `if: failure()` using `actions/github-script` or just rely on GitHub's default email to the repo owner).
  - **Acceptance:**
    1. Manual dispatch runs green and updates the live dashboard at `https://juanma-wp.github.io/wp-docs-health-monitor/`.
    2. One fully automated scheduled run completes green before month-end.
    3. Subsequent runs append to `data/runs/` on `gh-pages` (preserving history per S7) while replacing the live dashboard views.

- **M8 — Historical dashboard UI** · Track B · ~1–2 days
  - Deps: S7 (groundwork), M7 (so runs are archived by the Action)
  - Dashboard index shows a **trend line of `overallHealth`** across the last N runs (pull from `data/history.json`).
  - Issues with a `fingerprint` matching a prior run get a **"persistent · N runs"** badge on the doc-detail page.
  - Issues appearing for the first time get a **"new this week"** badge.
  - Per-doc sparkline of health score over time on the doc-detail page.
  - Acceptance: with at least 2 archived runs in `data/runs/`, the dashboard renders the trend line and badges correctly. If only 1 run exists, UI gracefully hides the history widgets.
