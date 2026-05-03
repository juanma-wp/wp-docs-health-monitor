# Week 3 — strategic assessment

**Date**: 2026-05-03
**Author**: Claude (assessment requested by JuanMa)
**Context**: After steps A–C of the prompt reframe, the quick-fix on `default-value` fallbacks, steps 1+2 of the per-site reduction (`ef5f3a5`), and task #15 (few-shot necessity test, verified load-bearing). Run baseline at `out/data/runs/20260503-100333` (1 critical · 3 major · 3 minor).

This is one assessment at a point in time, not authoritative direction. Opinions; revisit if the situation changes.

## The product hypothesis

The thing this project potentially does that nothing else does well: **catch real, actionable doc drift on big public docs corpora before users hit it.** Block API reference, theme.json reference, REST API docs, Gutenberg, WP core. These are read by hundreds of thousands of developers; every drifted page is a steady drip of wasted hours.

The four stable TPs the validator surfaces today are not toy findings. `isDefault` first-vs-last on `block-variations` is a *critical* "the doc tells you to do the opposite of what works." A maintainer who acts on that one finding has paid back the project's annual cost. The validator works.

## What stops it from being valuable today

Three things, in priority order:

### 1. Recall — too much real drift dies in the pipeline

Every run silently drops 4–7 Pass-1 candidates that are real findings. `apiVersion`, `filePath`, broken arrow function — *known* TPs that we listed in the few-shot examples — get killed by verbatim normalisation reformatting bullet markers or rejecting too-short quotes. The model is doing its job; the comparison layer is a sieve. CLAUDE.md already calls this out as a recall problem ("Comparison layers must tolerate authoring-format noise"), then we deferred fixing it. **This is the single biggest leak of value the project has.**

### 2. Trust — the marginal-confidence band is noisy

At conf 0.7–0.9 findings flap run-to-run. A maintainer who opens the dashboard twice and sees different findings stops trusting it. The dashboard is the easy part; precision-at-the-margin is the trust problem. Either fix Pass 2 categorisation (task #17) and tighten what survives, or visually demote marginal-conf findings on the dashboard so they don't compete for attention with the load-bearing TPs.

### 3. Actionability — findings stop at "report"

A maintainer reading `block-patterns: 'content' is documented as required, code says Optional` has to: (a) believe the finding, (b) figure out the right fix, (c) write a PR. Steps (a) and (b) the tool already supports. Step (c) it doesn't. The *natural* extension of this system is **producing the doc-fix as a diff/patch** — the model already has the code, the doc, and the contradiction. Generating a corrected doc passage from that is well within current model capabilities. Once the tool produces a reviewable PR, the value capture changes shape entirely: maintainers go from "I should look at this dashboard" to "I should review these doc PRs."

## What to invest in next, ranked

1. **Verbatim recall** (task #16). ~30 lines of code, recovers 3+ TPs per run, immediately visible. Highest leverage thing on the board.

2. **Doc-fix patch generation.** Take a confirmed finding, produce the corrected doc text (or a unified diff). This is where the project crosses from "interesting tool" to "actually used." It is also where the cost story flips: a $5 run that produces 3 mergeable doc PRs is a bargain.

3. **History-aware reporting.** The `history.json` infrastructure exists; verify it is actually being used. A maintainer who sees "this finding appeared today" or "this has been stable for 3 weeks" treats the dashboard differently than one looking at a fresh snapshot. Drift tracking *is* the value, not just drift detection.

4. **Second site — but only after #1–3.** Validating generality matters, but it is an architectural concern. Use #1–3 to make Gutenberg findings genuinely valuable first; *then* prove the abstraction by adding a second site. Adding a second site too early means optimising abstractions against a moving target.

## What to push back on

Continuing along the current queue (config auto-injection, language packs, etc.) is **architectural housekeeping for a future that has not arrived**. The current Gutenberg extension at 67 lines is already cheap enough. Going from 67 to 25 does not unlock the second site; *having a second site* unlocks the second site. The architectural work should come *with* a real second-site validation, not before it.

Similarly, polishing the dashboard adds nothing the JSON output does not already give. The reason "the dashboard is easy" is because the underlying data is already good — and what makes it good is the pipeline, not the rendering. Spend the cycles on the pipeline.

## One-paragraph version

Stop optimising the architecture; start eliminating signal loss. Fix verbatim recall, turn findings into reviewable doc PRs, light up history-over-time, then bring in a second site to prove the bones. Everything else is yak shaving until those four are done.

## Open questions for next review

- Is `history.json` being written and surfaced? When was last review of the dashboard with a maintainer's eyes?
- What is the operator's concrete timeline for site #2? That single answer reorders everything in the "What to invest in" list.
- Cost: $5/run × 16 docs. A real WP corpus is hundreds of pages. At what corpus size and run cadence does the cost story break, and is doc-fix patch generation the lever that justifies it?
