# Release Pinning — Which Code Version Counts as Ground Truth

Back to [PLAN.md](../../PLAN.md) · Architecture in [ARCHITECTURE.md](../ARCHITECTURE.md).

When the Validator compares a doc claim against "the code," it needs to answer: *which* code? Trunk, the latest released plugin, or the snapshot that ships inside a specific WordPress core version? The answer changes what verdicts the tool produces, so it belongs in the design before the pipeline is wired at scale.

---

## Contents

- [The problem](#the-problem)
- [Three availability tiers](#three-availability-tiers)
- [Why trunk is the wrong default](#why-trunk-is-the-wrong-default)
- [Proposed solution](#proposed-solution)
- [Implementation footprint](#implementation-footprint)
- [PoC scope decision](#poc-scope-decision)
- [Out of scope for v1](#out-of-scope-for-v1)
- [Open questions](#open-questions)

---

## The problem

The Block Editor Handbook documents features of the Block Editor, which ships through two channels with different feature availability:

1. **Gutenberg plugin** — released every ~2 weeks; latest is [v22.9.0 (2026-04-08)](https://github.com/WordPress/gutenberg/releases).
2. **WordPress core** — versions like 6.8, 6.9, 7.0 bundle a frozen Gutenberg snapshot, typically several plugin releases behind.

`trunk` is neither of these — it contains work-in-progress code that is not available to any end user. If the Validator reads from `trunk`, the tool reports *healthy* when a doc describes an API that hasn't shipped yet, or reports *broken* when the doc correctly describes released behavior that differs from unreleased refactors.

## Three availability tiers

Any API referenced in the Handbook sits at one of:

| Tier | Where it lives | Who can use it |
|------|----------------|----------------|
| Trunk-only | Merged to `trunk`, not in any release | Nobody — internal to development |
| Plugin-only | Released in the Gutenberg plugin, not yet in WP core | Developers running the Gutenberg plugin |
| Core-shipped | Bundled into a WP core release | Anyone on that WP version or later |

A verdict of "this doc is accurate" is only meaningful **relative to a target tier.** The Handbook's primary audience is plugin users, so **plugin-latest** is the natural default for v1.

## Why trunk is the wrong default

The Phase 1 `git-clone` `CodeSource` in `ARCHITECTURE.md` does a shallow clone without specifying a ref, which resolves to the default branch (`trunk`). This hasn't surfaced as a bug yet because the Week-1 PoC target is the Block API Reference — a historically stable surface where trunk and the latest release are effectively identical. At scale (150 Handbook docs, including newer / more experimental APIs), trunk-vs-release divergence will start producing false verdicts in both directions.

## Proposed solution

Pin the two sides of the analysis to different refs — **on purpose**:

- **`DocSource`** stays at the **live published manifest** (Gutenberg `docs/manifest.json` on trunk / developer.wordpress.org). The Handbook as published is what readers actually encounter today.
- **`CodeSource`** pins to the **latest stable Gutenberg release tag**, not trunk.

The drift being measured is then: *"is the currently-published Handbook accurate for a user running the current plugin?"* — which is the question the tool's audience actually needs answered.

Resolve "latest stable release" dynamically at run time via the GitHub API:

```
GET https://api.github.com/repos/WordPress/gutenberg/releases/latest
```

This endpoint auto-filters prereleases / release candidates — no extra filtering logic needed. The resolved tag is recorded on each `DocResult` alongside the commit SHA; the plumbing already exists (see `ARCHITECTURE.md` § Code Ingestion — commit SHA on `DocResult`).

## Implementation footprint

Small — this is a config + resolver change, not a new pipeline stage.

1. **Tag resolver** (~5 lines): pre-run step that hits `releases/latest` and returns the tag name.
2. **Config field on `git-clone`**: `ref: string` — accepts a branch, tag, or SHA. Default becomes `"latest-release"` (a sentinel the resolver handles) rather than `"trunk"`.
3. **New drift type in the Validator**: *"API referenced in doc does not exist in the released code at target ref."* Complements the existing *"name no longer exists"* drift type in `ARCHITECTURE.md` § What counts as drift.
4. **`DocResult` field**: `codeRef: { tag, sha }` — records what was analyzed against, for dashboard display and reproducibility.

## PoC scope decision

**Defer to Phase 2.** Rationale:

- Week-1 PoC analyzes 10 Block API Reference docs (`block.json`, `register_block_type`, attributes, supports). These APIs are rock-stable across years of releases. Trunk vs. latest release tag will produce effectively identical verdicts on this set.
- The Week-1 schedule was already ambitious: full pipeline + dashboard + public deploy in 7 days.
- The change is small when it lands, but **one more moving part** during Phase 0 validation gate tuning has real cost.
- Revisit during **P2-M3** (150-doc pipeline) — that's when newer / experimental APIs enter the analyzed set and trunk-vs-release divergence starts producing false verdicts.

This decision is captured as an Open Question in `PLAN.md` so it isn't forgotten when Phase 2 expands scope.

## Out of scope for v1

The following are deliberately **not** part of this doc's proposed change and belong to later phases:

- **WP core version mapping** (`docs/contributors/versions-in-wordpress.md`) — needed to answer "is this API in WP 6.8 yet?" Adds a second target-version axis. Phase 2+.
- **Dev notes** (`make.wordpress.org/core/tag/dev-notes/`) — curated per-core-release developer-facing notes. Enrichment signal for deprecation and stability context.
- **"What's new in Gutenberg" posts** (`make.wordpress.org/core/tag/gutenberg-new/`) — curated per-plugin-release summaries. Same role as dev notes, at plugin granularity.
- **`__experimental` / `__unstable` prefix detection** — stability signal beyond "does the name exist."
- **Deprecation detection** (`@deprecated` tags, soft-deprecation) — orthogonal to release pinning but overlaps conceptually.

## Open questions

- **Should `DocSource` also pin to the release tag?** Arguments for: consistency, reproducibility. Arguments against: the Handbook is a live-published site, so "docs as they were at v22.9.0" is not what readers encounter today. Current answer: **no** — docs stay at live/latest; only code pins. Revisit if we ever need fully reproducible historical runs.
- **How often should the resolved tag refresh?** Per-run is simplest. Caching adds complexity for no clear win at PoC scale.
- **Runbook for broken releases** — non-semver tag, yanked release, missing release asset. Low-probability but worth a runbook entry when P2-M3 lands.
- **Dashboard display of analyzed tag + SHA** — a one-line footer or header such as *"Analyzed against Gutenberg v22.9.0 @ sha1234…"* for transparency and reproducibility. Phase 2 UI concern.
