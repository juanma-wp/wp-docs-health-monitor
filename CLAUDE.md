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

### Common prompt vs. site-specific prompt

When you discover a class of false positive or missed bug, the first question is *where the rule belongs*:

- **Site-specific prompt extension** (default home for new rules): examples, edge cases, authority overrides, naming conventions, framework-specific anti-patterns, concrete audit verdicts from one site. Anything that names a specific identifier, file, package, framework, language, or version belongs here.
- **Common `SYSTEM_PROMPT`** (high bar): only what generalises across *every* docs/codebase pair — the impact filter, severity rubric, evidence rules, the source-authority concept (without naming specific source kinds), output format. If a rule wouldn't apply equally well to a validator built on any other docs and codebase, it does not belong in the common gate.

Default when uncertain: site-specific extension. Re-promote to the common prompt only after the same rule has proven necessary across two or more sites.

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
2. Whether the rule belongs in the **common** prompt or a **site-specific** extension, and why.
3. If it adds a heuristic post-processing layer: what change (prompt, context, or model) would later let it be removed.
4. The expected outcome, expressed as something measurable through the `runPass1Only` experiment seam (`claude.ts:507`).
