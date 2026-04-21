# WP Docs Health Monitor — Plan

> **Reading order:** start here for the overview. Components and issues → [docs/backlog.md](./docs/backlog.md). Schedule → [docs/timeline.md](./docs/timeline.md). Technical details → [docs/architecture.md](./docs/architecture.md).

---

## Contents

- [Context](#context)
- [Constraints](#constraints)
- [Key Components](#key-components)
  - [1. Project Foundation](#1-project-foundation)
  - [2. Doc Ingestion](#2-doc-ingestion-docsource)
  - [3. Code Ingestion](#3-code-ingestion-codesource)
  - [4. Doc–Code Mapping](#4-doccode-mapping-doccodemapper)
  - [5. Drift Validator](#5-drift-validator)
  - [6. Dashboard + CLI](#6-dashboard--cli)
  - [7. GitHub Pages Publish](#7-github-pages-publish)
- [Component Dependency Map](#component-dependency-map)
- [Phase 1 — PoC](#phase-1--poc)
- [Phase 2 — Scale to Full Block Editor Handbook](#phase-2--scale-to-full-block-editor-handbook)
- [Post-Phase 2](#post-phase-2-not-committed)
- [Open Questions](#open-questions)

---

## Context

**End goal:** Keep WordPress-hosted documentation sites (developer.wordpress.org, WooCommerce docs, internal A8C docs, etc.) accurate and up-to-date against the code they describe. Docs on those sites come from two kinds of sources:

1. **Markdown in a source repo** synced to a WordPress site (e.g. Gutenberg's `docs/` → developer.wordpress.org Block Editor Handbook).
2. **Custom posts edited directly in WordPress** — no git, authors write inside wp-admin.

Both paths drift from the code silently. No one today has a prioritized punch list of what's wrong on those sites.

This project ships an automated tool that pulls docs and code, uses Claude to compare them, and renders a static dashboard doc authors can act on.

## Constraints

- Aggressive scope discipline — small, validatable first iteration (~10 docs) with architecture designed to scale to ~200 docs/site.
- **"Docs might be OK" is a valid outcome** — the tool must confidently report *healthy* when nothing is wrong. Recall matters as much as precision.
- Two developers working in parallel on cleanly separable tracks: **Track A** (analysis pipeline) and **Track B** (CLI + dashboard + config).
- Public GitHub repo + GitHub Pages for the dashboard. The dashboard is the product — overall health %, per-doc detail pages with evidence and proposed actions, informational (no gamification).
- Quality first, cost secondary. Rough guardrail: < $5 per full run at scale.

## Key Components

Six building blocks, each a discrete issue or group of issues:

### 1. Project Foundation
Establishes the shared contract that lets both tracks work in parallel from day one — shared type contracts, zod schemas, CLI entry stub, and a mock fixture that validates all schemas. Without this, both tracks would be guessing at interfaces and stepping on each other.

**Connects to:** all other components.

### 2. Doc Ingestion (`DocSource`)
Answers "what docs exist and what do they say?" — pulling documentation from a source into a normalised `Doc[]` and abstracting away where they live. In Phase 1 docs come from a Gutenberg-style `manifest.json`; later they may come from a WordPress REST API. Everything downstream receives the same normalised `Doc` regardless of origin.

**Connects to:** Mapper, Validator.

### 3. Code Ingestion (`CodeSource`)
Answers "what does the code actually say right now?" — fetching and caching source files so the Validator has exact, current file contents to compare against. Abstracting this out means the pipeline can later support multiple repos or local paths without touching the Validator. Phase 1: shallow-clone via git.

**Connects to:** Mapper, Validator.

### 4. Doc–Code Mapping (`DocCodeMapper`)
Tells the Validator *which* code files are relevant to each doc — the bridge between the documentation world and the source world. Without this, the Validator would have no idea where to look. Phase 1 uses a hand-curated slug-keyed JSON file with tiered relevance (`primary`, `secondary`, `context`); Phase 2 automates this with symbol extraction and AST search so it scales beyond what a human can maintain.

**Connects to:** Validator.

### 5. Drift Validator
The core analysis step: determines whether each doc accurately describes the code it maps to, and produces evidence-backed findings a doc author can act on. Claude reads doc + code together, identifies specific claims that are wrong or outdated, and scores each finding by severity and confidence. It also surfaces what *is* correct — so the output is an honest health report, not just a bug list. Issues with unsupported or low-confidence findings are filtered out before results are written.

**Depends on:** Doc Ingestion, Code Ingestion, Mapping.  
**Connects to:** results.json, which feeds the Dashboard.

### 6. Dashboard + CLI
Makes findings useful to doc authors, not just developers. The CLI runs the pipeline on demand and writes `results.json`; the dashboard turns those results into a browsable static site — overall health at a glance, per-folder rollups, and per-doc detail pages with quoted evidence and proposed fixes. The dashboard is the product: it's what a doc author opens to decide what to work on next. Track B builds this against the mock fixture from Foundation and never waits for the pipeline.

**Depends on:** Project Foundation (mock fixture). Swaps to real results once the Validator lands.  
**Connects to:** GitHub Pages publish.

### 7. GitHub Pages Publish
Makes the dashboard publicly reachable and persistent. A single command pushes the generated site to the `gh-pages` branch while preserving prior run data for future historical views. Phase 2 automates this step via a GitHub Action on a weekly cron.

**Depends on:** Dashboard.

---

## Component Dependency Map

```
Foundation
  ├→ Doc Ingestion ──┐
  ├→ Code Ingestion ─┤
  ├→ Mapping ────────┴→ Validator → results.json ─→ Dashboard → Publish
  └→ Dashboard (mock)────────────────────────────→ Dashboard
```

Track B (Dashboard) builds against the mock from Foundation and never waits for Track A (pipeline components).

---

## Phase 1 — PoC

**Scope:** ~10 docs from the Gutenberg Block API Reference, analyzed end-to-end, with a live public dashboard.

**In scope:**
- All six components above, with Phase 1 adapters (`manifest-url`, `git-clone`, `manual-map`, `claude` validator).
- A Phase 0 validation gate: run the validator on 3 docs (one known-drifted, one known-clean, one uncertain) and measure precision ≥80%, recall ≥70%, zero false positives on the clean doc before proceeding to the full run.
- A manual mapping file seeded for the ~10 Block API Reference slugs.

**Out of scope for Phase 1:**
- GitHub Action / weekly cron — deferred to Phase 2.
- `symbol-search` mapper — Phase 1 uses manual mapping.
- Historical dashboard UI — data groundwork ships in Phase 1; UI needs multiple runs.
- `wordpress-rest`, `fs-walk`, `a8c-context` DocSources — interfaces defined; implementations deferred.
- Auto-generated package READMEs — low drift signal, excluded.

---

## Phase 2 — Scale to Full Block Editor Handbook

**Scope:** ~150 editorial Block Editor Handbook docs, weekly automated runs, historical dashboard.

**Key additions over Phase 1:**
- **`symbol-search` Mapper** — replaces manual mapping at scale. Extracts symbols from each doc, finds their definitions in the Gutenberg AST, tiers results. Validated against Phase 1 manual mappings.
- **Editorial filter** — excludes auto-generated package READMEs from the manifest (~424 → ~150 docs).
- **Pipeline hardening** — higher concurrency, per-run cost cap, checkpointing so a crash resumes rather than restarts.
- **Dashboard at scale** — tree collapse, search/filter, page loads <1s with 150 docs.
- **GitHub Action with weekly cron** — automated Monday runs, deploys to GitHub Pages, enforces cost cap. Manual `workflow_dispatch` also supported.
- **Historical UI** — trend line of overall health across runs, "new this week" / "persistent N runs" badges on issues using stable fingerprint hashes.

---

## Post-Phase 2 (not committed)

Architecture supports these; deferred until the Phase 2 demo lands.

- **`wordpress-rest` DocSource** — pull docs from a live WordPress site via REST API with Application Password auth.
- **Second handbook** — Themes Handbook (if WP-edited) or WooCommerce docs through `wordpress-rest`.
- **Source-type awareness** — label docs "markdown" / "wordpress" in the dashboard; deep-link to WP edit URL for WP-sourced docs.
- **`fs-walk` DocSource** — markdown repos without a manifest.
- **`a8c-context` DocSource** — context-a8c MCP for A8C-internal sites.
- **Fix round-trip** — open a GitHub PR (markdown source) or draft a WP post update (REST) for issues above a confidence threshold.
- **Change detector** — diff last-analyzed SHA vs current, queue only changed docs. Biggest cost lever.

---

## Open Questions

- **Known-clean controls:** which 1–2 of the chosen Block API docs are known-accurate? Include them explicitly so recall measurement has a baseline.
- **Editorial-only filter rules:** are all `packages/*/README.md` truly auto-generated? Confirm before Phase 2 excludes them wholesale — a false exclusion hides real drift.
- **Themes Handbook source model:** verify whether it's markdown-sourced or WP-edited. Answer gates whether D3 becomes a meaningful `wordpress-rest` demo.
- **Fix round-trip (stretch):** auto-open PRs / draft WP post updates, or stay strictly read-only? Auto-PRs change the trust bar significantly.
- **Markdown↔WP drift:** when both a markdown source AND a WP-edited post exist for the same doc, they can drift from *each other*. Worth flagging as a failure mode for later.
