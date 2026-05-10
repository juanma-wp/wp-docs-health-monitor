# Release Pinning — Deferred Extensions

Back to [PLAN.md](../../PLAN.md) · Architecture in [ARCHITECTURE.md](../ARCHITECTURE.md).

The applied per-source `ref` policy lives in [`ARCHITECTURE.md` § Code Ingestion](../ARCHITECTURE.md#code-ingestion-codesource). This doc covers two extensions to that policy that remain deferred.

## Status

| `codeSource` | Current `ref` | Notes |
|--------------|--------------|-------|
| `wordpress-develop` | `6.9` (current WP release branch) | Bumped manually per WP major. |
| `gutenberg` | `trunk` | Docs publish from trunk too, so the comparison is internally consistent. |

## Extension A — Auto-resolve Gutenberg's latest plugin release tag

`gutenberg` reads from `trunk`, so APIs merged to trunk but not yet shipped in a plugin release read as healthy when no plugin user can use them yet. Resolve "latest stable" at run time via `GET /repos/WordPress/gutenberg/releases/latest` (auto-filters prereleases) behind a sentinel `ref: "latest-release"`, add a drift type *"API doesn't exist in the released code at target ref"*, and record `{ tag, sha }` on each `DocResult` for reproducibility.

## Extension B — Bundled-into-core Gutenberg snapshot

The `wordpress-develop` pin to `6.9` covers WP-core users on the PHP/core side, but Gutenberg block primitives (`block.json`, `register_block_type`, attributes, supports) inside WP 6.9 are a frozen snapshot of a specific Gutenberg plugin tag — often 6+ months behind plugin trunk, matched by neither Extension A nor the current trunk pin. Derive the bundled tag from the pinned `wordpress-develop` ref (parse `@wordpress/*` versions in its `package.json`, or read Gutenberg's `docs/contributors/versions-in-wordpress.md` mapping) and clone Gutenberg at that tag in addition to or instead of the Extension A tag.

## Deferral rationale

The PoC corpus is the Block API Reference — APIs that have been stable for years. Trunk-vs-plugin and plugin-vs-bundled gaps produce ~zero false verdicts on this set. **Trigger to revisit: P2-M3** (150-doc pipeline, when the analyzed set expands to newer / experimental Handbook areas).

## Open questions

- **Dashboard display of analyzed refs** — one-line footer with tag + SHA per source, when A lands.
- **Runbook for broken releases** — yanked tags, missing assets. A short section when A lands.
- **Should `DocSource` also pin?** Currently no — the Handbook is a live-published site. Revisit only if reproducible historical runs become a need.
