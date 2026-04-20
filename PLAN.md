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
- Vertical split: Dev A owns the analysis pipeline, Dev B owns CLI + dashboard + config.
- **Public GitHub repo + GitHub Pages** for the dashboard. Dashboard is the product — overall health %, per-doc detail pages with evidence and proposed actions, informational (no gamification).
- Quality first, cost secondary. Flag if costs go off rails (rough guardrail: < $5 per full 10-doc PoC run).

## Targets

**Phase 1 (Week 1, demo target):** ~10 docs from the Gutenberg Block API Reference (https://developer.wordpress.org/block-editor/reference-guides/block-api/) — e.g. `block-metadata`, `block-registration`, `block-attributes`, `block-supports`, `block-variations`, `block-context`, `block-deprecation`, `block-transforms`, `block-patterns`, `block-bindings`. Tight mappings to `packages/blocks/src/api/*` and `schemas/json/block.json`. Code source: **gutenberg only** (no wordpress-develop/PHP core in Week 1).

**Phase 2:** A WordPress-sourced site fetched via REST API — either developer.wordpress.org (Block Editor Handbook from the published site instead of the markdown source) or a WooCommerce docs page. Proves the abstraction and is the shape downstream users will want.

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

## Phase 2 — After PoC is validated (committed)

- **P2-1** GitHub Action workflow: manual dispatch + weekly cron, uploads `results.json` as artifact, auto-deploys dashboard to GitHub Pages.
- **P2-2** `wordpress-rest` DocSource: pagination, HTML→markdown normalization, Application Password auth. Produces a manifest-shaped list from a live WP site. Demoed against developer.wordpress.org or a WooCommerce docs page.
- **P2-3** `fs-walk` DocSource: generates a manifest for markdown repos that don't publish one (WooCommerce docs repo, etc.).
- **P2-4** Dashboard: show source type per doc ("markdown" / "wordpress") and deep-link to the edit URL in WP so authors can fix directly.
- **P2-5** `a8c-context` DocSource variant: use the context-a8c MCP for A8C-internal sites (Fieldguide, P2s) that aren't publicly reachable.

## Stretch — nice to have

- **S3** Change Detector: diffs last-analyzed commit SHA vs current, queues only changed docs + docs whose mapped code changed. Biggest cost lever per the blog post.
- **S5** `symbol-search` Mapper (heuristic doc→code resolution to scale beyond hand-maintained mappings).
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
- **Phase 2 target site:** developer.wordpress.org vs a WooCommerce docs page vs an A8C-internal P2. Decide before P2-2 starts — each has different auth, content shape, and audience.
- **Fix round-trip (S8):** auto-open PRs / draft WP post updates, or stay strictly read-only? Auto-PRs change the trust bar significantly.
- **Markdown↔WP drift:** when both a markdown source AND a WP-edited post exist for the same doc, they can drift from *each other*. Out of scope for PoC, worth flagging as a real failure mode for later.
- **Bifrost P2 / Radical Speed Month framing:** does the Week-1 demo need to hit a specific forum or deadline beyond the generic 1-week bar?
