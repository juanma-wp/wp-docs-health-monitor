# Second-site experiment — the test we have not yet run

**Status**: planned, not started. 2026-05-03.
**Pairs with**: [docs/next-steps.md](./next-steps.md) (where this is logged as Priority 5) and [docs/week-3.md](./week-3.md) (the prior strategic assessment, which this revises).

**Dependency**: [PR #60](https://github.com/juanma-wp/wp-docs-health-monitor/pull/60) (AI-free auto-mapping via `scripts/auto-map.ts`) should be merged before this experiment starts. Constructing five theme-json mappings by hand or via `bootstrap-mapping.ts` (which needs API calls) is the most expensive part of setup; auto-map collapses it to one shell command per doc with no API spend. Order of operations: land Priority 2 PR → review and merge PR #60 → start this experiment.

---

## Why this doc exists

After three weeks of prompt iteration on Gutenberg, a sharper question than "how do we surface more findings" has surfaced: **are we building a generic docs-vs-code drift validator, or a Gutenberg-specific tool dressed in generic clothing?**

The system's architecture (config + mappings + per-site prompt extension + common prompt) supports generality on paper. But every "improvement" cycle so far has been: observe Gutenberg drops → diagnose Gutenberg patterns → tune the common prompt or extension. That's a strong overfitting risk. We have not validated the generality claim against any non-Gutenberg corpus.

This doc captures (a) what's actually generic vs. corpus-tuned, (b) why the second-site test is now the most valuable next move, and (c) the experimental design for that test.

---

## What's actually generic (and what's not)

**Genuinely generic — attacks LLM-driven validation problems, not corpus problems.** These rules would apply equally to a Django docs validator, a Stripe API docs validator, or a TypeScript library docs validator:

- Verbatim normalization tolerances (whitespace, markdown link stripping, bullet-marker stripping)
- Evidence-slot shape rules (`docSays` / `codeSays` are not the answer; empty is acceptable when no verifiable text exists)
- Single-contiguous-span enforcement (no ellipsis, no concatenation across non-adjacent passages)
- Direct-contradiction requirement
- Short-circuit-semantics check
- Cross-section check (search the entire doc before reporting absence)
- Impact filter ("would copying this break the developer's code?")

**Corpus-tuned — earned from real reviews on Gutenberg, lives in `prompts/gutenberg-block-api.md`:**

- TP / FP example list
- Known internal / reserved identifiers (`__experimental`, `__unstable`, etc.)
- Source-authority elevations (e.g. `schemas/json/block.json` IS the documented contract)
- Repo-list scope and per-repo authority overrides
- Evidence-shape calibration for the recurring TPs (just added in PR #64)

The Gutenberg extension is at 75 lines today. The hypothesis the second-site test will probe: a new corpus needs an *extension of similar shape and size*, not a new "common" prompt.

---

## What we don't know

**The expensive question:** how much extension does a new corpus actually need to produce useful signal?

Per [docs/next-steps.md](./next-steps.md) Priority 5 acceptance:

- **Extension stays < 40 lines** → architecture is sound, the common prompt is doing most of the work.
- **Extension lands around Gutenberg's ~75 lines** → mixed signal; depends what those lines contain (TP/FP lists are fine; structural overrides are concerning).
- **Extension balloons or the common prompt produces garbage** → "common" prompt is corpus-specific in disguise; revise.

We don't have a reading on this. Three weeks of work has been on one data point.

---

## The decision

Skip Priorities 3 (doc-fix patches) and 4 (history-aware reporting) from `docs/next-steps.md`. Go straight to Priority 5.

The information value of a second-site test is currently higher than the marginal value of doc-fix patches or history-aware reporting. Until we know whether the architecture generalizes, those features are layering UX on top of an unvalidated foundation.

If the test fails (extension balloons, common prompt produces garbage, FPs dominate), the honest pivot is:

- The project is high-value for **WordPress documentation at scale** (Gutenberg + theme.json + REST handbook is a real niche, not a consolation prize).
- The "generic docs validator" claim becomes a stretch goal, not a foundational claim.

That's a valid pivot, not a project failure. But we need the data before deciding.

---

## Experimental design

**Picked corpus: Theme.json reference** (parent slug `theme-json-reference` in the Gutenberg manifest).

Why this corpus first:

- **Same docs source, same tooling stack, same repo already cloned.** Lowest setup cost; we can be running within an hour.
- **Different content shape.** Block API docs are prose-heavy with embedded code examples. Theme.json reference is schema-heavy with prose annotations. Tests whether the validator handles the schema-as-source-of-truth case as well as the prose-vs-code case.
- **Smaller corpus.** 5 docs (`theme-json-living`, `theme-json-v1`, `theme-json-v2`, `theme-json-migrations`, `styles-versions`) vs. block-api's 16. Estimated cost ~$1.50–2 per run vs. ~$5 — ~3× more iteration per dollar.
- **Real demand.** Theme.json drift is a genuine pain point for theme authors. A working result here has standalone value regardless of the generality verdict.

### Artifacts to create

1. **`config/theme-json-reference.json`** — copy structure from `config/gutenberg-block-api.json`. Same `gutenberg` and `wordpress-develop` repos. `parentSlug: "theme-json-reference"`. New `mappingPath` and `systemPromptExtension`.

2. **`mappings/theme-json-reference.json`** — five entries, one per doc. Generate with `scripts/auto-map.ts` from PR #60 once that PR lands:
   ```
   tsx scripts/auto-map.ts theme-json-living --config config/theme-json-reference.json --write
   tsx scripts/auto-map.ts theme-json-v1 --config config/theme-json-reference.json --write
   tsx scripts/auto-map.ts theme-json-v2 --config config/theme-json-reference.json --write
   tsx scripts/auto-map.ts theme-json-migrations --config config/theme-json-reference.json --write
   tsx scripts/auto-map.ts styles-versions --config config/theme-json-reference.json --write
   ```
   Inspect the generated tiers and hand-tune only when the symbol index missed something obvious. Each doc should map to:
   - **Primary**: `gutenberg/schemas/json/theme.json` (the canonical contract).
   - **Primary**: implementation files — `gutenberg/lib/class-wp-theme-json.php` and/or `wordpress-develop/src/wp-includes/class-wp-theme-json.php`.
   - **Secondary**: tests, resolver, migration code as relevant.
   - Fall back to `scripts/bootstrap-mapping.ts` only if PR #60's auto-map produces unusably thin coverage.

3. **`prompts/theme-json-reference.md`** — **start with at most 5 lines. Empty is preferred.** Add only when forced by a specific FP that cannot be addressed in the common prompt. Every addition gets a one-line justification: "added because [specific FP]; would belong in [layer X] if [hypothetical]".

### Run protocol

1. **Run 1**: empty extension. Capture results, dumps, and verbatim drops. Note what surfaces, what's noise, what's missed.
2. **Triage** every FP and every drop. Categorize:
   - **Common-prompt failure** (the rule should fire for any corpus but didn't) → fix in `system.md`. This is the most valuable signal.
   - **Language-pack territory** (true for any JS/TS or PHP corpus) → note for future language pack; do not put in extension.
   - **Genuinely corpus-specific** (only theme.json has this) → minimal extension entry with justification.
3. **Run 2** with the minimal extension. Compare deltas.
4. **Stop iterating** at run 4 or $30 spent, whichever comes first. Assess.

### Acceptance criteria

- ≥ 1 high-confidence (≥ 0.92) TP confirmed real on human review.
- Extension stays < 40 lines.
- ≤ 30 % FP rate on final findings (3 of 10 or fewer are wrong on review).

If all three pass → architecture validated for one more corpus. The "generic" claim has support beyond Gutenberg.

If any fail → strategic recalibration per § The decision. Specifically:
- TP < 1: the common prompt isn't producing usable signal cold; investigate whether the issue is extractor-driven or prompt-driven.
- Extension > 40 lines: layer-1 rules are too thin; promote up.
- FP rate > 30 %: the model is over-reporting on this corpus shape; either tighten the impact filter or accept that schema-heavy corpora need different priors.

### Cost cap

$30 hard cap (≈ 15 runs at theme.json's expected ~$2/run). If we're spending more than that to land a single signal, the cost economics are themselves a finding worth recording.

---

## What success and failure each tell us

**If the experiment succeeds:**
- Common-prompt rules survive contact with a different corpus shape (schema-heavy vs prose-heavy). The architecture is real, not theatre.
- Move to Priority 3 (doc-fix patches) with confidence — the validator earns the right to generate fixes.
- Theme.json reference becomes a second supported corpus, not just a test fixture.

**If the experiment fails:**
- The pivot to "WP docs health monitor for Gutenberg + theme.json + REST handbook" is the honest reframe. Not a downgrade — it's a focused product.
- Priority 4 (history-aware reporting) becomes more valuable, not less, because per-corpus polish matters more than breadth.
- Architectural work in [docs/architecture.md](./architecture.md) gets a "limited generality" caveat that future contributors should see before assuming portability.
- Priority 3 (doc-fix patches) still makes sense, but scoped to what we know works.

Both outcomes are useful. The point of running the experiment is to know.

---

## Open questions to resolve before run 1

1. **Mapping construction**: PR #60 (`scripts/auto-map.ts`) is the preferred path — see § Artifacts to create. Question becomes: do we trust auto-map's output cold, or hand-review each doc's tiers before running the analyzer? Recommendation: hand-review on this first non-Gutenberg run because auto-map's behaviour on theme.json is itself unvalidated.
2. **Implementation file scope**: does theme.json processing live primarily in Gutenberg (`lib/class-wp-theme-json*.php`) or in WP core (`src/wp-includes/class-wp-theme-json*.php`)? Both? Establish authority order in the mapping.
3. **Schema authority elevation**: should `schemas/json/theme.json` be elevated to "documented contract" status the way block.json is in the Gutenberg extension? Likely yes — but that's a per-site config flag, not a prompt rule. (Note: per [CLAUDE.md](../CLAUDE.md), schema authority is layer 3 territory — a config field, not extension prose. May need to introduce that field if not already present.)
4. **Versioned docs**: theme-json-v1 and theme-json-v2 are *historical* references for older schema versions. The current code only implements V3. How do we tell the validator "for this doc, the canonical contract is the V1/V2 schema, not the current `theme.json`"? Decide whether to (a) skip historical docs, (b) point the mapping at git tags, or (c) accept that drift is inherent and report it as such.

---

## References

- Working plan: [docs/next-steps.md](./next-steps.md) — Priority 5 lives here.
- Strategic context: [docs/week-3.md](./week-3.md).
- Architectural rationale: [docs/architecture.md](./architecture.md).
- Layered home model: [CLAUDE.md](../CLAUDE.md) — what belongs in common vs. language pack vs. config vs. extension.
- Existing site config to template from: `config/gutenberg-block-api.json`, `mappings/gutenberg-block-api.json`, `prompts/gutenberg-block-api.md`.
- Theme.json schema: `tmp/gutenberg-trunk/schemas/json/theme.json` (in cloned repo).
- Theme.json doc set surfaced from `tmp/gutenberg-trunk/docs/manifest.json`: 5 entries under `parent=theme-json-reference`.
