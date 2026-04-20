# Architecture

Back to [PLAN.md](../PLAN.md) · For the issue backlog see [backlog.md](./backlog.md).

Technical reference: how the pieces fit, the schemas they exchange, and the file layout. Changes as we learn; keep in sync with `src/types/*`.

---

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
├── README.md
└── docs/
    ├── architecture.md              # this file
    └── backlog.md
```

No `packages/` directory, no monorepo, no GitHub Action workflow in Week 1. All deferred to Phase 2.

---

## Tech Stack

- **Node.js 20 + TypeScript (strict).** Matches Gutenberg ecosystem, first-class Anthropic SDK, natural fit for `setup-node` in Actions later.
- **Anthropic SDK (`@anthropic-ai/sdk`)** with **prompt caching** for the system prompt + shared code context, and **tool use with JSON schema** for structured issue output. Two-pass validation: (1) find candidate issues with quoted evidence, (2) verify each with targeted code re-read. Model: **`claude-sonnet-4-6`** (cost/accuracy sweet spot; upgrade to `claude-opus-4-7` only if Sonnet misses real issues during Phase 0).
- **`simple-git`** for repo clones. **`gray-matter` + `remark`** for markdown parsing. **`zod`** for runtime schema validation on config + results.
- **Static HTML dashboard** — no framework. `index.html` + per-doc detail pages via templates (`eta` or plain template literals). Tailwind via CDN, no build step.
- **Single flat npm package** for Week 1. No monorepo, no pnpm workspaces.

When implementing, use the **context7 MCP** for up-to-date Anthropic SDK docs (prompt caching, tool use, streaming).

---

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

---

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

---

## Risks and Mitigations

- **AI hallucination / false positives** → two-pass validation + quoted evidence + `confidence ≥ 0.7` + **runtime verbatim check** (`evidence.codeSays` must literally appear in the referenced file). Clean-doc fixture in tests catches drift in the validator itself.
- **Two-pass validation is complex and time-hungry** → Day-3 decision point with a Pass-1-only fallback that still demos.
- **Premature abstraction** → adapter interfaces designed broadly, implemented narrowly. Registry documents extension surface without dead code.
- **Dev A / Dev B divergence** → Day-1 schema handshake + mock fixture; Dev B never blocks on Dev A.
- **Mapping accuracy for ~10 docs** → hand-curated via bootstrap script, checked into git. Mapping errors are trivial to fix.
- **Slug renames breaking mappings silently** → deferred. A lint step handles it later when it bites.
- **Timeline pressure (1 week)** → GitHub Action, `symbol-search` mapper, change detector all deferred to Phase 2. Core shippable demo is CLI + local dashboard + manual `gh-pages` push.
- **Cost runaway** → 50k input-token cap per doc + prompt caching. Expected total per 10-doc run: ≤$1. Alert threshold: $5. Measured at the end of each run, logged to console.
