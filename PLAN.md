# WP Docs Health Monitor — PoC Plan

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

**Constraints agreed with the user:**
- Small validatable PoC (5–8 docs, markdown-sourced) but **architecture designed for scalability** to different codebases and to WordPress-sourced docs.
- Two developers working in parallel — needs cleanly separable, independently shippable issues.
- Vertical split: Dev A owns the analysis pipeline, Dev B owns CLI/dashboard/Action/config.
- Avoid the premature-abstraction trap: define adapter interfaces broadly, implement narrowly. PoC implements `markdown-git` only; `wordpress-rest` is a committed Phase 2 deliverable (not "maybe later").

**Target for first demo (Phase 1):** Gutenberg `docs/reference-guides/block-api/` via `markdown-git`. Pick 5–8 docs (e.g. `block-metadata.md`, `block-registration.md`, `block-attributes.md`, `block-supports.md`, `block-variations.md`, `block-context.md`, `block-deprecation.md`). Tight mappings to `packages/blocks/src/api/*`, known to drift.

**Target for Phase 2:** A WordPress-sourced site fetched via REST API — either developer.wordpress.org (same Block Editor Handbook content, but pulled from the published site instead of the markdown source) or a WooCommerce docs page. This proves the abstraction and is the actual shape most downstream users will want.

## Architecture Overview

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

**Adapter interfaces designed, staged implementations:**

| Interface        | Phase 1 (PoC)     | Phase 2 (committed)      | Later stubs              |
|------------------|-------------------|--------------------------|--------------------------|
| `DocSource`      | `markdown-git`    | `wordpress-rest`         | `sitemap-crawler`, `local-markdown`, `a8c-context` |
| `CodeSource`     | `git-clone`       | (reuse)                  | `multi-repo`, `local-path` |
| `DocCodeMapper`  | `manual-map` (YAML) | (reuse)                | `symbol-search`, `embedding-retrieval` |
| `Validator`      | `claude`          | (reuse)                  | (only one needed)         |

The registry lives in `packages/core/src/adapters/index.ts`. Unimplemented Later-stub adapters throw `NotImplementedError` — this documents the extension surface without adding dead code.

**`wordpress-rest` DocSource** (Phase 2) fetches via `GET /wp-json/wp/v2/<post_type>?per_page=100` with pagination, unwraps rendered HTML back to a markdown-equivalent structure (via `turndown` or `node-html-parser` + a light converter), and returns the same `Doc[]` shape as `markdown-git` so every downstream stage is source-agnostic. Auth via Application Passwords for private sites; for A8C-internal sites, delegate to the `context-a8c` MCP (a separate adapter variant).

## Tech Stack

- **Node.js 20 + TypeScript (strict).** Matches Gutenberg ecosystem, first-class Anthropic SDK, natural fit for `setup-node` in Actions.
- **Anthropic SDK (`@anthropic-ai/sdk`)** with **prompt caching** for the system prompt + shared code context, and **tool use with JSON schema** for structured issue output. Two-pass validation: (1) find candidate issues with quoted evidence, (2) verify each with targeted code re-read. Model: **`claude-sonnet-4-6`** (cost/accuracy sweet spot; upgrade to `claude-opus-4-7` only if Sonnet misses real issues during Phase 0).
- **`simple-git`** for repo clones. **`gray-matter` + `remark`** for markdown parsing. **`zod`** for runtime schema validation on config + results.
- **Static HTML dashboard** — no framework. Single `index.html` + per-doc detail pages generated via templates (e.g. `eta` or plain template literals). Tailwind via CDN for styling.
- **pnpm** workspace (optional) — not required for PoC but cheap to set up if later split into `@docs-health/core` + `@docs-health/dashboard` packages.

When implementing, use **context7 MCP** for up-to-date Anthropic SDK docs (prompt caching, tool use, streaming) — matches your global CLAUDE.md rule.

## Repo Layout

