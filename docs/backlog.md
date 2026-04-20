# Backlog

Back to [PLAN.md](../PLAN.md) · For architecture and schemas see [architecture.md](./architecture.md).

What to build, in order. Each issue is individually shippable (one person, one PR, one merge). Sizes: **S** <1h, **M** 1–3h, **L** 3–6h.

Every issue has:
- **Track** (A = pipeline / B = presentation / Either) — suggested, swap freely. Both devs using Claude Code so either can pick up either track.
- **Deps** — prerequisite issue IDs that must be merged first
- **Done when** — acceptance check a reviewer uses

**Total:** ~30 issues, ~50 dev-hours. Fits two devs × ~5 days with buffer.

---

## Month-end Target

By end of month: the **full Block Editor Handbook** (~150 editorial docs) analyzed and published on GitHub Pages. Architecture stays source-agnostic so post-month we can add `wordpress-rest` for a second handbook, but that's not committed for this month.

Three phases:

- **Week 1 — PoC** (issues S/A/B/V below, ~50 dev-hours): 10 docs from Block API Reference, manual mapping, two-pass Claude validator, static dashboard.
- **Weeks 2–4 — Scale-up** (milestones M1–M6 below, sized at Week-2 kickoff): `symbol-search` mapper, editorial-only filter, pipeline + dashboard at 150-doc scale, one production run, runbook.

## Week 1 Timeline

- **Deadline:** ~2026-04-27 (one week from kickoff).
- **Capacity:** 2 devs × 5 working days × 6 focused hours ≈ 60 dev-hours. Plan for ~50h of issues, leaving 20% buffer.
- **Rough split:** Track A (pipeline) ~30h, Track B (presentation) ~15h, shared ~5h. Track B finishes presentation early → helps with A9 fixtures and V0 manual review.

### Week-1 cut list (already applied)

- ❌ GitHub Action workflow — deferred to Phase 2 (P2-1).
- ❌ pnpm workspaces / monorepo — single flat package.
- ❌ `wordpress-rest` / `fs-walk` / `a8c-context` DocSources — Phase 2.
- ❌ `symbol-search` / `hybrid` / `embedding-retrieval` mappers — Phase 2+.
- ❌ PHP / wordpress-develop code source — gutenberg only.
- ❌ Change detector, slug-rename lint, trend tracking, auto-PRs.
- ✅ **Kept:** two-pass validation (with Day-3 decision point), LLM-bootstrap script, Tailwind-CDN dashboard.

### Day-3 decision point on two-pass validation

If Phase 0 precision on 3 docs ≥80% AND the clean doc shows 0 issues → **keep** Pass 2 (A6e) and proceed. If <80% or false positives on the clean doc → **cut** Pass 2 (A6e), tighten `confidence ≥ 0.8`, rely on the runtime verbatim-evidence check (A6d), ship the Pass-1-only version. Dashboard still demos.

---

## Day 1 — Shared Kickoff (both devs, half-day pair session)

- **S0 — Bootstrap repo** · Either · S
  - Deps: —
  - Done when: `package.json`, `tsconfig.json` (strict), ESLint + Prettier, `.gitignore`, `src/index.ts` placeholder. `npm run typecheck` passes on an empty project.

- **S1 — Manifest + mapping types** · Track A · S
  - Deps: S0
  - Done when: `src/types/mapping.ts` exports `ManifestEntrySchema`, `CodeTiersSchema`, `MappingSchema` (zod). Types compile.

