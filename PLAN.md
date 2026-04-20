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
- **Week 1 PoC deadline:** ~2026-04-27 (one week from kickoff). Aggressive scope discipline.
- Small validatable first iteration (~10 docs) but **architecture designed to scale to ~200 docs/site**.
- **"Docs might be OK" is a valid outcome** — the tool must confidently report *healthy* when nothing is wrong, not just find issues. Recall (did we miss drift?) matters as much as precision (is what we found real?).
- Two developers working in parallel — cleanly separable, independently shippable issues.
- Vertical split: Dev A owns the analysis pipeline, Dev B owns CLI + dashboard + config.
- Avoid the premature-abstraction trap: define adapter interfaces broadly, implement narrowly. PoC implements `manifest-url` DocSource only; `wordpress-rest` is a committed Phase 2 deliverable.
- **Public GitHub repo + GitHub Pages** for the dashboard. Dashboard is the product — overall health %, per-doc detail pages with evidence and proposed actions, informational (no gamification).
- Quality first, cost secondary. Flag if costs go off rails (rough guardrail: < $5 per full 10-doc PoC run).

**Week 1 cut list** (to make the deadline realistic with both devs):
- ❌ GitHub Action — deferred to Phase 2. Manual CLI run → manual commit of `out/` to `gh-pages` for Week 1.
- ❌ pnpm workspaces / monorepo — single flat package.
- ✅ **Kept:** two-pass validation (with Day-3 decision point if it proves too fragile), LLM-bootstrap script, Tailwind-CDN dashboard.
- 🔄 **Day-3 decision point on Pass 2:** if precision on 3 docs ≥80%, keep Pass 2; if <80%, ship Pass 1 only with strict `confidence ≥ 0.8` and still-demoable dashboard.

