# Next steps — working plan

**Pairs with**: [second-site-experiment.md](./second-site-experiment.md) (the proposed pivot — Priorities 3 and 4 are deferred until Priority 5's generality test runs).
**Status snapshot**: 2026-05-03 PM. [PR #62](https://github.com/juanma-wp/wp-docs-health-monitor/pull/62) (verbatim recall strategies) is open at time of writing — held back deliberately until Priority 2 validates the direction (see Priority 1 § Outcome and Priority 2). Latest run on the PR #62 branch: `out/data/runs/20260503-202431` — 1 critical, 3 major, 0 minor, health 96. Earlier same-day baseline (main): `out/data/runs/20260503-100333` — 1 critical, 3 major, 3 minor, health 96. Steps A–C of the prompt reframe + steps 1+2 of the per-site reduction are merged. Few-shot examples verified load-bearing (`out/data/runs/20260503-095032`). Architectural work (task #14, language packs) parked.

This doc is a **working plan**, not a contract. Update as reality shifts. Each section is sized to be picked up cold by a future session.

---

## How to use this doc

1. Pick whichever priority section matches the time and energy you have.
2. Read the **Why** to confirm the priority still applies (re-check against `out/data/runs/<latest>` if it's been more than a week).
3. The **Start here** section names the file/line/run you should look at first — open that, don't open everything.
4. **Acceptance** tells you when to stop. Don't over-shoot.
5. When something doesn't fit your understanding, update this doc rather than working around it.

---

## Direction at a glance

In order:

1. **Verbatim recall** (task #16) — strategies in PR #62 (open) but acceptance criterion was off-target. Whether to merge depends on Priority 2's outcome (see § Outcome).
2. **Evidence-shape rules in common prompt** — fix the dominant remaining failure mode: the model puts the *answer* in `docSays`/`codeSays` slots instead of verifiable doc/code text. Surfaced by Priority 1 work.
3. **Second site** (was Priority 5 — promoted) — validate the architecture by running on a non-Gutenberg-block-API corpus. Theme.json reference picked. See [second-site-experiment.md](./second-site-experiment.md) for full design and rationale. **This is the next-actionable priority** once Priority 2's PR lands.
4. *(Deferred)* **Doc-fix patch generation** — make findings actionable as PRs. Was Priority 3; deferred until Priority 3's generality test resolves.
5. *(Deferred)* **History-aware reporting** — make the dashboard a trend tool. Was Priority 4; deferred for the same reason.

Rationale for the reorder: three weeks of work has been one corpus. The information value of running on a second corpus is currently higher than the marginal value of features layered on top of an unvalidated foundation. Deferred items (4, 5) are not cancelled — they wait until we know whether the architecture generalises.

Until 2–3 land, do not invest in language packs, config auto-injection (task #14), or further prompt cleanup. The Gutenberg extension at 75 lines is cheap enough.

---

## Priority 1 — Verbatim recall (task #16) — scaffolding shipped, acceptance unmet

**Status**: [PR #62](https://github.com/juanma-wp/wp-docs-health-monitor/pull/62) (open at time of writing) introduces three strategies in `verbatimIncludes` (`src/adapters/validator/claude.ts`):

1. Direct normalised substring match (pre-existing).
2. Bullet-marker stripping on both sides — recovers cases where the model prefixes each quoted line with `- ` even when the doc is contiguous prose.
3. Single-token backtick fallback — `` `identifier` `` matches plain `identifier` in the haystack.

Plus `[verbatim-check][high-conf:N]` log tagging when conf ≥ 0.9.

**Outcome — what the post-#62 run actually shows** (`out/data/runs/20260503-202431` vs baseline `20260503-100333`):

| | baseline | post-#62 |
|---|---|---|
| critical | 1 | 1 |
| major | 3 | 3 |
| minor | 3 | 0 |

We did not gain the canonical TPs the original criterion predicted (`apiVersion`, `filePath`, broken-arrow, shadowColor). We **lost** three minor findings — Pass-1 sampling variance, not the PR's fault.

**Why the prediction was wrong** — diagnosed from the Pass-1 dumps for the three high-conf drops that survived #62:

| Drop | Type | Cause | Right home for the fix |
|---|---|---|---|
| `` `filePath` `` (block-patterns, 0.97) | `nonexistent-name` | `docSays` slot held the *missing* identifier, not a doc quote. The doc legitimately doesn't contain `filePath`. Strategy 3 falls through to `haystack.includes('filePath')` and correctly returns false. | **Common prompt** — `docSays` shape rule for `nonexistent-name`. See Priority 2. |
| `BlockConfiguration` type def (block-registration, 0.75) | `type-signature` | Concatenated chunks across non-contiguous source lines. Drop is correct per existing design ("Concatenated quotes — leave dropping"). | None — drop is correct. |
| `schema = { span: { children: { '#text': {} } } };` (block-transforms, 0.97) | `broken-example` | `codeSays` slot held fabricated code. Verified: `packages/blocks/src/api/raw-handling/index.ts` is 87 lines and contains zero of the tokens "schema", "span", "#text". Pure hallucination. | **Common prompt** — `codeSays` shape rule for `broken-example`. See Priority 2. |

**Lesson**: verbatim normalisation tightness was not the dominant failure mode. The dominant failure mode was **the model populating `docSays`/`codeSays` slots with the answer (the missing thing, the corrected code) instead of with verifiable doc/code text**. The verbatim-check correctly catches that and drops it; the fix is upstream in the prompt, not the comparison layer.

**Strategies 1–3 still earn their keep** — they will fire when their patterns appear in future runs. Don't revert them. But the acceptance criterion ("≥3 canonical TPs surface") was the wrong measurement.

**What this also tells us about the test plan**: any future verbatim-layer change needs an acceptance criterion grounded in the *specific drop pattern being addressed*, not in "canonical TPs surface" — sampling variance and upstream prompt issues both confound that signal.

**Action**: hold PR #62 open. Work on Priority 2 first off `main` for clean attribution. If Priority 2 produces measurable positive impact (one of the canonical TPs surfaces), merge #62 afterwards on its own merits — its strategies will fire when their patterns appear, even if this run didn't exercise them.

---

## Priority 2 — Evidence-shape rules in common prompt

**Goal**: stop the model from filling `evidence.docSays` / `evidence.codeSays` with the answer (the missing identifier, the proposed correct code) when the slot is supposed to hold verifiable doc/code text. Surface the legitimate findings underneath without losing the verbatim-check's hallucination guard.

**Why**: this is the dominant remaining cause of high-conf drops in the post-#62 run (2 of the 3 surviving drops, both at conf 0.97). Both findings are real signal — `filePath` truly is undocumented; the `block-transforms` arrow-function example truly is broken JS — but the model expresses that signal by putting the answer in the evidence slot, where the verbatim-check correctly rejects it as unverifiable.

This rule is fully generic across corpora and languages: any docs/code pair has these two failure modes. **Common prompt** is the right home (CLAUDE.md "layered home, broadest first" — layer 1).

**Start here**:
- `src/adapters/validator/prompts/system.md` — the common prompt. Look for the existing evidence-shape rules (`docSays` / `codeSays` definitions, "verify before reporting").
- The two dropped issues from `/tmp/wp-docs-pass1-dump/pass1-1777836147435.json` (issue 1, `filePath`) and `pass1-1777836224212.json` (issue 0, `schema = { span: ... }`) are the canonical reproducers.

**Two specific shape rules to add**:

1. **For `nonexistent-name` where the missing thing is in code-not-doc**: `docSays` must quote the doc context that frames the absence (the property table heading, the surrounding paragraph, the API signature line) — *not* the missing identifier. If the doc literally has no relevant context, `docSays` should be empty and the model should rely on the absence-claim shape (the `isAbsenceIssue` flag already exists in `claude.ts` and skips the codeSays-verbatim check for this drift type; an analogous mechanism is not needed for docSays — the prompt rule alone should be enough).
2. **For `broken-example` where the doc snippet is syntactically wrong**: `codeSays` must either (a) be empty (the doc is broken on its face — no comparison code is needed), or (b) point to a real working example in the codebase with exact verbatim quote. Never fabricate "what the code should say."

**Sub-tasks**:
1. Re-read `src/adapters/validator/prompts/system.md` evidence section and drift-type definitions to find the right insertion point.
2. Draft the two rules with one positive example and one negative example each (the `filePath` and `schema` cases above are perfect counter-examples).
3. Run `DUMP_PASS1=1 op run --env-file=.env -- npm run analyze -- --config config/gutenberg-block-api.json --output ./out` and inspect the new dumps for `block-patterns` and `block-transforms`.
4. **Acceptance check**: in the new dumps, `filePath`'s `docSays` either anchors on real doc text (e.g. the properties-table header) or is empty; `block-transforms`'s `codeSays` either points to a real example or is empty.

**Acceptance**: at least one of the two canonical TPs (`filePath` undocumented, `block-transforms` broken arrow) surfaces in the final dashboard for `out/data/runs/<new>` with verifiable evidence.

**Risks**:
- Tightening evidence-shape rules can suppress legitimate findings if the model interprets "must quote real text" as "skip the finding when uncertain." Counter with explicit instruction: "if you cannot fill the evidence slot with verifiable text, leave it empty and rely on the absence claim — do not fabricate."
- Pass-1 sampling variance. Run twice before declaring acceptance reached.

**Removable when**: a stronger Pass-1 model (or a future common-prompt rewrite) makes these failure modes vanish. This is upstream/prompt work, not a heuristic post-filter, so it does not count against the "scaffolding" budget in CLAUDE.md.

---

## Priority 3 — Doc-fix patch generation

**Goal**: for each confirmed finding, generate a corrected doc passage that a maintainer can review and merge as a PR.

**Why**: this is where the project crosses from "interesting tool" to "actually used." Findings without fixes ask the maintainer to do the synthesis work; finishing that work captures the value. The model already has the doc, the code, and the contradiction — generating a corrected passage is well within current model capabilities.

**Start here**:
- `src/adapters/validator/claude.ts` — Pass 2 currently produces a `suggestion` field naming what to change. That's the natural extension point.
- A confirmed finding to use as a fixture: `block-patterns` `content` required-vs-optional (stable across all runs, conf 0.98).

**Design questions to answer first** (before implementing):
- Pass 3 or extend Pass 2? Pass 2 already has the verified evidence; another LLM call doubles cost. But Pass 3 is cleaner separation. Recommendation: extend Pass 2 — give it a `proposedFix` tool alongside the existing reasoning tool.
- Output shape: full corrected passage, or unified diff? Recommendation: structured `{ docPath, lineRange, originalText, correctedText }` — diff is generated from that downstream so the schema stays simple.
- How to scope the fix? The smallest passage that compiles to valid Markdown and contains the corrected claim. Don't rewrite paragraphs.

**Sub-tasks**:
1. Add a `proposedFix` field to the Pass 2 schema and prompt: when verifying a finding as real, also produce the corrected passage.
2. Add a CLI flag `--write-patches <dir>` that writes one `.patch` file per finding using the structured fix.
3. Hand-test on the 4 stable TPs:
   - `block-attributes` enum (markdown bullet list edit)
   - `block-patterns` `content` required (markdown table or property-listing edit)
   - `block-bindings` add_filter (PHP code-fence edit)
   - `block-variations` `isDefault` (prose paragraph edit)
4. Manually review patches for mergeability.

**Acceptance**: For 3 of 4 stable Gutenberg TPs, generated patches are mergeable without human edit (read the patch, decide if a maintainer would merge it as-is).

**Risks**:
- Cost goes up by roughly 1.3–1.5× per finding (extra output tokens in Pass 2). Track this — at scale it matters.
- Markdown table edits are fiddly; the model may produce broken table syntax. Have a Markdown-parse-validate step as a guard (which is fine here because the failure mode — invalid markdown — is deterministic and detectable).
- Multi-section fixes (where one finding implies edits in two parts of the doc) are out of scope for v1. Surface them as "see also" notes.

---

## Priority 4 — History-aware reporting

**Goal**: surface, per finding: when it was first seen, how long it has persisted, whether it is new today vs stable for weeks.

**Why**: a docs-health monitor's value is in the trend, not the snapshot. Maintainers act on "this is new" or "this regressed today" differently than on "here's a list of issues." It also dampens trust-erosion from marginal-confidence flap (a finding that has appeared once at conf 0.78 is treated differently from one stable at conf 0.95 across 10 runs).

**Start here**:
- `src/history.ts` — `fingerprintIssue` exists. Read it, confirm what's persisted.
- `src/cli.ts` line ~90 — `historyPath` is computed; verify history is being written and read.
- `out/data/history.json` if it exists — what's the current shape.

**First decision**: is history actually being used downstream right now, or just written and ignored? If it's not being read, that's the first thing to fix.

**Sub-tasks** (assuming history is being written but underused):
1. Read history.json shape; confirm fingerprints match across runs (no drift in the keying).
2. For each finding in the latest run, compute: `firstSeen`, `lastSeen`, `runCountSinceFirstSeen`, `confidenceTrend` (mean conf over the last N runs).
3. Update the dashboard renderer (`src/dashboard/` if it exists, or wherever `generate(results, outputDir)` is implemented) to surface those fields per finding.
4. Add a "what changed" section: findings new in this run, findings disappeared, findings whose severity changed.
5. Optional v2: dampen marginal-conf flap by requiring a finding to appear in ≥2 of last 3 runs before promoting to "stable."

**Acceptance**: Looking at the dashboard, you can answer "is this a new finding or has it been here a while?" without opening the JSON.

**Risks**:
- Fingerprint stability is fragile. If the fingerprint includes the docSays text and the model varies its quote slightly across runs, the same finding gets two fingerprints. Verify fingerprint behaviour empirically against the runs we already have.
- History grows monotonically. Define a pruning policy (keep last N runs, or last X days) before this matters.

---

## Priority 5 — Second site (do not start until 1–4 land)

**Goal**: validate the per-site abstraction by running on a corpus other than Gutenberg.

**Why**: the architecture is justified by generality. We've reduced the Gutenberg extension to 67 lines and theorised about language packs and config auto-injection — but the real test is whether a new site plugs in cheaply with useful results. Without that, all the architectural work is speculative.

**Candidate corpora**, ordered by insight-per-effort:
1. **`theme.json` reference** — adjacent WP corpus, different schema-vs-prose dynamic. Lowest setup cost (same repos already cloned).
2. **WordPress REST API handbook** — different docs source (devhub or core handbook), but still PHP, still WP-flavoured. Tests language-pack reusability for PHP.
3. **A non-WP corpus** (e.g. a small TypeScript library's docs + repo) — biggest validation, biggest effort. Tests the architecture's real generality.

**Start here**: `config/gutenberg-block-api.json` + `mappings/gutenberg-block-api.json` + `prompts/gutenberg-block-api.md` are the three artefacts to template from.

**Sub-tasks**:
1. Pick the corpus.
2. Write `config/<site>.json`, `mappings/<site>.json`, `prompts/<site>.md`. Start with the prompt extension empty and add only as needed.
3. Run; observe what happens.
4. Triage: are the failures generality gaps in the common prompt / language conventions, or just missing per-site tuning?
5. If it's a generality gap, fix the common prompt or open a language pack. If it's tuning, accept and document.

**Acceptance**: The second site produces at least one high-confidence (≥0.92) TP that human review confirms is real.

**What this run actually tells us**:
- If the prompt extension stays small (<40 lines) → the architecture is sound.
- If it balloons → the "common" prompt is corpus-specific in disguise; revise.
- If common-prompt rules misfire → that's the most valuable signal we'll get on this project.

**Risks**:
- The first run on a new site can be unimpressive because the few-shot example list is empty. Resist over-tuning the extension before the model has had a chance — the common prompt should produce *some* signal even with no extension.

---

## Parked: task #14 (config auto-injection)

What it would do: move "Repos in scope" / `internalPrefixes` / `documentedSchemas` from prose to config schema fields, with auto-injection in `buildPrompt`.

**Why parked**: the value lands when a second site exists. Doing it now means abstracting against one example. Per the week-3 assessment: do this *with* the second-site work (priority 5), not ahead of it.

**Unpark when**: priority 5 is in flight AND the second site's prompt extension would re-duplicate these same prose patterns. Then it's no longer speculative — it's removing real duplication.

---

## Open questions that would reorder this list

These should be answered before sinking another week into any direction:

1. **Is `out/data/history.json` actually being read anywhere?** If yes, priority 4 may be smaller than it looks. If no, it's larger.
2. **Is there a real timeline for site #2?** If it's "this month," priority 5 jumps. If it's "someday," it stays last.
3. **Cost ceiling.** $5 per 16-doc run, scaling linearly. At what corpus size does this stop being acceptable, and is doc-fix patch generation (priority 3) the lever that justifies the cost?
4. **Who reviews the dashboard today?** If it's just the project author, the trust problem is mostly self-knowledge. If it's a maintainer team, history-aware reporting (priority 4) gets more urgent.

---

## References

- Pipeline discipline: [CLAUDE.md](../../CLAUDE.md) — the layered home model is the source of truth for "where does this rule belong?"
- Latest run (post-#62): `out/data/runs/20260503-202431` — 1 critical, 3 major, 0 minor, health 96.
- Earlier same-day baseline: `out/data/runs/20260503-100333` — 1 critical, 3 major, 3 minor, health 96.
- PR #62 (Priority 1 strategies): https://github.com/juanma-wp/wp-docs-health-monitor/pull/62 — open at time of writing.
- Pass-1 dumps for the three high-conf drops diagnosed in Priority 1 § Outcome:
  - `filePath` (issue 1): `/tmp/wp-docs-pass1-dump/pass1-1777836147435.json`
  - `BlockConfiguration` (issue 0): `/tmp/wp-docs-pass1-dump/pass1-1777836187006.json`
  - `schema = { span: ... }` (issue 0): `/tmp/wp-docs-pass1-dump/pass1-1777836224212.json`
- Few-shot necessity test: `out/data/runs/20260503-095032` (examples removed) vs `20260503-091051` (with examples) — the proof that few-shot examples are load-bearing.
- Common prompt: `src/adapters/validator/prompts/system.md`
- Gutenberg extension: `prompts/gutenberg-block-api.md` (67 lines, examples included)
