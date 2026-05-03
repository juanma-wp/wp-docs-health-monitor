# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm test` — run the Vitest suite once.
- `npm run test:watch` — Vitest in watch mode.
- `npx vitest run <path>` — run a single test file (e.g. `npx vitest run src/adapters/doc-source/__tests__/manifest-url.test.ts`). Add `-t "<name>"` to match a single `it`/`describe`.
- `npm run typecheck` — `tsc --noEmit`. CI-equivalent correctness check; run before pushing.
- `npm run gen:schema` — regenerates `examples/results.schema.json` from `src/types/results.ts` (Zod → JSON Schema). Run after changing any of the `*Schema` exports in `src/types/`.
- `npx tsx scripts/verify-ingestion.ts` — smoke-tests the full ingestion pipeline end-to-end against `config/gutenberg-block-api.json` (clones Gutenberg, fetches ~10 docs). Network-dependent; produces clone under `tmp/`.

Node 20+ required. ESM throughout (`"type": "module"`); intra-package imports use `.js` suffixes even for `.ts` sources.

## Architecture

Read these in order when orienting: `PLAN.md` (phases + decisions) → `docs/prd.md` (requirements + user stories) → `docs/architecture.md` (why decisions were made, including the locked-contract / adapter-pattern rationale) → `AGENTS.md` (role-scoped reviewing/implementation, including hard boundaries) → `src/pipeline.ts` (the wire-up).

### Project stance — non-obvious things you can't infer from the code

These are conventions and invariants that surprise readers and aren't carried by the code alone. Everything else (contract layout, adapter wiring, current adapter list, role boundaries) lives in `docs/architecture.md` and `AGENTS.md` — go there, don't restate it here.

- **Pipeline error-handling stance.** `runPipeline` always produces a valid `RunResults`. Failed fetches and mapping errors become per-doc `diagnostics` entries with `status: 'critical'` — never uncaught exceptions. Tests pin this: `src/types/__tests__/schemas.test.ts` (`runPipeline` block) and `src/adapters/doc-source/__tests__/manifest-url.test.ts` (error-handling block).
- **`src/types/` is locked.** Zod schemas are the source of truth; TypeScript types are derived. `examples/mock-results.json` must round-trip `RunResultsSchema.parse()`. `examples/results.schema.json` is generated — never edit by hand; re-run `npm run gen:schema`.
- **`GitCloneSource.readFile(path, startLine?, endLine?)` only slices when both bounds are provided.** Partial bounds silently return the full file. Pinned by tests.
- **Metrics (`wordCount`, `codeExampleCount`, `linkCount`) are computed at ingest**, not at validation time. The validator receives pre-parsed `Doc` objects.
- **`deriveSourceUrl` in `manifest-url.ts` has two branches** (URL-base transform vs. GitHub UI fallback). The transform requires a `/docs/` segment and falls through to the fallback if absent. Both covered by tests.

## Repository layout — commentary-only entries

(Most directories are self-describing. Listed here are the ones with non-obvious conventions.)

- `src/types/` — locked contracts (see above).
- `mappings/test.json` — intentionally empty `{}`, used by unit tests.
- `examples/mock-results.json` — canonical `RunResults` fixture; round-trips `RunResultsSchema`.
- `examples/results.schema.json` — generated artifact; never hand-edit.
- `scripts/bootstrap-mapping.ts` — dev-time accelerator for generating mappings via Claude.
- `scripts/verify-ingestion.ts` — end-to-end smoke test of the ingestion pipeline.
- `scripts/gen-schema.ts` — regenerates `examples/results.schema.json` from Zod.

## Validator pipeline discipline

This project is a **generic** docs-vs-code drift validator. Each site plugs in its own config, mappings, and per-site prompt extension (`config.validator.promptExtension`, wired into `SYSTEM_PROMPT` at `claude.ts:313-315`). The pipeline must remain useful for any docs/codebase pair.

That generality dictates how the validator stack (`src/adapters/validator/`, `src/extractors/`, `SYSTEM_PROMPT`) evolves.

### Where a new rule belongs — layered home, broadest first

When you discover a class of false positive or missed bug, the rule needs a home. Walk these layers in order and pick the **broadest** one the rule honestly fits — not the narrowest. Adding to a site extension is a positive choice, not a fallback.

1. **Common `SYSTEM_PROMPT`** (`src/adapters/validator/prompts/system.md`) — every site benefits. Rules that apply to *every* docs/codebase pair regardless of language, framework, or corpus: the impact filter, severity rubric, evidence rules, claim-type-keyed authority guidance, drift-type definitions and their generic refinements, "verify before reporting" rules (cross-section check, short-circuit evaluation, direct contradiction), prose-quote constraints. If a rule names a specific identifier, file convention, package, framework, language, or version, it does NOT belong here.

2. **Language pack** (`prompts/lang-<lang>.md`, e.g. `lang-jsts.md`, `lang-php.md`) — any site using that language benefits. Conventions that apply to *any* corpus written in a particular ecosystem: JS/TS test path globs, JSDoc/PHPDoc tag conventions, fallback-expression idioms (`value || X`, `value ?? X`), `*.d.ts` as surface contract, PHP `_doing_it_wrong()` semantics. A rule that would be true for *any* JS/TS (or PHP, or Python, …) corpus belongs here, not in a site extension. Sites declare which packs apply via `validator.languagePacks` in config.

