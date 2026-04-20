# WP Docs Health Monitor — PoC Plan

> **Reading order:** start here. Technical details live in [docs/architecture.md](./docs/architecture.md). Issues to pick up live in [docs/backlog.md](./docs/backlog.md).

## Context

**End goal:** Keep WordPress-hosted documentation sites (developer.wordpress.org, WooCommerce docs, internal A8C docs, etc.) accurate and up-to-date against the code they describe. Docs on those sites come from two kinds of sources:

1. **Markdown in a source repo** that gets synced to a WordPress site (e.g. Gutenberg's `docs/` → developer.wordpress.org Block Editor Handbook CPTs).
2. **Custom posts edited directly in WordPress** — no git, authors write inside wp-admin (common for WooCommerce, internal A8C docs, and self-managed handbooks).

Both paths drift from the code silently. No one today has a prioritized punch list of what's wrong on those WordPress sites.

This project ships an automated tool that:
- Pulls docs from either source (markdown repo OR a WordPress REST API).
- Pulls the related source code.
- Uses Claude to compare them and produce evidence-backed issues with health scores.
- Renders a static dashboard doc authors can act on.

The blog post at https://radicalupdates.wordpress.com/2026/04/15/block-editor-docs-health-monitor/ sets the north star (weekly runs, $0.50/week after change-detection caching, CI/CD for docs). The project should eventually feed fixes back into either source type — a PR for markdown, a WordPress post update for direct-edit sites.

## Constraints

- **Week 1 PoC deadline:** ~2026-04-27 (one week from kickoff). Aggressive scope discipline.
- Small validatable first iteration (~10 docs) but **architecture designed to scale to ~200 docs/site**.
- **"Docs might be OK" is a valid outcome** — the tool must confidently report *healthy* when nothing is wrong, not just find issues. Recall (did we miss drift?) matters as much as precision (is what we found real?).
- Two developers working in parallel — cleanly separable, independently shippable issues.
- Vertical split: Track A owns the analysis pipeline, Track B owns CLI + dashboard + config. Either dev can own either track — both using Claude Code.
- **Public GitHub repo + GitHub Pages** for the dashboard. Dashboard is the product — overall health %, per-doc detail pages with evidence and proposed actions, informational (no gamification).
- Quality first, cost secondary. Flag if costs go off rails (rough guardrail: < $5 per full 10-doc PoC run).

## Targets

**Phase 1 (Week 1, PoC):** ~10 docs from the Gutenberg Block API Reference (https://developer.wordpress.org/block-editor/reference-guides/block-api/) — e.g. `block-metadata`, `block-registration`, `block-attributes`, `block-supports`, `block-variations`, `block-context`, `block-deprecation`, `block-transforms`, `block-patterns`, `block-bindings`. Tight mappings to `packages/blocks/src/api/*` and `schemas/json/block.json`. Code source: **gutenberg only**. Manual mapping. Proves the pipeline.

**Phase 2 (Weeks 2–4, month-end target):** Scale to the **full Block Editor Handbook** — ~150 editorial docs (filter out auto-generated package READMEs). Build the `symbol-search` mapper so we don't hand-curate 150 entries. Harden the dashboard for scale. Ship a **GitHub Action with a weekly cron** that runs the pipeline and auto-deploys the dashboard to GitHub Pages — the cron is what makes "CI/CD for docs" real, not a manual habit.

**Post-month (not committed):** `wordpress-rest` DocSource, second handbook (e.g. Themes Handbook — assuming it's actually WP-edited and not markdown-sourced), GitHub Action automation, trend tracking. Architecturally supported since Week 1, but deliberately deferred so month-end stays achievable.

## Architecture at a Glance

Pluggable adapters around a stateless pipeline:

```
         ┌──────────────────────────────────────────┐
         │  config.yml (project, sources, mapping)   │
         └────────────────────┬──────────────────────┘
                              ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │  DocSource  │     │ CodeSource  │     │DocCodeMapper│
  │  (adapter)  │     │  (adapter)  │     │  (adapter)  │
  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
         │                   │                   │
         ▼                   ▼                   ▼
    docs[]              code files          doc→code[] pairs
                              │
                              ▼
                    ┌──────────────────┐
                    │    Validator     │  (Claude, two-pass,
                    │    (adapter)     │   prompt-cached)
                    └────────┬─────────┘
                             ▼
                       issues[] + scores
                             │
                             ▼
                      results.json
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
      Dashboard Generator             CLI/Action
      (static HTML)                   (orchestration)
```

| Interface        | Phase 1 (PoC)     | Phase 2 (committed)      | Later stubs              |
|------------------|-------------------|--------------------------|--------------------------|
| `DocSource`      | `manifest-url` (consumes Gutenberg-style `manifest.json`) | `wordpress-rest`, `fs-walk` (generate manifest for markdown sites without one) | `sitemap-crawler`, `a8c-context` |
| `CodeSource`     | `git-clone`       | (reuse)                  | `multi-repo`, `local-path` |
| `DocCodeMapper`  | `manual-map` (slug-keyed JSON, tiered) + LLM-bootstrap helper | (reuse) | `symbol-search`, `embedding-retrieval`, `hybrid` |
| `Validator`      | `claude`          | (reuse)                  | (only one needed)         |

Unimplemented Later-stub adapters throw `NotImplementedError` — documents the extension surface without adding dead code.

Full technical details (schemas, repo layout, mapping format, tech stack) → [docs/architecture.md](./docs/architecture.md).

Issue-level plan with owners, deps, and acceptance criteria → [docs/backlog.md](./docs/backlog.md).

## Phase 2 — Scale-up to Full Block Editor Handbook (Weeks 2–4)

Committed. Breaks into issues at Week-2 kickoff; coarse milestones here:

- **M1** `symbol-search` Mapper — extract symbols from each doc (function names, types, hooks, attribute names, code-block imports); AST-grep Gutenberg via `ast-grep`/`tree-sitter`; rank by specificity × centrality × recency; output tiered `MappingSchema`. Validated against Week-1 manual mappings (≥70% agreement on `primary`).
- **M2** Editorial-only filter in `manifest-url` — exclude `packages/*/README.md` and `packages/components/src/*/README.md`. Filters ~424 → ~150 docs.
- **M3** Pipeline at scale — raise concurrency, add per-run cost meter with a hard stop at $5 (configurable), checkpoint results after each doc so a crash doesn't restart the whole run.
- **M4** Dashboard at scale — tree collapse, search/filter by status, page loads <1s with 150 docs.
- **M5** Full-handbook run + publish — one production-shaped run on all ~150 docs, manual spot-check of ~20 issues, published to `https://juanma-wp.github.io/wp-docs-health-monitor/`.
- **M6** Runbook — documented procedure for manual one-off runs (backup path when the Action is down or under development).
- **M7** GitHub Action with weekly cron — `.github/workflows/analyze-docs.yml` with `workflow_dispatch` for manual dispatch and `schedule: cron: '0 6 * * 1'` (Mondays 06:00 UTC) for the weekly run. Uses an `ANTHROPIC_API_KEY` repo secret, uploads `results.json` as an artifact, and auto-deploys the dashboard to GitHub Pages via the `actions/deploy-pages` flow. One green scheduled run is the acceptance bar.
- **M8** Historical dashboard — each run archived as `data/runs/<runId>/results.json` on the `gh-pages` branch. Dashboard shows a trend line of overall health, "new this week" / "persistent for N runs" badges on issues (using stable `Issue.fingerprint` hashes), and a per-doc sparkline. Data-model groundwork ships with S-track in Week 1; UI lands in Phase 2 once there are 2–3 runs to draw on.

## Post-month (not committed, deliberately deferred)

Architecture supports these; we defer to keep month-end achievable. Promote to committed once the month-end demo lands.

- **D1** `wordpress-rest` DocSource: pagination, HTML→markdown normalization, Application Password auth. Produces a manifest-shaped list from a live WP site.
- **D2** Second handbook PoC: **Themes Handbook** (if actually WP-edited and not markdown-sourced — verify first) or a WooCommerce docs page, through `wordpress-rest`.
- **D3** Source-type awareness in dashboard: label docs "markdown" / "wordpress", deep-link to WP edit URL for WP-sourced docs.
- **D4** `fs-walk` DocSource for markdown repos without a manifest.
- **D5** `a8c-context` DocSource variant (context-a8c MCP for A8C-internal sites).

## Stretch — nice to have

- **S3** Change Detector: diffs last-analyzed commit SHA vs current, queues only changed docs + docs whose mapped code changed. Biggest cost lever per the blog post.
- **S6** Trend tracking across runs (store history, show trend line in dashboard).
- **S7** Slug-rename lint: warn when `mapping.json` keys aren't in the current manifest.
- **S8** Round-trip: open a GitHub PR on the markdown source (or draft a WP post update via REST) for issues above a confidence threshold.

## Out of Scope for PoC (Week 1)

- GitHub Action workflow and weekly cron — deferred to Phase 2 (P2-1).
- `wordpress-rest` / `fs-walk` / `a8c-context` DocSources — interfaces defined, implementations deferred.
- `symbol-search` / `hybrid` / `embedding-retrieval` mappers — interface-compatible, implementations deferred.
- Auto-generated package READMEs (`packages/*/README.md`) — most are docgen output, low drift signal.
- Auto-PRs with fixes, screenshots/image link-checking, multi-handbook coverage.
- Fine-tuning — off-the-shelf Claude Sonnet 4.6.
- PHP / wordpress-develop code source — gutenberg repo only in Week 1.
- Slug-rename detection, trend tracking, gamification.

## Open Questions (non-blocking)

- **Known-clean controls in the 10 docs:** which 1–2 of the chosen Block API docs are known to be accurate? Include them on purpose so recall measurement has a baseline.
- **Editorial-only filter rules:** are all `packages/*/README.md` truly auto-generated docgen output? Confirm before M2 excludes them wholesale — a false exclusion hides real drift.
- **Themes Handbook source model:** verify whether it's markdown-sourced or actually WP-edited. Answer gates whether D3 becomes a meaningful `wordpress-rest` demo or just another markdown handbook.
- **Fix round-trip (S8):** auto-open PRs / draft WP post updates, or stay strictly read-only? Auto-PRs change the trust bar significantly.
- **Markdown↔WP drift:** when both a markdown source AND a WP-edited post exist for the same doc, they can drift from *each other*. Worth flagging as a real failure mode for later.
- **Bifrost P2 / Radical Speed Month framing:** does the month-end demo need to hit a specific forum or write-up beyond the generic "publish + share link" bar?
