# Generating dashboards

The repo ships two pieces of HTML output, generated from committed `results.json` files. No re-analysis is needed — everything below reads pre-existing data and writes HTML.

- **Per-site dashboard** — one per config in `config/`, lives under `out/<site-slug>/`. Latest run lands at `out/<site-slug>/index.html`; archived runs at `out/<site-slug>/runs/<runId>/index.html`.
- **Cross-site meta-index** — single landing page at `out/index.html` linking into each per-site dashboard. Backed by `out/sites.json`.

Source of truth for both is `out/<site-slug>/data/runs/<runId>/results.json`. Those files are committed; everything derived from them (HTML, `history.json`, `site.json`, `sites.json`) is gitignored and regenerated on demand.

## What's in the repo right now

Configs (`config/`):

- `gutenberg-block-editor.json`
- `wp-theme-handbook.json`

Committed results (`out/<site>/data/runs/<runId>/results.json`):

- `gutenberg-block-editor/data/runs/20260522-184702/results.json`
- `gutenberg-block-editor/data/runs/20260525-100223/results.json`
- `wp-theme-handbook/data/runs/20260525-102714/results.json`

The examples below use these files verbatim.

## The one-shot path: `npm run rebuild`

Rebuilds **every** per-site dashboard *and* the meta-index from committed `results.json` files. Idempotent. This is what CI runs before deploying to GitHub Pages, and it's the right command 95% of the time.

```
npm run rebuild
```

What it does, per config in `config/*.json` (skipping `*.dev.json`):

1. Reads every `out/<site>/data/runs/*/results.json` matching `<runId>` = `YYYYMMDD-HHMMSS`.
2. Sorts by timestamp; latest wins.
3. Writes `out/<site>/data/history.json` and `out/<site>/data/site.json`.
4. Renders `out/<site>/index.html` (latest) + `out/<site>/runs/<runId>/index.html` for every archived run, including per-doc and per-folder detail pages.
5. Renders `out/sites.json` + `out/index.html` (the meta-index) covering all rebuilt sites.

After running, open:

- `out/index.html` — cross-site landing page
- `out/gutenberg-block-editor/index.html` — Gutenberg Block Editor latest (currently `20260525-100223`)
- `out/wp-theme-handbook/index.html` — WP Theme Handbook latest (currently `20260525-102714`)

See `scripts/rebuild.ts` for the wire-up.

## Rendering a single site's dashboard from an existing `results.json`

When you want to re-render *one* site without touching the others (e.g. iterating on the dashboard renderer, or inspecting an archived run), use the `analyze` CLI with `--results`:

```
npm run analyze -- \
  --config config/gutenberg-block-editor.json \
  --results out/gutenberg-block-editor/data/runs/20260525-100223/results.json \
  --output out/gutenberg-block-editor
```

What this does (from `src/cli.ts`):

- Skips the validator pipeline entirely (because `--results` is provided).
- Parses the results file through `RunResultsSchema` — invalid files exit non-zero.
- Copies the file to `out/gutenberg-block-editor/data/runs/<runId>/results.json` (no-op when source == destination).
- Updates `data/history.json` and `data/site.json` for that site.
- Renders `out/gutenberg-block-editor/index.html` (latest) plus an archived dashboard for every run already in `history.json`.

Same shape works for the theme handbook:

```
npm run analyze -- \
  --config config/wp-theme-handbook.json \
  --results out/wp-theme-handbook/data/runs/20260525-102714/results.json \
  --output out/wp-theme-handbook
```

`--output` can be omitted — it defaults to `<config.outputDir>/<config-basename>` (e.g. `out/gutenberg-block-editor`). Passing it explicitly is clearer when you're aiming results at a different directory.

This command does **not** touch `out/index.html` — only the per-site dashboard. To refresh the meta-index after rendering individual sites, see the next section.

## Building the cross-site meta-index: `npm run index`

`npm run index` stitches **already-built** per-site dashboard directories into the cross-site landing page. It reads `data/site.json` and `data/history.json` from each site dir; it does not look at `results.json` and does not render per-site HTML.

```
npm run index -- \
  --site out/gutenberg-block-editor out/wp-theme-handbook \
  --output out
```

`--site` is repeatable (or space-separated, as above). The links in the generated `index.html` are `relative(output, site)`, so put `--output` somewhere that sits alongside the site dirs — `out/` in the standard layout.

Output:

- `out/sites.json` — registry validated against `SiteRegistrySchema`.
- `out/index.html` — landing page rendered by `renderMetaIndex`.

If a site dir is missing `data/site.json`, the meta-index falls back to the directory basename for its label (`src/cli-meta.ts:71-72`).

## When to use which

| Goal | Command |
| --- | --- |
| Refresh everything from committed `results.json` files | `npm run rebuild` |
| Re-render one site's dashboard from an existing `results.json` | `npm run analyze -- --config <c> --results <r>` |
| Rebuild only the cross-site landing page over existing site dirs | `npm run index -- --site <dirs> --output out` |
| Run the validator end-to-end and produce a new `results.json` + dashboard | `npm run analyze -- --config <c>` (no `--results`) |

`rebuild` is the union of the other three on the dashboard side; reach for the narrower commands when you want isolation or speed.

## Notes

- `runId` must match `YYYYMMDD-HHMMSS`. `analyze` rejects anything else (`src/cli.ts:102-105`); `rebuild` silently skips non-matching run directories.
- `results.json` is validated against `RunResultsSchema` on every read. Files that don't parse are skipped with a warning rather than failing the whole rebuild.
- All HTML output is gitignored. Only `results.json` files (and configs/mappings) are committed; the dashboard is always reproducible from them.
