# Architecture

Back to [PLAN.md](../PLAN.md) · For the issue backlog see [backlog.md](./backlog.md).

Technical reference: how the pieces fit, the schemas they exchange, and the file layout. Changes as we learn; keep in sync with `src/types/*`.

---

## Repo Layout

```
wp-docs-health-monitor/
├── src/
│   ├── adapters/                    # Track A
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
│   ├── pipeline.ts                  # Track A — wires adapters, emits RunResults
│   ├── health-scorer.ts             # Track A
│   ├── config/                      # Track B
│   │   ├── schema.ts
│   │   └── loader.ts
│   ├── dashboard/                   # Track B
│   │   ├── generate.ts               # RunResults → static HTML
│   │   ├── templates/
│   │   │   ├── index.html.eta
│   │   │   ├── doc-detail.html.eta
│   │   │   └── folder.html.eta
│   │   └── tree-builder.ts
│   ├── cli.ts                       # Track B — main entry
│   └── types/
│       ├── results.ts                # SHARED CONTRACT (zod)
│       └── mapping.ts                # MappingSchema + Manifest types
├── scripts/
│   └── bootstrap-mapping.ts         # LLM-assisted helper: slug → JSON candidate (Track A)
├── config/
│   └── gutenberg-block-api.yml      # PoC config
├── mappings/
│   └── gutenberg-block-api.json     # slug-keyed tiered map (Track A)
├── examples/
│   ├── mock-results.json            # for dashboard dev without running pipeline (Track B)
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

No `packages/` directory, no monorepo, no GitHub Action workflow in Week 1. The Action ships in Phase 2 (M7); monorepo stays out unless genuinely needed later.

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
  fingerprint: z.string(),                 // hash(slug + type + codeFile + normalize(issue)) — stable across runs
  severity: z.enum(["critical", "major", "minor"]),
  type: z.enum([
    "outdated-api", "missing-parameter", "incorrect-example",
    "broken-code-reference",                // doc references a code path that no longer exists
    "unclear-explanation", "deprecated-usage"
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
  positives: z.array(z.string()),
  diagnostics: z.array(z.string()).default([])             // honesty signal: "2 mapped files not found", "budget exhausted, 3 context files skipped"
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

Track B generates `examples/results.schema.json` from this and mocks a fixture, so dashboard work is unblocked immediately — doesn't have to wait for real pipeline output.

---

## Validator Behavior (Prompt Rules)

Decisions from design review, encoded into the validator's system prompt + runtime wrappers. The prompt is cached; these rules are part of what's cached.

### What counts as drift (report it)

- Type signature changes (param added/removed/renamed, return type changed).
- Default value changes.
- Deprecated APIs shown as current or recommended.
- Code examples that would throw if run against the current code.
- Function/hook/attribute names that no longer exist in the source.
- Required parameters documented as optional (or vice versa).

### What does not count as drift (skip silently)

- Teaching simplifications — docs intentionally omitting edge cases or error handling for clarity.
- Undocumented optional parameters (unless commonly used and absence would surprise a reader).
- Style, grammar, typos.
- Broken external links (a future phase).

### The judgment rule for partial coverage

> *If the documented behavior is a strict subset of actual behavior AND the omission doesn't mislead a reader following the doc, it's not drift. If omission would cause a reader's code to fail or be surprised, it is drift.*

### Severity calibration

- **Critical** — a reader's code would break or behave incorrectly if they followed the doc.
- **Major** — the doc is meaningfully misleading but a reader's code usually still works.
- **Minor** — technically wrong but most readers wouldn't be misled.

Health score: `100 − (critical*15 + major*7 + minor*2)`, clamped 0..100. Thresholds: ≥85 healthy, 60–84 needs-attention, <60 critical.

### Confidence thresholds

- **Two-pass validation** (Pass 1 + `fetch_code` Pass 2): discard issues with `confidence < 0.7`.
- **Pass-1-only fallback** (if Day-3 gate cuts Pass 2): tighten to `confidence < 0.8`.
- Low-confidence hunches (0.5–0.7) are silently dropped for PoC, not exposed as "needs review." Re-evaluate post-month.

### Evidence requirements

- Every `Issue.evidence.codeSays` must appear **verbatim** in the referenced code file. Runtime check rejects fabrications the prompt missed.
- Every `positive` must be evidence-backed too — not praise for its own sake. Cap of 3 positives per doc to force substantive picks.

### Suggestion quality bar

- **Critical / Major:** the suggestion must include specific proposed text — a rewritten sentence, a code snippet to replace the current example, or an explicit *"add parameter X of type Y here"* instruction. No hand-waving.
- **Minor:** a loose nudge is fine.
- Enforcement: if a critical/major issue comes back with a weak suggestion (e.g., *"update the wording"*), the validator retries once with a sharper prompt; if still weak, the issue is dropped. Trustworthiness > coverage.

### Scope

- **Per-doc only.** Cross-doc analysis (inter-doc link validity, inter-doc consistency) is out of scope for month-end — it's a separate batch pass over completed `RunResults`.
- `broken-code-reference` means *the doc → code pointer is broken*, not *doc → other doc*.

### Graceful degradation

When the validator can't fully assess a doc (stale mapping, missing file, budget exhausted), it **proceeds and records the caveat** in `DocResult.diagnostics`. No special `inconclusive` status — the dashboard shows the diagnostics next to the health score so readers know the assessment has caveats.

---

## Results Storage & History

Historical data from Week 1 onward — UI lands in Phase 2 (milestone M8). Shape:

```
gh-pages branch:
├── index.html                       # latest dashboard (points to latest run)
├── doc/<slug>.html                  # latest per-doc pages
├── folder/<parent>.html             # latest folder pages
└── data/
    ├── latest.json                  # symlink/pointer to newest runs/<runId>/results.json
    ├── runs/
    │   ├── 2026-04-22T06-00-00Z/
    │   │   └── results.json
    │   ├── 2026-04-29T06-00-00Z/
    │   │   └── results.json
    │   └── ...
    └── history.json                 # { runs: [{runId, timestamp, commitSha, overallHealth, totals}] }