```
wp-docs-health-monitor/
├── packages/
│   ├── core/                      # Dev A's territory
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   ├── index.ts        # registry
│   │   │   │   ├── doc-source/
│   │   │   │   │   ├── types.ts
│   │   │   │   │   └── markdown-git.ts
│   │   │   │   ├── code-source/
│   │   │   │   │   ├── types.ts
│   │   │   │   │   └── git-clone.ts
│   │   │   │   ├── mapper/
│   │   │   │   │   ├── types.ts
│   │   │   │   │   └── manual-map.ts
│   │   │   │   └── validator/
│   │   │   │       ├── types.ts
│   │   │   │       └── claude.ts
│   │   │   ├── pipeline.ts         # orchestrates adapters
│   │   │   ├── health-scorer.ts
│   │   │   └── types/
│   │   │       └── results.ts      # SHARED CONTRACT (zod schema)
│   │   └── package.json
│   └── dashboard/                 # Dev B's territory
│       ├── src/
│       │   ├── generate.ts         # JSON → static HTML
│       │   ├── templates/
│       │   │   ├── index.html.eta
│       │   │   ├── doc-detail.html.eta
│       │   │   └── folder.html.eta
│       │   └── tree-builder.ts
│       └── package.json
├── src/
│   ├── cli.ts                     # Dev B — main entry
│   └── config/
│       ├── schema.ts              # zod schema for config.yml
│       └── loader.ts
├── config/
│   └── gutenberg-block-api.yml    # PoC config
├── mappings/
│   └── block-api.yml              # manual doc→code map (Dev A)
├── .github/workflows/
│   └── analyze-docs.yml           # Dev B (stretch)
├── examples/
│   └── results.schema.json        # generated from zod, for Dev B to mock against
└── README.md
```

## Shared Contract (Day 1, before branching)

This is the single most important artifact. Both devs pair on it in a 1-hour kickoff, commit to `main`, then diverge.

```ts
// packages/core/src/types/results.ts
import { z } from "zod";

export const IssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["critical", "major", "minor"]),
  type: z.enum([
    "outdated-api", "missing-parameter", "incorrect-example",
    "broken-link", "unclear-explanation", "deprecated-usage"
  ]),
  location: z.object({ line: z.number().int(), text: z.string() }),
  issue: z.string(),
  evidence: z.object({
    docSays: z.string(),
    codeSays: z.string(),
    codeFile: z.string(),
    codeLine: z.number().int().optional()
  }),
  suggestion: z.string(),
  confidence: z.number().min(0).max(1)
});

export const DocResultSchema = z.object({
  file: z.string(),
  url: z.string().url().optional(),
  analyzedAt: z.string().datetime(),
  commitSha: z.string(),       // enables change detection later
  healthScore: z.number().min(0).max(100),
  status: z.enum(["healthy", "needs-attention", "critical"]),
  metrics: z.object({
    wordCount: z.number(),
    codeExamples: z.number(),
    internalLinks: z.number(),
    externalLinks: z.number(),
    lastModified: z.string().datetime().optional()
  }),
  relatedCode: z.array(z.string()),
  issues: z.array(IssueSchema),
  positives: z.array(z.string())
});

export const RunResultsSchema = z.object({
  project: z.string(),
  runId: z.string(),
  analyzedAt: z.string().datetime(),
  scope: z.object({
    source: z.string(),
    docsCount: z.number()
  }),
  overallHealth: z.number().min(0).max(100),
  totals: z.object({
    critical: z.number(),
    major: z.number(),
    minor: z.number()
  }),
  docs: z.array(DocResultSchema)
});

export type RunResults = z.infer<typeof RunResultsSchema>;
```

Dev B generates `examples/results.schema.json` from this and mocks a fixture, so Dev B's dashboard work is unblocked immediately — doesn't have to wait for real pipeline output.

## Issues for Parallel Work

Numbering prefix: A = pipeline (Dev A), B = presentation (Dev B), S = shared/stretch.

