# Development

This guide is for contributors to wp-docs-health-monitor. For end-user setup, configuration, and CLI usage, see [`README.md`](./README.md).

## Orientation

Read these in order when getting started:

- [`PLAN.md`](./PLAN.md) — phases, decisions, scope.
- [`docs/PRD.md`](./docs/PRD.md) — requirements and user stories.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — why decisions were made (locked-contract / adapter-pattern rationale).
- [`AGENTS.md`](./AGENTS.md) — role-scoped reviewing/implementation boundaries (Backend, Frontend, QA Engineer).
- [`CLAUDE.md`](./CLAUDE.md) — orientation for Claude Code / Agent SDK sessions in this repo.
- [`src/pipeline.ts`](./src/pipeline.ts) — the wire-up.

## Local setup

```bash
git clone https://github.com/juanma-wp/wp-docs-health-monitor.git
cd wp-docs-health-monitor
npm install
```

Requirements:

- **Node.js 20+** (ESM + native `fetch`).
- **Git** on PATH (the `git-clone` `CodeSource` shells out via `simple-git`).
- Roughly 1 GB free disk for the Gutenberg + wordpress-develop shallow clones the smoke run produces under `tmp/`.

### Verify the install

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

Both should exit clean. The test suite includes a `GitCloneSource` test that initialises a local git repo under `tmp/` — `git` must be on PATH.

## Development commands

| Command | What it does |
|---|---|
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Vitest in watch mode. |
| `npx vitest run <path>` | Run a single test file. Add `-t "<name>"` to match a single `it`/`describe`. |
| `npm run typecheck` | `tsc --noEmit`. CI-equivalent correctness check; run before pushing. |
| `npm run gen:schema` | Regenerates `examples/results.schema.json` from `src/types/results.ts`. Run after changing any of the `*Schema` exports in `src/types/`. |

## Smoke-test the ingestion pipeline

```bash
npx tsx scripts/verify-ingestion.ts
```

What this does:

1. Loads `config/gutenberg-block-api.json` and validates it against the config schema.
2. Fetches the Gutenberg `manifest.json`, filters to entries where `parent === "block-api"`, and fetches each doc's raw markdown — held in memory only, nothing written to disk.
3. Resolves each doc slug against `mappings/gutenberg-block-api.json` and prints the mapped code files.
4. Prints `Docs fetched: 16` and `Failed: 6` (the "Failed" count includes docs whose mapping slug is missing — harmless while the mapping is still being curated).

The `git-clone` code sources (`tmp/`) are **not** triggered by this script — repos are shallow-cloned on first use once the validator is implemented. Re-runs reuse the cached clones — expect ~30s the first time, ~1s after. To start fresh, delete `tmp/`.

## Running the pipeline programmatically

`npm run analyze` is the user-facing CLI (see README). To call the pipeline from your own script (e.g. for integration tests or an alternate driver):

```ts
import { loadConfig } from './src/config/loader.js';
import { runPipeline } from './src/pipeline.js';

const config = await loadConfig('config/your-site.json');
const results = await runPipeline(config);
console.log(JSON.stringify(results, null, 2));
```

Save it as `scripts/run-mine.ts` and run with `npx tsx scripts/run-mine.ts`. (The `verify-ingestion.ts` script currently hard-codes `config/gutenberg-block-api.json` — write a wrapper rather than editing it.)

## Autonomous workflow (Ralph)

`ralph/` + `.sandcastle/` host an autonomous loop that picks up GitHub issues triaged for an agent, opens a PR per issue, and stops. A human pulls the branch, runs the *How to test* steps from the PR body, and merges.

Each contributor runs Ralph against their own backlog by setting `RALPH_ASSIGNEE` in `.env` to their GitHub username. Ralph only acts on issues that carry **both** `assignee:$RALPH_ASSIGNEE` **and** `label:ready-for-agent` — every other issue is invisible to it.

### One-time prerequisites

- Docker Desktop running on the host.
- Build the Sandcastle sandbox image once per machine:
  ```bash
  npx sandcastle docker build-image --image-name sandcastle:wp-docs-health
  ```

### Required `.env` keys

Add to the repo-root `.env` (gitignored, raw values):

| Key | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Code CLI inside the sandbox. |
| `GH_TOKEN` | PAT with `repo` scope so the sandbox can push branches and open PRs. |
| `RALPH_ASSIGNEE` | Your GitHub username. Ralph only picks up open `ready-for-agent` issues assigned to this user. |

### Triage an issue for Ralph

Run the `/triage` skill on a GitHub issue, post the resulting **Agent Brief** as a comment, and apply both `assignee:<your-username>` and `label:ready-for-agent`. Without those two together, Ralph will not touch the issue.

### Three entry points

| Script | Mode | When to use |
|---|---|---|
| `./ralph/dryrun.sh` | Prints the resolved prompt; no Claude call | Verify the issue filter and prompt expansion before spending tokens. |
| `./ralph/once.sh` | HITL (no sandbox); uses your local `claude` CLI | First few runs against a new issue type — you watch and approve permission prompts. |
| `./ralph/afk.sh <maxIterations>` | Autonomous in a Sandcastle Docker sandbox | Once you trust the loop. Default `maxIterations` is `3`. |

### Contract (non-negotiable)

- Ralph **never merges PRs** and **never closes issues**. The merge auto-closes via `Closes #<n>` in the PR body.
- Ralph **never pushes to `main`**. Every change lands through a `ralph/<issue>-<slug>` branch and a human-merged PR.
- Every PR body must include a runnable *How to test* section.
- Issues without both `assignee:$RALPH_ASSIGNEE` AND `label:ready-for-agent` are out of scope — no comments, no labels, nothing.

The full prompt and these rules live in `.sandcastle/prompt.md`.

## Project status

| Works | Not yet |
|---|---|
| `manifest-url` DocSource (fetch + metrics + frontmatter) | `wordpress-rest`, `fs-walk`, `a8c-context` DocSources |
| `git-clone` CodeSource (with commit-SHA caching) | `symbol-search` DocCodeMapper |
| `manual-map` DocCodeMapper (with cross-validation) | Drift Validator (the Claude pipeline) |
| Full pipeline producing schema-valid `RunResults` | Health scoring (current results are stubs with `healthScore: 0`) |
| 51-test suite covering adapters, schemas, and error paths | Static HTML dashboard |
| Mapping-bootstrap helper via Claude | CLI entry point, GitHub Action |

See [`docs/plans/next-steps.md`](./docs/plans/next-steps.md) for the current working plan.