```

**Issue fingerprinting** — each `Issue.fingerprint` is a stable hash of `slug + type + evidence.codeFile + normalize(issue.text)`. Same fingerprint across runs = same issue. Tolerant of doc line shifts (the normalized text ignores line numbers and minor whitespace). Enables "new this week" and "persistent for N runs" badges in M8.

**Retention** — no pruning for PoC. At ~50–200 KB per `results.json` × 52 weeks ≈ 2–10 MB per year on the `gh-pages` branch. Revisit if it bloats.

---

## Risks and Mitigations

- **AI hallucination / false positives** → two-pass validation + quoted evidence + `confidence ≥ 0.7` + **runtime verbatim check** (`evidence.codeSays` must literally appear in the referenced file). Clean-doc fixture in tests catches drift in the validator itself.
- **Two-pass validation is complex and time-hungry** → Day-3 decision point with a Pass-1-only fallback that still demos.
- **Premature abstraction** → adapter interfaces designed broadly, implemented narrowly. Registry documents extension surface without dead code.
- **Track A / Track B divergence** → Day-1 schema handshake + mock fixture; Track B never blocks on Track A.
- **Mapping accuracy for ~10 docs** → hand-curated via bootstrap script, checked into git. Mapping errors are trivial to fix.
- **Slug renames breaking mappings silently** → deferred. A lint step handles it later when it bites.
- **Timeline pressure (1 week)** → GitHub Action (M7) and `symbol-search` mapper (M1) deferred to Phase 2. Change detector further deferred to Stretch (S3). Core Week-1 shippable demo is CLI + local dashboard + manual `gh-pages` push via `publish.sh`.
- **Cost runaway** → 50k input-token cap per doc + prompt caching. Expected total per 10-doc run: ≤$1. Alert threshold: $5. Measured at the end of each run, logged to console.