### Day 1 — Shared Kickoff (both devs)
- **S0** Repo init, tsconfig, eslint, prettier, pnpm/npm setup.
- **S1** Define and merge `RunResultsSchema` (zod) and `ConfigSchema`. Export generated JSON Schema to `examples/`.
- **S2** Agree on CLI entry point signature: `runPipeline(config: Config): Promise<RunResults>`. Dev B calls this from `cli.ts`; Dev A provides the implementation.

### Dev A — Pipeline

- **A1** Adapter interfaces + registry (`doc-source`, `code-source`, `mapper`, `validator`). Unimplemented adapters throw `NotImplementedError`.
- **A2** `markdown-git` DocSource: clones a repo shallowly, reads a section's `.md` files, parses frontmatter + code blocks via `gray-matter` + `remark`. Returns `Doc[]` with `{path, url, content, codeExamples, metrics}`.
- **A3** `git-clone` CodeSource: shallow-clones a repo, exposes `readFile(relPath)` and `listDir(relPath)`. Handles caching between runs via commit SHA.
- **A4** `manual-map` Mapper: loads `mappings/block-api.yml`, resolves doc path → list of code file paths.
- **A5** Manual mapping file: write `mappings/block-api.yml` for the 5–8 chosen docs. Format:
  ```yaml
  - doc: reference-guides/block-api/block-metadata.md
    code:
      - packages/blocks/src/api/registration.js
      - packages/blocks/src/api/parser.js
  ```
- **A6** Claude Validator:
  - System prompt (cached): rules for identifying genuine drift, forbidding hallucination, requiring quoted evidence.
  - Tool-use schema matches `IssueSchema`.
  - Pass 1 (cached code context): emit candidate issues.
  - Pass 2 (per-issue): for each candidate, re-fetch the exact code lines referenced and ask the model to confirm/reject. Discard confidence < 0.7.
  - Budget: 50k input tokens/doc max, most of it cached.
- **A7** Pipeline orchestrator (`runPipeline`): wires the adapters, emits `RunResults`. Concurrency: analyze docs in parallel with `p-limit` (default 3).
- **A8** Health scorer: formula + thresholds for `healthScore` and `status`. Keep it simple (e.g. `100 - (critical*15 + major*7 + minor*2)`, clamp 0..100).
- **A9** Unit tests for the validator prompt using a known-drifted doc fixture — the quality gate before demo.

### Dev B — Presentation

- **B1** Config loader: YAML → validated `Config` via zod.
- **B2** CLI (`npm run analyze -- --config config/gutenberg-block-api.yml --output ./out`). Flags: `--config`, `--output`, `--only <glob>`, `--dry-run`.
- **B3** Dashboard generator: reads `results.json`, produces:
  - `out/index.html` — overall health, tree view of docs with per-folder aggregates.
  - `out/doc/<slug>.html` — detail page with issues, evidence, suggestions.
  - `out/folder/<path>.html` — folder summary.
  - Tailwind via CDN, no build step.
- **B4** Tree builder: given a flat list of doc paths, build the nested folder tree with aggregated health scores.
- **B5** Mock fixture: checked-in `examples/mock-results.json` for dashboard dev without running the pipeline.
- **B6** GitHub Action workflow (stretch for PoC): manual dispatch + weekly cron, uploads dashboard as artifact. Deploy to GitHub Pages after PoC is validated.
- **B7** README with example commands + screenshots + cost expectations.

### Phase 2 — After PoC is validated (committed)

- **P2-1** `wordpress-rest` DocSource: pagination, HTML→markdown normalization, Application Password auth, meta/slug round-trip fields so fixes can later be written back. Demoed against one real WP docs site (dev.wordpress.org or a WooCommerce page).
- **P2-2** Dashboard: show source type per doc ("markdown" / "wordpress") and deep-link to the edit URL in WP so authors can fix directly.
- **P2-3** `a8c-context` DocSource variant: use the context-a8c MCP for A8C-internal sites (Fieldguide, P2s) that aren't publicly reachable.