- **S2 — Issue + result types** · Track A · M
  - Deps: S0
  - Done when: `src/types/results.ts` exports `IssueSchema`, `DocResultSchema`, `RunResultsSchema` (zod). Matches the Shared Contract in [architecture.md](./architecture.md#shared-contract-day-1-before-branching) exactly.

- **S3 — Config schema** · Track B · S
  - Deps: S0
  - Done when: `src/config/schema.ts` exports `ConfigSchema` with fields for project, docs source, code source, mapping path, output dir.

- **S4 — Pipeline entry stub** · Either · S
  - Deps: S2
  - Done when: `src/pipeline.ts` exports `runPipeline(config: Config): Promise<RunResults>` returning an empty-but-valid `RunResults`. This is the interface Track B codes against.

- **S5 — Export JSON Schema** · Either · S
  - Deps: S2
  - Done when: `npm run gen:schema` writes `examples/results.schema.json` via `zod-to-json-schema`.

- **S6 — Mock results fixture** · Either · M
  - Deps: S2, S5
  - Done when: `examples/mock-results.json` has ~4 fake docs (one healthy, one needs-attention, one critical, one with varied issue types) and passes `RunResultsSchema` validation. **Unblocks Track B fully.**

- **S7 — History data-model groundwork** · Either · S
  - Deps: S2
  - Done when: `src/history.ts` exports `fingerprintIssue(slug, type, codeFile, issueText) → string` (stable hash, tolerant of line shifts — normalizes whitespace + line numbers). Output layout documented: results write to `out/data/runs/<runId>/results.json`, plus an updated `out/data/history.json` run index. Publish script preserves prior runs when pushing to `gh-pages`. UI for history is Phase 2 (M8); this is the data-model foundation so Run 1 isn't lost.

---

## Track A — Pipeline (~30h)

- **A1 — Adapter registry** · Track A · S
  - Deps: S0
  - Done when: `src/adapters/index.ts` exports a registry and `NotImplementedError`. Empty type files for `doc-source`, `code-source`, `mapper`, `validator`.

- **A2a — DocSource interface** · Track A · S
  - Deps: A1, S1
  - Done when: `src/adapters/doc-source/types.ts` defines `DocSource.list(config) → Doc[]` returning `{slug, title, parent, sourceUrl, content, codeExamples, metrics}`.

- **A2b — `manifest-url`: fetch + validate** · Track A · M
  - Deps: A2a
  - Done when: given a manifest URL, fetches JSON, validates each entry against `ManifestEntrySchema`, warns on invalid entries without crashing.

- **A2c — `manifest-url`: filter + fetch markdown** · Track A · M
  - Deps: A2b
  - Done when: filters entries by `parent` slug, fetches each `markdown_source` URL, handles 404/500 gracefully, returns `{entry, content}` pairs.

- **A2d — `manifest-url`: parse markdown → Doc** · Track A · M
  - Deps: A2c
  - Done when: frontmatter via `gray-matter`, code blocks/links counted via `remark`. Returns complete `Doc[]`. Unit test against a checked-in mini-manifest fixture.

- **A3a — `git-clone` CodeSource** · Track A · M
  - Deps: A1
  - Done when: `src/adapters/code-source/git-clone.ts` shallow-clones a repo, exposes `readFile(path, startLine?, endLine?)` and `listDir(path)`. Cleans up old clones.

- **A3b — `git-clone`: SHA caching** · Track A · S
  - Deps: A3a
  - Done when: if cache exists and HEAD SHA matches ref, skips clone. Reruns are <1s.

- **A4 — `manual-map` Mapper** · Track A · M
  - Deps: A1, S1
  - Done when: reads `mappings/<project>.json`, validates against `MappingSchema`, returns `CodeTiers` by slug. Throws helpful error when a requested slug is missing.

- **A4c — `bootstrap-mapping` script** · Track A · L
  - Deps: A2d, A3a
  - Done when: `npx tsx scripts/bootstrap-mapping.ts <slug>` prints a proposed `{slug: CodeTiers}` JSON snippet. Uses Claude with the doc content + repo file tree. Human reviews, pastes into `mappings/*.json`.

- **A5 — Seed mapping for ~10 slugs** · Track A · M
  - Deps: A4c
  - Done when: `mappings/gutenberg-block-api.json` has entries for ~10 Block API Reference slugs. Caps: ≤3 primary, ≤5 secondary, ≤8 context each. Committed.

- **A6a — Validator interface** · Track A · S
  - Deps: A1, S2
  - Done when: `src/adapters/validator/types.ts` defines `Validator.validate(doc, context) → Issue[]`.

- **A6b — Validator: context assembler** · Track A · M
  - Deps: A3a, A4, S2
  - Done when: `assembleContext(doc, mapping, budget) → {files, stats}`. Starts with primary+secondary, adds context until budget hit, records what was dropped.

- **A6c — Validator: Pass 1 (system prompt + tool use)** · Track A · L
  - Deps: A6a, A6b
  - Done when: Claude call with cached system prompt emits `Issue[]` via tool-use matching `IssueSchema`. Unit-tested against fixture doc+code.

- **A6d — Validator: verbatim evidence check** · Track A · S
  - Deps: A6c
  - Done when: issues whose `evidence.codeSays` isn't literally found in the referenced file are silently rejected. Counter logged.

- **A6e — Validator: Pass 2 (`fetch_code` retrieve-on-demand)** · Track A · L
  - Deps: A6c, A3a
  - Done when: for each candidate issue, Claude can call `fetch_code(path, startLine?, endLine?)` to verify. Issues with `confidence < 0.7` dropped. **This is the issue to cut at the Day-3 decision point if it's not stable.**

- **A7 — Pipeline orchestrator** · Track A · M
  - Deps: A2d, A3a, A4, A6c (Pass 1 at minimum)
  - Done when: `runPipeline(config)` wires DocSource → CodeSource → Mapper → Validator, analyzes docs with `p-limit(3)`, emits `RunResults` that validates against the schema.

- **A8 — Health scorer** · Track A · S
  - Deps: S2
  - Done when: `scoreDoc(issues) → {healthScore, status}` implemented. Formula `100 − (critical*15 + major*7 + minor*2)`, clamped 0..100. Thresholds: ≥85 healthy, 60–84 needs-attention, <60 critical. Overall average computed in the orchestrator.

- **A9a — Test fixture: drifted doc** · Track A · M
  - Deps: A6c
  - Done when: `tests/fixtures/drifted/` has a hand-tampered doc+code pair. Validator reports ≥1 `critical` issue.

- **A9b — Test fixture: clean doc** · Track A · S
  - Deps: A6c
  - Done when: `tests/fixtures/clean/` has a known-accurate doc+code pair. Validator reports 0 issues (after confidence filter).

---

## Track B — Presentation (~15h)

- **B1 — Config loader** · Track B · S
  - Deps: S3
  - Done when: `loadConfig(path)` reads YAML, validates via `ConfigSchema`, returns typed `Config`.

- **B2a — CLI skeleton** · Track B · S
  - Deps: S0
  - Done when: `src/cli.ts` with flags `--config`, `--output`, `--only <slug>`, `--dry-run`. `npm run analyze -- --help` prints usage.

- **B2b — CLI wired to pipeline** · Track B · S
  - Deps: B2a, B1, S4
  - Done when: `npm run analyze -- --config config/gutenberg-block-api.yml --output ./out` writes `out/results.json` + a log file. Works with stub `runPipeline` returning empty results.

- **B3a — Dashboard: reader + generator entry** · Track B · S
  - Deps: S6
  - Done when: `src/dashboard/generate.ts` reads + validates a `results.json`, exposes `generate(results, outDir)` that writes to disk.

- **B3b — Dashboard: index.html** · Track B · M
  - Deps: B3a, B4
  - Done when: `out/index.html` shows overall health %, totals (critical/major/minor), and the tree view grouped by parent slug with per-folder aggregated score. Tailwind CDN, one-file HTML.

- **B3c — Dashboard: doc-detail.html** · Track B · L
  - Deps: B3a
  - Done when: `out/doc/<slug>.html` shows title, health score, metrics, issues (severity, confidence, quoted evidence, proposed action), positives, related-code list, source URL link. Generated one per doc from `examples/mock-results.json`.

- **B3d — Dashboard: folder.html** · Track B · M
  - Deps: B3a, B4
  - Done when: `out/folder/<parent>.html` shows a section's rollup and its docs. Reached via links in `index.html`.

- **B4 — Tree builder** · Track B · M
  - Deps: S2
  - Done when: `buildTree(docs) → TreeNode[]` groups by parent slug, aggregates health (doc-count weighted). Handles ≥200 docs cleanly.

- **B6 — `publish.sh`** · Track B · S
  - Deps: B3b, B3c, B3d
  - Done when: `scripts/publish.sh` (or `npm run publish`) copies `out/` to a `gh-pages` worktree and pushes. GitHub Pages serves the result.

- **B7 — README** · Track B · M
  - Deps: B2b (so examples are real)
  - Done when: install steps, API key setup, CLI usage, sample output, cost expectation, dashboard screenshot. Enough for your partner's partner to reproduce.

---

## Phase 0 Validation Gate (Day 3 — Decision Point)

Gate everything else behind this check. It's also the go/no-go for two-pass validation.

- **V0 — Run on 3 docs, measure P/R** · Track A + manual review · M
  - Deps: A5, A7 (with at least Pass 1 wired)
  - Done when: `docs/phase-0-results.md` (or PR comment) records precision, recall, clean-doc false positives. Day-3 decision documented.

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
3. `npm run analyze -- --config config/gutenberg-block-api.yml --output ./out`
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
  - Steps: checkout → setup-node 20 → `npm ci` → `npm run analyze -- --config config/gutenberg-block-api.yml --output ./out` → upload `out/results.json` as artifact → `actions/deploy-pages` for the dashboard.
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