3. **Config field + auto-injection** — declarative knowledge that varies across sites but should not be prose. If you find yourself writing prose like "in this corpus, identifiers starting with X are internal" or "schemas at path Y are the documented contract," that is a config field, not a prompt rule. Existing examples: `codeSources`. Planned: `internalPrefixes`, `documentedSchemas`. The assembler injects the rule text from the structured config at prompt-build time.

4. **Site-specific extension** (`prompts/<site>.md`) — genuinely one-corpus-only knowledge. Single-symbol carve-outs (e.g. `core/block` reusable category), per-corpus authority overrides not expressible as config flags, and the TP/FP example list earned from real reviews on this corpus.

**Default discipline**: before writing to a site extension, articulate in one sentence why the rule cannot live in layers 1, 2, or 3. If you cannot, the rule belongs higher up. The same applies in reverse: if you find a rule sitting in a site extension that fits a broader layer, promote it.

When the same rule turns up across multiple sites' extensions, that is a signal to promote up the stack. But the more common failure mode is the opposite — a rule was written in a site extension when it should have lived elsewhere. Be willing to relocate; the layers are not write-once.

#### Examples (calibration)

- "Type-label imprecision is not drift" — **common** (every doc/code pair has type prose vs concrete types).
- "Tests under `__tests__/` and `*.test.{js,ts}` are corroborating evidence" — **language pack** (true for any JS/TS corpus).
- "Identifiers starting with `__experimental` are internal" — **config** (`internalPrefixes: [...]`); the *rule* "internal-prefixed names are not drift" is **common**.
- "The `core/block` block uses the `reusable` category" — **site extension** (single-symbol carve-out, no broader pattern).
- "`schemas/json/block.json` IS the documented contract" — **site extension** (a per-corpus declaration; the *mechanism* of schema-authority elevation is **config** + auto-injection).

### Spend on context and model, not on guards

Cost is not the primary constraint. A single accurate drift finding on a high-traffic doc page is worth far more than the model spend that surfaced it. Optimise accordingly:

- **Spend on context.** When the model misses or mis-classifies an issue, the first question is "did it have what it needed?" — better extractors, more authoritative source files, line-range hints, real test files, more of the right repos in `codeSources`. Not "what filter can I add to compensate?"
- **Spend on prompt clarity.** A longer, coherent prompt with examples is preferred over a terse prompt plus a regex post-filter. There is no hard token ceiling on `SYSTEM_PROMPT`; coherence and consistency are the constraints, not size.
- **Spend on model quality.** Use the strongest available pass-1 and pass-2 models. Models keep getting better; this stack should ride that curve, not work around it with heuristics.
- **Heuristic post-processing layers (regex filters, weak-suggestion detectors, confidence thresholds, retry loops, dedup keys) are temporary scaffolding.** Each one is a load-bearing admission that the model's output isn't trusted. When you add such a layer, document what would let it be removed: a prompt change, a context change, a stronger model.

### Diagnose before defending

When the model returns an unexpected shape (malformed evidence, truncated tool input, missing fields, degenerate output), capture the actual response *before* adding any guard.

The seam: setting `DUMP_PASS1=1` in the environment makes `runPass1` write the raw `report_findings` input to `/tmp/wp-docs-pass1-dump/pass1-<ts>.json`. Targeted invocation:

```
DUMP_PASS1=1 npm run analyze -- --slug <slug> --config <config> --output ./out
```

(`ANTHROPIC_API_KEY` must be provided by the environment — by whatever mechanism the operator already uses for normal runs.)

A coding agent may or may not be able to run this directly, depending on how the operator provides credentials. If the agent cannot reach the API key (e.g. it lives in a credential vault that requires interactive auth), the agent should hand the exact command above to the operator, then read `/tmp/wp-docs-pass1-dump/pass1-<ts>.json` once the run completes. Operator-specific credential mechanics belong in `CLAUDE.local.md`, not here.

If the misbehavior is non-deterministic across runs, the cause is upstream — fix it there. A downstream guard added without diagnosis hides signal and creates the illusion of a fix.

### Comparison layers must tolerate authoring-format noise

Verbatim and substring checks (e.g. the post-Pass-1 `codeSays` / `docSays` verifier in `claude.ts`) must tolerate whitespace, line endings, comment-continuation characters, indent variations, and quote-style differences. Documentation rarely quotes source code character-for-character; the comparison layer must close that gap. If a check rejects legitimate findings, normalise the comparison — never tighten the prompt to avoid the case.

### Pipeline-change checklist

Every change to `src/adapters/validator/`, `SYSTEM_PROMPT`, or `src/extractors/` should answer in the PR description:

1. The bad shape that motivates the change, with a reproducer command and observed output.
2. **Where the rule lives, and why it can't live higher.** Walk the layers from "Where a new rule belongs": common, language pack, config field, site extension. Pick the broadest layer it honestly fits and state in one sentence why the next-broader layer doesn't fit. A new rule landing in a site extension must justify why it isn't config-derivable or language-pack material.
3. If it adds a heuristic post-processing layer: what change (prompt, context, or model) would later let it be removed.
4. The expected outcome, expressed as something measurable through the `runPass1Only` experiment seam (`claude.ts:507`).
