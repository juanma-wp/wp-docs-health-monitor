# wp-docs-health-monitor

Automated health monitor for WordPress-hosted developer documentation sites.

The tool compares docs (from markdown in a repo or from a WordPress REST API) against their underlying source code and produces an evidence-backed, scored report of drift — outdated APIs, missing parameters, broken examples, deprecated usage — with suggested fixes.

## Status

🌱 Early. Phase 1 (Proof of Concept) is in progress. **Ingestion works end-to-end; the drift validator and dashboard are not yet implemented.** Running the pipeline today produces a list of docs with stub analysis results — useful for validating config, mappings, and adapter plumbing, but not yet producing real drift findings.

- **[`PLAN.md`](./PLAN.md)** — overview, scope, architecture at a glance, out-of-scope, open questions.
- **[`docs/architecture.md`](./docs/architecture.md)** — technical details: repo layout, schemas, mapping format, tech stack, risks.
- **[`docs/backlog.md`](./docs/backlog.md)** — what to build: 5 Week-1 issues + Phase 2 milestones, with owner, deps, and acceptance criteria.
- **[`docs/timeline.md`](./docs/timeline.md)** — when to build it: milestones with target dates, gates, dependencies across the month.

## Why

The Block Editor Handbook alone has 150+ editorial docs that silently drift from Gutenberg source. Contributors who want to improve docs lack a prioritized punch list. The blog post behind this project: https://radicalupdates.wordpress.com/2026/04/15/block-editor-docs-health-monitor/

## How (high level)

1. **Adapter-based pipeline:** pluggable `DocSource`, `CodeSource`, `DocCodeMapper`, `Validator`.
2. **Claude two-pass validation** with prompt caching + quoted-evidence requirements to keep false positives down.
3. **Static HTML dashboard** — one file per doc, color-coded health scores, linkable deep-URLs for fixing.
4. **GitHub Action** for weekly cron + manual dispatch (stretch for the PoC).

See [`PLAN.md`](./PLAN.md) for the design, [`docs/architecture.md`](./docs/architecture.md) for the schemas, [`docs/backlog.md`](./docs/backlog.md) for the issue breakdown, and [`docs/timeline.md`](./docs/timeline.md) for the schedule.

## Getting started

### Requirements

- **Node.js 20+** (ESM + native `fetch`).
- **Git** (the `git-clone` `CodeSource` shells out via `simple-git`).
- Roughly 1 GB free disk for the Gutenberg + wordpress-develop shallow clones the smoke run produces under `tmp/`.

### Install

```bash
git clone https://github.com/juanma-wp/wp-docs-health-monitor.git
cd wp-docs-health-monitor
npm install
```

### Verify the install

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Both should exit clean. The test suite includes a GitCloneSource test that initialises a local git repo under `tmp/` — `git` must be on PATH.

### Run the ingestion pipeline end-to-end

The bundled config targets the Gutenberg Block API Reference (10 docs).

```bash
npx tsx scripts/verify-ingestion.ts
```

What this does:

1. Loads `config/gutenberg-block-api.json` and validates it against the config schema.
2. Fetches the Gutenberg `manifest.json`, filters to entries where `parent === "block-api"`, and fetches each doc's raw markdown — held in memory only, nothing written to disk.
3. Resolves each doc slug against `mappings/gutenberg-block-api.json` and prints the mapped code files.
4. Prints `Docs fetched: 16` and `Failed: 6` (the "Failed" count includes docs whose mapping slug is missing — harmless while the mapping is still being curated).

The `git-clone` code sources (`tmp/`) are **not** triggered by this script — repos are shallow-cloned on first use once the validator is implemented. Re-runs reuse the cached clones — expect ~30s the first time, ~1s after. To start fresh, delete `tmp/`.

### Optional environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `manifest-url` DocSource | Authenticates GitHub Commits API calls for each doc's `lastModified` field. Without it you'll hit the 60/hr anonymous rate limit after ~50 docs. |
| `ANTHROPIC_API_KEY` | `scripts/bootstrap-mapping.ts` | Required for the mapping-bootstrap helper (see below). Not needed for the core pipeline until the validator lands. |

## Customising for your own docs

To monitor a different WordPress doc site or doc section, you supply two JSON files:

### 1. A config file — `config/<your-site>.json`

```json
{
  "project":   { "name": "Your Docs" },
  "docSource": {
    "type":          "manifest-url",
    "manifestUrl":   "https://raw.githubusercontent.com/OWNER/REPO/BRANCH/docs/manifest.json",
    "parentSlug":    "your-section",
    "sourceUrlBase": "https://developer.example.com/your-section/"
  },
  "codeSources": {
    "my-repo": {
      "type":    "git-clone",
      "repoUrl": "https://github.com/OWNER/REPO.git",
      "ref":     "trunk"
    }
  },
  "mappingPath": "mappings/your-site.json",
  "outputDir":   "./out",
  "validator":   { "type": "claude", "model": "claude-sonnet-4-6" }
}
```

Keys of note:
- `parentSlug` filters the manifest to a single section — start narrow.
- `sourceUrlBase` is optional; omit it to get GitHub-UI `/blob/` URLs as `Doc.sourceUrl`.
- Each key under `codeSources` (`my-repo`, `gutenberg`, `wordpress-develop`, …) becomes a valid `repo` value in the mapping file. A mapping entry that references a repo not listed here will fail config validation at construction time.

### 2. A mapping file — `mappings/<your-site>.json`

Slug-keyed, tiered code references. Tiers hint at token-budget priority: `primary` (≤3) is always sent to the validator, `secondary` (≤5) is added next, `context` (≤8) is dropped first under token pressure.

```json
{
  "your-doc-slug": {
    "primary":   [{ "repo": "my-repo", "path": "src/api.ts" }],
    "secondary": [{ "repo": "my-repo", "path": "src/api-helpers.ts" }],
    "context":   []
  }
}
```

See `mappings/gutenberg-block-api.json` for a real example.

### Bootstrap a mapping with Claude

Curating these by hand is tedious. The bootstrap helper asks Claude to propose a `CodeTiers` entry for a single slug, based on the doc content and the cloned repo's file tree. Review and commit the output yourself — it's a dev-time accelerator, not a runtime component.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx tsx scripts/bootstrap-mapping.ts <slug> --config config/your-site.json
```

Run it once per slug, paste the suggested JSON into your mapping file, then sanity-check that every referenced file exists in the repo.

### Run your custom config

The `verify-ingestion.ts` script currently hard-codes `config/gutenberg-block-api.json`. To run against your own config, either edit that path or write a thin wrapper:

```ts
import { loadConfig } from './src/config/loader.js';
import { runPipeline } from './src/pipeline.js';

const config = await loadConfig('config/your-site.json');
const results = await runPipeline(config);
console.log(JSON.stringify(results, null, 2));
```

Save it as `scripts/run-mine.ts` and run with `npx tsx scripts/run-mine.ts`. A proper CLI entry point is on the backlog.

## Development

- `npm run test:watch` — Vitest watch mode.
- `npx vitest run <path>` — run a single test file. Add `-t "<name>"` to match a single `it`.
- `npm run gen:schema` — regenerate `examples/results.schema.json` from the Zod schemas in `src/types/results.ts`. Run after any schema change.
- `CLAUDE.md` — orientation for Claude Code / Claude Agent SDK sessions working in this repo.
- `AGENTS.md` — role definitions (Backend Engineer, Frontend Engineer, QA Engineer) used when invoking `@claude` on a PR. Roles have hard scope boundaries; read before assigning reviews.

## What works today vs. what doesn't

| Works | Not yet |
|---|---|
| `manifest-url` DocSource (fetch + metrics + frontmatter) | `wordpress-rest`, `fs-walk`, `a8c-context` DocSources |
| `git-clone` CodeSource (with commit-SHA caching) | `symbol-search` DocCodeMapper |
| `manual-map` DocCodeMapper (with cross-validation) | Drift Validator (the Claude pipeline) |
| Full pipeline producing schema-valid `RunResults` | Health scoring (current results are stubs with `healthScore: 0`) |
| 51-test suite covering adapters, schemas, and error paths | Static HTML dashboard |
| Mapping-bootstrap helper via Claude | CLI entry point, GitHub Action |

See [`docs/backlog.md`](./docs/backlog.md) for what's queued and who owns it.

## License

MIT
