# wp-docs-health-monitor

Automated health monitor for WordPress-hosted developer documentation sites.

The tool compares docs against their underlying source code and produces an evidence-backed, scored report of drift — outdated APIs, missing parameters, broken examples, deprecated usage — with suggested fixes, rendered as a static HTML dashboard.

## Prerequisites

- Node.js ≥ 20
- `ANTHROPIC_API_KEY` (required for live pipeline runs)

## Install

```bash
npm install
```

## Environment setup

`ANTHROPIC_API_KEY` must be set in the environment before running the live pipeline. How you provide it is up to you:

```bash
# Inline
ANTHROPIC_API_KEY=sk-ant-... npm run analyze -- --config config/gutenberg-block-api.json --output ./out

# Exported in your shell session
export ANTHROPIC_API_KEY=sk-ant-...
npm run analyze -- --config config/gutenberg-block-api.json --output ./out

# Via 1Password CLI
op run -- npm run analyze -- --config config/gutenberg-block-api.json --output ./out
```

**Optional:** set `GITHUB_TOKEN` to authenticate the `manifest-url` DocSource's GitHub Commits API calls (used to populate each doc's `lastModified` field). Without it you'll hit the 60/hr anonymous rate limit after ~50 docs.

## Usage

### Run against live docs (requires config + API key)

```bash
npm run analyze -- --config config/gutenberg-block-api.json --output ./out
```

### Preview with mock data (no API key needed)

```bash
npm run analyze -- --results examples/mock-results.json --output ./out
```

Then open `./out/index.html` in your browser.

## CLI flags

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to a config JSON file. Required unless `--results` is provided. |
| `--output <dir>` | Output directory for the dashboard. Required. |
| `--results <path>` | Load a pre-computed `RunResults` JSON instead of running the pipeline. |
| `--only <slug>` | Analyze only the doc with this slug (pipeline runs only). |
| `--dry-run` | Print what would be analyzed without running the pipeline. Requires `--config`. |

`--results` and `--config` are mutually exclusive for pipeline execution.

## Config file reference

```json
{
  "project": { "name": "Gutenberg Block API" },
  "docSource": {
    "type": "manifest-url",
    "manifestUrl": "https://...",
    "parentSlug": "block-api",
    "sourceUrlBase": "https://developer.wordpress.org/block-editor/"
  },
  "codeSources": {
    "gutenberg": {
      "type": "git-clone",
      "repoUrl": "https://github.com/WordPress/gutenberg.git",
      "ref": "trunk"
    }
  },
  "mappingPath": "config/gutenberg-block-api-mapping.json",
  "outputDir": "./out",
  "validator": {
    "type": "claude",
    "model": "claude-sonnet-4-6"
  }
}
```

## Cost note

Each pipeline run calls the Anthropic API once per doc. With `claude-sonnet-4-6`, a full run over ~10 docs costs roughly $1–$3 depending on doc length and code context size. Use `--results` with `examples/mock-results.json` to explore the dashboard at zero cost.

The estimated cost is stored in `results.json` under `usage.estimatedCostUsd` and appended to `data/history.json` after each run. It is calculated from the token counts returned by the API using the prices configured in `config.pricing`. The defaults match the current Sonnet 4.6 rates — check [Anthropic's pricing page](https://www.anthropic.com/pricing) for updates and adjust `config.pricing` in your config file if needed.

## Dev config overrides

Each config file supports a local `.dev.json` override loaded automatically when present. For example, alongside `config/gutenberg-block-api.json` you can create `config/gutenberg-block-api.dev.json` (gitignored) to override specific settings without touching the base config:

```json
{
  "validator": {
    "pass1Model": "claude-haiku-4-5-20251001",
    "pass2Model": "claude-haiku-4-5-20251001"
  }
}
```

The override is deep-merged into the base config — only the keys you specify are replaced. This is the recommended way to use cheaper models during development. See `config/gutenberg-block-api.json` for all available settings.

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

## For contributors

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for local setup, development commands, the smoke-test pipeline, the Ralph autonomous workflow, and project status.

## License

MIT