**Target for first demo (Phase 1):** ~10 docs from the Gutenberg Block API Reference (https://developer.wordpress.org/block-editor/reference-guides/block-api/) — e.g. `block-metadata`, `block-registration`, `block-attributes`, `block-supports`, `block-variations`, `block-context`, `block-deprecation`, `block-transforms`, `block-patterns`, `block-bindings`. Tight mappings to `packages/blocks/src/api/*` and `schemas/json/block.json`. Code source: **gutenberg only** (no wordpress-develop/PHP core in Week 1).

**Target for Phase 2:** A WordPress-sourced site fetched via REST API — either developer.wordpress.org (Block Editor Handbook from the published site instead of the markdown source) or a WooCommerce docs page. Proves the abstraction and is the shape downstream users will want.

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
| `DocSource`      | `manifest-url` (consumes Gutenberg-style `manifest.json`) | `wordpress-rest`, `fs-walk` (generate manifest for markdown sites without one) | `sitemap-crawler`, `a8c-context` |
| `CodeSource`     | `git-clone`       | (reuse)                  | `multi-repo`, `local-path` |
| `DocCodeMapper`  | `manual-map` (slug-keyed JSON, tiered) + LLM-bootstrap helper | (reuse) | `symbol-search`, `embedding-retrieval`, `hybrid` |
| `Validator`      | `claude`          | (reuse)                  | (only one needed)         |

The registry lives in `src/adapters/index.ts`. Unimplemented Later-stub adapters throw `NotImplementedError` — documents the extension surface without adding dead code.

**`wordpress-rest` DocSource** (Phase 2) fetches via `GET /wp-json/wp/v2/<post_type>?per_page=100` with pagination, unwraps rendered HTML back to markdown-equivalent structure, and **produces a manifest-shaped list** so every downstream stage is source-agnostic. Auth via Application Passwords for private sites; A8C-internal sites delegate to the `context-a8c` MCP (a separate adapter variant).

**`fs-walk` DocSource** (Phase 2) walks a markdown directory to **generate** a manifest for sites that don't publish one. Output conforms to the same schema.

## Doc Index & Mapping Format

Two files per site. Decoupled concerns: *what docs exist* vs *what code each one relates to*.

### File 1 — `manifest.json` (doc index)

Canonical format = **Gutenberg's `manifest.json`** (https://github.com/WordPress/gutenberg/blob/trunk/docs/manifest.json). Each entry:

```json
{
  "title": "Block Metadata",
  "slug": "block-metadata",
  "markdown_source": "https://raw.githubusercontent.com/WordPress/gutenberg/trunk/docs/reference-guides/block-api/block-metadata.md",
  "parent": "block-api"
}
```

For Gutenberg, we **consume the existing manifest verbatim** — no work, no maintenance. Just fetch the URL and filter by `parent: "block-api"` for Week 1.

For sites that don't publish a manifest (WooCommerce docs, internal A8C sites, any markdown repo), later phases **generate** one: `fs-walk` adapter for markdown repos, `wordpress-rest` adapter for WP-sourced sites. Output conforms to the same shape.

### File 2 — `mapping.json` (doc → code)

Slug-keyed JSON with tiered code lists. **Slug is the primary key**, not file path — more stable when docs get reorganized.

```json
// mappings/gutenberg-block-api.json
{
  "block-metadata": {
    "primary":   ["packages/blocks/src/api/registration.js", "schemas/json/block.json"],
    "secondary": ["packages/blocks/src/api/parser.js", "packages/blocks/src/api/process-block-type.js"],
    "context":   ["packages/block-editor/src/components/block-edit/index.js"]
  },
  "block-registration": {
    "primary":   ["packages/blocks/src/api/registration.js"],
    "secondary": [],
    "context":   []
  }
}
```

**Tiers are token-budget hints for the validator:**
- `primary` — always sent. Source of truth for this doc.
- `secondary` — usually sent. Supporting context that catches most real drift.
- `context` — dropped first when budget is tight; retrieved on demand in Pass 2.

### Why two separate files

- `manifest.json` is **site metadata** (could be upstreamed, machine-generated, maintained by doc owners).
- `mapping.json` is **tool-specific knowledge** (maintained by us or by contributors using the tool).
- Separation means we can drop a new site in by adding one `mapping.json` — the manifest is whatever the site already has (or generated once).

### LLM-assisted bootstrap

Hand-writing mappings doesn't scale past ~50 docs. A one-shot dev-time helper — `scripts/bootstrap-mapping.ts <slug>` — asks Claude *"given this doc and this file tree, which files are `primary`/`secondary`/`context`?"* and writes a candidate JSON block. A human reviews and trims before committing.

Not a runtime adapter — a CLI helper you run once per doc. The `manual-map` adapter stays deterministic at analysis time.

### Scaling path beyond PoC

1. **Phase 1 (PoC):** `manual-map` slug-keyed JSON + bootstrap script. ~10 docs, <1 hour with the helper.
2. **Phase 2+:** `symbol-search` mapper — extract symbols from doc (functions, hooks, attribute names, code-block imports), AST-grep the codebase via `ast-grep`/`tree-sitter`, rank by proximity and specificity. Auto-generates a candidate mapping.
3. **Phase 3:** `hybrid` mapper — `symbol-search` candidates + a JSON overrides layer (`include` / `exclude` / `pin`) for manual corrections. Long-term shape.
4. **(Optional) `embedding-retrieval`:** semantic similarity when symbol matching isn't enough. Heavier infra; only if needed.

All four share the same `DocCodeMapper` interface — swapping is an adapter-config change, not a rewrite. The PoC JSON format is forward-compatible: it becomes the "override" layer in the hybrid adapter with an `overrides:` key added.

### Known limitation (deferred)

**Slug renames break the mapping silently.** If the manifest renames `block-metadata` → `block-json-metadata`, our `mapping.json` key is stale and the validator reports "no mapping found". Low probability in practice. Mitigation when we hit it: a lint step at run-start warning about mapping keys not present in the manifest. Deferred — not implemented in Week 1.

## Tech Stack

- **Node.js 20 + TypeScript (strict).** Matches Gutenberg ecosystem, first-class Anthropic SDK, natural fit for `setup-node` in Actions.
- **Anthropic SDK (`@anthropic-ai/sdk`)** with **prompt caching** for the system prompt + shared code context, and **tool use with JSON schema** for structured issue output. Two-pass validation: (1) find candidate issues with quoted evidence, (2) verify each with targeted code re-read. Model: **`claude-sonnet-4-6`** (cost/accuracy sweet spot; upgrade to `claude-opus-4-7` only if Sonnet misses real issues during Phase 0).
- **`simple-git`** for repo clones. **`gray-matter` + `remark`** for markdown parsing. **`zod`** for runtime schema validation on config + results.
- **Static HTML dashboard** — no framework. `index.html` + per-doc detail pages generated via templates (`eta` or plain template literals). Tailwind via CDN for styling, no build step.
- **Single flat npm package** for Week 1. No monorepo, no pnpm workspaces — kept simple to fit the one-week timeline.

When implementing, use **context7 MCP** for up-to-date Anthropic SDK docs (prompt caching, tool use, streaming) — matches your global CLAUDE.md rule.

## Repo Layout

```
wp-docs-health-monitor/
├── src/
│   ├── adapters/                    # Dev A
│   │   ├── index.ts                  # registry
│   │   ├── doc-source/
│   │   │   ├── types.ts
│   │   │   └── manifest-url.ts       # PoC impl (consumes Gutenberg manifest.json)
│   │   ├── code-source/
│   │   │   ├── types.ts
│   │   │   └── git-clone.ts
│   │   ├── mapper/
│   │   │   ├── types.ts
│   │   │   └── manual-map.ts         # reads slug-keyed JSON
│   │   └── validator/
│   │       ├── types.ts
│   │       └── claude.ts             # two-pass, prompt-cached, tool-use
│   ├── pipeline.ts                  # Dev A — wires adapters, emits RunResults
│   ├── health-scorer.ts             # Dev A
│   ├── config/                      # Dev B
│   │   ├── schema.ts
│   │   └── loader.ts
│   ├── dashboard/                   # Dev B
│   │   ├── generate.ts               # RunResults → static HTML
│   │   ├── templates/
│   │   │   ├── index.html.eta
│   │   │   ├── doc-detail.html.eta
│   │   │   └── folder.html.eta
│   │   └── tree-builder.ts
│   ├── cli.ts                       # Dev B — main entry
│   └── types/
│       ├── results.ts                # SHARED CONTRACT (zod)
│       └── mapping.ts                # MappingSchema + Manifest types
├── scripts/
│   └── bootstrap-mapping.ts         # LLM-assisted helper: slug → JSON candidate (Dev A)
├── config/
│   └── gutenberg-block-api.yml      # PoC config
├── mappings/
│   └── gutenberg-block-api.json     # slug-keyed tiered map (Dev A)
├── examples/
│   ├── mock-results.json            # for dashboard dev without running pipeline (Dev B)
│   └── results.schema.json          # generated from zod
├── out/                             # gitignored — generated dashboard
├── package.json                     # single flat package
├── tsconfig.json
├── PLAN.md
└── README.md
```

No `packages/` directory, no monorepo, no GitHub Action workflow in Week 1. All deferred to Phase 2.

## Shared Contract (Day 1, before branching)

This is the single most important artifact. Both devs pair on it in a 1-hour kickoff, commit to `main`, then diverge.

```ts
// src/types/results.ts
import { z } from "zod";

// ─── Manifest (doc index) ──────────────────────────────────────────────

export const ManifestEntrySchema = z.object({
  title: z.string(),
  slug: z.string(),                       // primary key within a site
  markdown_source: z.string().url(),      // URL to raw markdown (or local path)
  parent: z.string().optional()           // parent slug for hierarchy
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

// ─── Mapping (slug → code files) ───────────────────────────────────────

export const CodeTiersSchema = z.object({
  primary:   z.array(z.string()).default([]),
  secondary: z.array(z.string()).default([]),
  context:   z.array(z.string()).default([])
});

// mapping.json is a Record<slug, CodeTiers>
export const MappingSchema = z.record(z.string(), CodeTiersSchema);
export type Mapping = z.infer<typeof MappingSchema>;

// ─── Issues & results ──────────────────────────────────────────────────

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
  slug: z.string(),                                        // key from manifest
  title: z.string(),
  parent: z.string().optional(),
  sourceUrl: z.string().url(),                             // markdown_source
  publishedUrl: z.string().url().optional(),               // rendered doc URL if known
  analyzedAt: z.string().datetime(),
  commitSha: z.string().optional(),                        // enables change detection later
  healthScore: z.number().min(0).max(100),
  status: z.enum(["healthy", "needs-attention", "critical"]),
  metrics: z.object({
    wordCount: z.number(),
    codeExamples: z.number(),
    internalLinks: z.number(),
    externalLinks: z.number(),
    lastModified: z.string().datetime().optional()
  }),
  relatedCode: z.array(z.object({
    path: z.string(),
    tier: z.enum(["primary", "secondary", "context"]),
    includedInAnalysis: z.boolean()                        // false if dropped to fit budget
  })),
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

Each issue is sized to be **individually shippable** — one person, one PR, one merge. Sizes: **S** <1h, **M** 1–3h, **L** 3–6h (flag an L for potential split if it bloats during work).

Every issue has:
- **Owner** (Dev A / Dev B / Either) — suggested, swap freely
- **Deps** — prerequisite issue IDs that must be merged first
- **Done when** — acceptance check a reviewer uses

Full issue backlog: **~30 issues, ~50 dev-hours total**. Fits two devs × ~5 days with buffer. Phase 2 / Stretch items are kept intentionally coarse — break them down later.

### Day 1 — Shared Kickoff (both devs, half-day pair session)

- **S0 — Bootstrap repo** · Either · S
  - Deps: —
  - Done when: `package.json`, `tsconfig.json` (strict), ESLint + Prettier, `.gitignore`, `src/index.ts` placeholder. `npm run typecheck` passes on an empty project.

- **S1 — Manifest + mapping types** · Dev A · S
  - Deps: S0
  - Done when: `src/types/mapping.ts` exports `ManifestEntrySchema`, `CodeTiersSchema`, `MappingSchema` (zod). Types compile.

- **S2 — Issue + result types** · Dev A · M
  - Deps: S0
  - Done when: `src/types/results.ts` exports `IssueSchema`, `DocResultSchema`, `RunResultsSchema` (zod). Matches the Shared Contract above exactly.

- **S3 — Config schema** · Dev B · S
  - Deps: S0
  - Done when: `src/config/schema.ts` exports `ConfigSchema` with fields for project, docs source, code source, mapping path, output dir.

- **S4 — Pipeline entry stub** · Either · S
  - Deps: S2
  - Done when: `src/pipeline.ts` exports `runPipeline(config: Config): Promise<RunResults>` returning an empty-but-valid `RunResults`. This is the interface Dev B codes against.

- **S5 — Export JSON Schema** · Either · S
  - Deps: S2
  - Done when: `npm run gen:schema` writes `examples/results.schema.json` via `zod-to-json-schema`.

- **S6 — Mock results fixture** · Either · M
  - Deps: S2, S5
  - Done when: `examples/mock-results.json` has ~4 fake docs (one healthy, one needs-attention, one critical, one with varied issue types) and passes `RunResultsSchema` validation. **Unblocks Dev B fully.**

### Dev A — Pipeline

- **A1 — Adapter registry** · Dev A · S
  - Deps: S0
  - Done when: `src/adapters/index.ts` exports a registry and `NotImplementedError`. Empty type files for `doc-source`, `code-source`, `mapper`, `validator`.

- **A2a — DocSource interface** · Dev A · S
  - Deps: A1, S1
  - Done when: `src/adapters/doc-source/types.ts` defines `DocSource.list(config) → Doc[]` returning `{slug, title, parent, sourceUrl, content, codeExamples, metrics}`.

- **A2b — `manifest-url`: fetch + validate** · Dev A · M
  - Deps: A2a
  - Done when: given a manifest URL, fetches JSON, validates each entry against `ManifestEntrySchema`, warns on invalid entries without crashing.

- **A2c — `manifest-url`: filter + fetch markdown** · Dev A · M
  - Deps: A2b
  - Done when: filters entries by `parent` slug, fetches each `markdown_source` URL, handles 404/500 gracefully, returns `{entry, content}` pairs.

- **A2d — `manifest-url`: parse markdown → Doc** · Dev A · M
  - Deps: A2c
  - Done when: frontmatter via `gray-matter`, code blocks/links counted via `remark`. Returns complete `Doc[]`. Unit test against a checked-in mini-manifest fixture.

- **A3a — `git-clone` CodeSource** · Dev A · M
  - Deps: A1
  - Done when: `src/adapters/code-source/git-clone.ts` shallow-clones a repo, exposes `readFile(path, startLine?, endLine?)` and `listDir(path)`. Cleans up old clones.

- **A3b — `git-clone`: SHA caching** · Dev A · S
  - Deps: A3a
  - Done when: if cache exists and HEAD SHA matches ref, skips clone. Reruns are <1s.

- **A4 — `manual-map` Mapper** · Dev A · M
  - Deps: A1, S1
  - Done when: reads `mappings/<project>.json`, validates against `MappingSchema`, returns `CodeTiers` by slug. Throws helpful error when a requested slug is missing.

- **A4c — `bootstrap-mapping` script** · Dev A · L
  - Deps: A2d, A3a
  - Done when: `npx tsx scripts/bootstrap-mapping.ts <slug>` prints a proposed `{slug: CodeTiers}` JSON snippet. Uses Claude with the doc content + repo file tree. Human reviews, pastes into `mappings/*.json`.

- **A5 — Seed mapping for ~10 slugs** · Dev A · M
  - Deps: A4c
  - Done when: `mappings/gutenberg-block-api.json` has entries for ~10 Block API Reference slugs. Caps: ≤3 primary, ≤5 secondary, ≤8 context each. Committed.

- **A6a — Validator: Validator interface** · Dev A · S
  - Deps: A1, S2
  - Done when: `src/adapters/validator/types.ts` defines `Validator.validate(doc, context) → Issue[]`.

- **A6b — Validator: context assembler** · Dev A · M
  - Deps: A3a, A4, S2
  - Done when: `assembleContext(doc, mapping, budget) → {files, stats}`. Starts with primary+secondary, adds context until budget hit, records what was dropped.

- **A6c — Validator: Pass 1 (system prompt + tool use)** · Dev A · L
  - Deps: A6a, A6b
  - Done when: Claude call with cached system prompt emits `Issue[]` via tool-use matching `IssueSchema`. Unit-tested against fixture doc+code.

- **A6d — Validator: verbatim evidence check** · Dev A · S
  - Deps: A6c
  - Done when: issues whose `evidence.codeSays` isn't literally found in the referenced file are silently rejected. Counter logged.

- **A6e — Validator: Pass 2 (`fetch_code` retrieve-on-demand)** · Dev A · L
  - Deps: A6c, A3a
  - Done when: for each candidate issue, Claude can call `fetch_code(path, startLine?, endLine?)` to verify. Issues with `confidence < 0.7` dropped. **This is the issue to cut at the Day-3 decision point if it's not stable.**

- **A7 — Pipeline orchestrator** · Dev A · M
  - Deps: A2d, A3a, A4, A6c (Pass 1 at minimum)
  - Done when: `runPipeline(config)` wires DocSource → CodeSource → Mapper → Validator, analyzes docs with `p-limit(3)`, emits `RunResults` that validates against the schema.

- **A8 — Health scorer** · Dev A · S
  - Deps: S2
  - Done when: `scoreDoc(issues) → {healthScore, status}` implemented. Formula and thresholds per the spec. Overall average computed in the orchestrator.

- **A9a — Test fixture: drifted doc** · Dev A · M
  - Deps: A6c
  - Done when: `tests/fixtures/drifted/` has a hand-tampered doc+code pair. Validator reports ≥1 `critical` issue.

- **A9b — Test fixture: clean doc** · Dev A · S
  - Deps: A6c
  - Done when: `tests/fixtures/clean/` has a known-accurate doc+code pair. Validator reports 0 issues (after confidence filter).

### Dev B — Presentation

- **B1 — Config loader** · Dev B · S
  - Deps: S3
  - Done when: `loadConfig(path)` reads YAML, validates via `ConfigSchema`, returns typed `Config`.

- **B2a — CLI skeleton** · Dev B · S
  - Deps: S0
  - Done when: `src/cli.ts` with flags `--config`, `--output`, `--only <slug>`, `--dry-run`. `npm run analyze -- --help` prints usage.

- **B2b — CLI wired to pipeline** · Dev B · S
  - Deps: B2a, B1, S4
  - Done when: `npm run analyze -- --config config/gutenberg-block-api.yml --output ./out` writes `out/results.json` + a log file. Works with stub `runPipeline` returning empty results.

- **B3a — Dashboard: reader + generator entry** · Dev B · S
  - Deps: S6
  - Done when: `src/dashboard/generate.ts` reads + validates a `results.json`, exposes `generate(results, outDir)` that writes to disk.

- **B3b — Dashboard: index.html** · Dev B · M
  - Deps: B3a, B4
  - Done when: `out/index.html` shows overall health %, totals (critical/major/minor), and the tree view grouped by parent slug with per-folder aggregated score. Tailwind CDN, one-file HTML.

- **B3c — Dashboard: doc-detail.html** · Dev B · L
  - Deps: B3a
  - Done when: `out/doc/<slug>.html` shows title, health score, metrics, issues (severity, confidence, quoted evidence, proposed action), positives, related-code list, source URL link. Generated one per doc from `examples/mock-results.json`.

- **B3d — Dashboard: folder.html** · Dev B · M
  - Deps: B3a, B4
  - Done when: `out/folder/<parent>.html` shows a section's rollup and its docs. Reached via links in `index.html`.

- **B4 — Tree builder** · Dev B · M
  - Deps: S2
  - Done when: `buildTree(docs) → TreeNode[]` groups by parent slug, aggregates health (doc-count weighted). Handles ≥200 docs cleanly.

- **B6 — `publish.sh`** · Dev B · S
  - Deps: B3b, B3c, B3d
  - Done when: `scripts/publish.sh` (or `npm run publish`) copies `out/` to a `gh-pages` worktree and pushes. GitHub Pages serves the result.

- **B7 — README** · Dev B · M
  - Deps: B2b (so examples are real)
  - Done when: install steps, API key setup, CLI usage, sample output, cost expectation, dashboard screenshot. Enough for your partner's partner to reproduce.

### Phase 0 Validation Gate (Day 3)

- **V0 — Run on 3 docs, measure P/R** · Dev A + manual review · M
  - Deps: A5, A7 (with at least Pass 1 wired)
  - Done when: `docs/phase-0-results.md` (or PR comment) records precision, recall, clean-doc false positives. Day-3 decision documented: keep Pass 2, cut Pass 2, or abort.

### Phase 2 — After PoC is validated (committed)

- **P2-1** GitHub Action workflow: manual dispatch + weekly cron, uploads `results.json` as artifact, auto-deploys dashboard to GitHub Pages.
- **P2-2** `wordpress-rest` DocSource: pagination, HTML→markdown normalization, Application Password auth. Produces a manifest-shaped list from a live WP site. Demoed against developer.wordpress.org or a WooCommerce docs page.
- **P2-3** `fs-walk` DocSource: generates a manifest for markdown repos that don't publish one (WooCommerce docs repo, etc.).
- **P2-4** Dashboard: show source type per doc ("markdown" / "wordpress") and deep-link to the edit URL in WP so authors can fix directly.
- **P2-5** `a8c-context` DocSource variant: use the context-a8c MCP for A8C-internal sites (Fieldguide, P2s) that aren't publicly reachable.

### Stretch — nice to have

- **S3** Change Detector: diffs last-analyzed commit SHA vs current, queues only changed docs + docs whose mapped code changed. Biggest cost lever per the blog post.
- **S5** `symbol-search` Mapper (heuristic doc→code resolution to scale beyond hand-maintained mappings).
- **S6** Trend tracking across runs (store history, show trend line in dashboard).
- **S7** Slug-rename lint: warn when `mapping.json` keys aren't in the current manifest.
- **S8** Round-trip: open a GitHub PR on the markdown source (or draft a WP post update via REST) for issues above a confidence threshold.

## Phase 0 Validation (Day 3 — Decision Point)

Gate everything else behind this check. It's also the go/no-go for two-pass validation.

1. Pick 3 of the ~10 docs — ideally **one known-drifted, one known-clean, one uncertain** so we can measure both precision and recall.
2. Manually read each doc + its mapped code. Write down (a) the real drift issues a human reviewer would flag, and (b) that the clean doc is actually clean.
3. Run the validator on those 3 docs.
4. **Measure:**
   - **Precision** — of issues reported, how many are real? Target ≥80%.
   - **Recall** — of the human-found issues, how many did the tool surface? Target ≥70%.
   - **Clean-doc false positives** — on the clean doc, tool must report 0 issues (or all <0.7 confidence, which we filter). This is the single most important check: a tool that fabricates issues on good docs is worse than useless.
5. **Day-3 decision:**
   - **Go (precision ≥80% + clean doc shows 0 issues):** keep two-pass validation, proceed to full 10-doc run.
   - **No-go (precision <80% OR clean doc shows false positives):** iterate the system prompt for up to half a day. If still failing, **cut Pass 2**, tighten `confidence ≥ 0.8`, rely on the runtime verbatim-evidence check, and ship the Pass-1-only version. Dashboard still demos.
   - **Fail (still bad after cuts):** honest conversation about whether the PoC is viable — better to surface that at day 3 than day 7.

## Verification (end-to-end)

1. `npm install`
2. `export ANTHROPIC_API_KEY=...`
3. `npm run analyze -- --config config/gutenberg-block-api.yml --output ./out`
4. `open out/index.html` — verify overall health %, tree view renders all ~10 docs grouped under `block-api`, clicking a doc opens a detail page with issues, evidence, proposed actions, and a link to the source URL.
5. Manual precision check on 10 random issues: confirm they're real drift, not hallucination.
6. Clean-doc check: at least one doc shows `healthy` status with 0 issues (or proves the tool can recognize health).
7. Cost check: ≤$1 for the full 10-doc run. Flag if it exceeds $5.
8. `npm run publish` (or `scripts/publish.sh`) pushes `out/` to the `gh-pages` branch; verify the dashboard loads at `https://juanma-wp.github.io/wp-docs-health-monitor/`.

## Risks and Mitigations

- **AI hallucination / false positives** → two-pass validation + quoted evidence + `confidence ≥ 0.7` + **runtime verbatim check** (`evidence.codeSays` must literally appear in the referenced file). Clean-doc fixture in tests catches drift in the validator itself.
- **Two-pass validation is complex and time-hungry** → Day-3 decision point with a Pass-1-only fallback that still demos.
- **Premature abstraction** → adapter interfaces designed broadly, implemented narrowly. Registry documents extension surface without dead code.
- **Dev A / Dev B divergence** → Day-1 schema handshake + mock fixture; Dev B never blocks on Dev A.
- **Mapping accuracy for ~10 docs** → hand-curated via bootstrap script, checked into git. Mapping errors are trivial to fix.
- **Slug renames breaking mappings silently** → deferred. A lint step (S7) handles it later when it bites.
- **Timeline pressure (1 week)** → GitHub Action, `symbol-search` mapper, change detector all deferred to Phase 2. Core shippable demo is CLI + local dashboard + manual `gh-pages` push.
- **Cost runaway** → 50k input-token cap per doc + prompt caching. Expected total per 10-doc run: ≤$1. Alert threshold: $5. Measured at the end of each run, logged to console.

## Out of Scope for PoC (Week 1)

- GitHub Action workflow and weekly cron — deferred to Phase 2 (P2-1).
- `wordpress-rest` / `fs-walk` / `a8c-context` DocSources — interfaces defined, implementations deferred.
- `symbol-search`, `hybrid`, `embedding-retrieval` mappers — interface-compatible, implementations deferred.
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
