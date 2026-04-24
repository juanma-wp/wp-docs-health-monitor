# wp-docs-health-monitor

Automated health monitor for WordPress-hosted developer documentation sites.

The tool compares docs against their underlying source code and produces an evidence-backed, scored report of drift — outdated APIs, missing parameters, broken examples, deprecated usage — with suggested fixes, rendered as a static HTML dashboard.

## Prerequisites

- Node.js ≥ 20
- `ANTHROPIC_API_KEY` environment variable (required for live pipeline runs)

## Install

```bash
npm install
```

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

Each pipeline run calls the Anthropic API once per doc. With `claude-sonnet-4-6`, a full run over ~20 docs costs roughly $0.10–$0.50 depending on doc length and code context size. Use `--results` with `examples/mock-results.json` to explore the dashboard at zero cost.

## Architecture

- **[`PLAN.md`](./PLAN.md)** — overview, scope, out-of-scope, open questions.
- **[`docs/architecture.md`](./docs/architecture.md)** — schemas, mapping format, tech stack.
- **[`docs/backlog.md`](./docs/backlog.md)** — issue breakdown and milestones.

## License

MIT