### Stretch — nice to have

- **S3** Change Detector: diffs last-analyzed commit SHA vs current, queues only changed docs + docs whose mapped code changed. Biggest cost lever per the blog post.
- **S5** `symbol-search` Mapper (heuristic doc→code resolution to reduce manual mapping work for new sections).
- **S6** Trend tracking across runs (store history, show trend line in dashboard).
- **S7** GitHub Pages deploy in the Action.
- **S8** Round-trip: open a GitHub PR on the markdown source (or draft a WP post update via REST) for issues above a confidence threshold.

## Phase 0 Validation (before PoC scale-up)

Day 2–3 of Dev A's work, gate everything else behind it:

1. Pick 3 of the 5–8 docs.
2. Manually read each doc + its mapped code. Write down what a human reviewer considers the top drift issues.
3. Run the validator on those 3 docs.
4. Measure precision: of issues reported, how many are real? Target ≥80%. Recall: of the human-found issues, how many did it surface? Target ≥70%.
5. If precision is weak, iterate the system prompt before scaling. If it still fails, that's a go/no-go signal — better to learn at day 3 than day 14.

## Verification (end-to-end)

1. `npm install`
2. `export ANTHROPIC_API_KEY=...`
3. `npm run analyze -- --config config/gutenberg-block-api.yml --output ./out`
4. `open out/index.html` — verify tree view renders, scores look reasonable, clicking a doc shows evidence-backed issues with line numbers and suggestions.
5. Manual precision check on 10 random issues: confirm they're real drift, not hallucination.
6. Cost check: ≤$1 for the full 5–8 doc run.
7. (Stretch) Trigger the GitHub Action manually, verify artifact upload.

## Risks and Mitigations

- **AI hallucination / false positives** → two-pass validation + quoted evidence requirement + confidence threshold ≥0.7. Reject any issue whose `evidence.codeSays` can't be found verbatim in the referenced file (validate in code, not just the prompt).
- **Premature abstraction** → adapter interfaces are stubs; only implemented adapters get code. Registry documents the extension surface without adding maintenance burden.
- **Dev A / Dev B divergence** → Day-1 schema handshake + mock fixture; Dev B never has to wait on Dev A.
- **Mapping accuracy for the 5–8 docs** → manual, curated, checked into git; mapping errors are quick to fix when a human spotted the issue.
- **Timeline pressure** → GitHub Action, Pages deploy, change detector are all marked stretch. Core shippable demo is the CLI + local dashboard.

## Out of Scope for PoC

- Auto-generated package READMEs (`packages/*/README.md`) — most are docgen output, low drift signal.
- WordPress REST / wpcom doc sources — interface defined, implementation deferred.
- Auto-PRs with fixes, screenshots analysis, multi-handbook coverage.
- Fine-tuning — off-the-shelf Claude Sonnet 4.6.

## Open Questions (non-blocking)

- Does the repo live in a personal GitHub or in a WordPress/Automattic org? (affects Action secrets and Pages URL — answer before B6.)
- Licensing: MIT to match the WordPress ecosystem? (confirm before repo init.)
- Should the 5–8 docs include any known-clean ones as controls? (recommended — two "healthy" and six "suspect" gives a better demo than all-suspect.)
- **Phase 2 target site**: developer.wordpress.org (Block Editor Handbook pulled from the published site) vs a WooCommerce docs page vs an internal A8C docs P2. Each has different auth, different content shape, and different audience. Decide before P2-1 starts.
- **Fix round-trip**: do we want to auto-open PRs / draft WP post updates (S8), or keep the tool strictly read-only and leave fixes to humans? Auto-PRs change the trust bar significantly.
- **Markdown↔WP drift**: when both a markdown source AND a WP-edited post exist for the same doc, they can drift from each other. Out of scope for PoC, but worth flagging because it's a real failure mode.
