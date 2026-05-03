# Next steps — working plan

**Pairs with**: [docs/week-3.md](./week-3.md) (the strategic assessment that motivates the priorities here).
**Status snapshot**: 2026-05-03, on `main`. Current run baseline: `out/data/runs/20260503-100333` — 1 critical, 3 major, 3 minor, health 96. Steps A–C of the prompt reframe + steps 1+2 of the per-site reduction are merged. Few-shot examples verified load-bearing (`out/data/runs/20260503-095032`). Architectural work (task #14, language packs) parked.

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

1. **Verbatim recall** (task #16) — recover signal already being thrown away.
2. **Doc-fix patch generation** — make findings actionable as PRs.
3. **History-aware reporting** — make the dashboard a trend tool, not a snapshot.
4. **Second site** — validate the architecture by running on a non-Gutenberg corpus.

Until 1–3 land, do not invest in language packs, config auto-injection (task #14), or further prompt cleanup. The Gutenberg extension at 67 lines is cheap enough.

---

## Priority 1 — Verbatim recall (task #16)

**Goal**: stop verbatim normalisation from silently dropping legitimate Pass-1 findings.

**Why**: every run drops 4–7 candidates that are real TPs. Three canonical TPs (`apiVersion` required-vs-optional, `filePath` undocumented, broken arrow function in `block-transforms`) appear at Pass 1 with high confidence and are killed by formatting noise. CLAUDE.md's "Comparison layers must tolerate authoring-format noise" rule already calls this out as the right thing to fix.

**Start here**:
- `src/adapters/validator/claude.ts` — find `normaliseForVerbatim` (search the file for the function or the comment block "Tolerant normalisation for verbatim substring comparison").
- `out/data/runs/20260503-100333` and the most recent `[verbatim-check] dropped issue ...` log lines from that run's stderr — these are the patterns to fix.

**Patterns to handle (verified across multiple runs)**:

| Pattern | Example | Right fix |
|---|---|---|
| Bullet-list reformatting | doc: "Optional. Property: `apiVersion`" → model returns "- Optional / - Property: `apiVersion`" | strip leading `- ` / `* ` markers from BOTH sides when comparing |
| Single-token quote | docSays: `` `filePath` `` | allow ≥1-token contiguous quotes; do not reject as "too short" |
| Hallucinated codeSays | model writes plausible code that doesn't exist | **leave dropping** — this is correct behaviour |
| Concatenated quotes | TS type def + descriptive comment glued | **leave dropping** — non-contiguous, correct to reject |
| Doc-summary as docSays | "`X` property is not listed in the properties table" | **leave dropping** — that's a description not a quote; fix in prompt instead |

**Sub-tasks**:
1. Read `normaliseForVerbatim`; understand current tolerances (whitespace collapse, markdown link stripping).
2. Extend with: bullet-marker stripping (both sides), single-token quote allowance.
3. Add structured logging when a verbatim drop happens with conf ≥ 0.9 — that's a "we may be losing signal" signal.
4. Add unit tests pinning each new tolerance (and pinning the things that should still drop).
5. Run `op run --env-file=.env -- npm run analyze -- --config config/gutenberg-block-api.json --output ./out` and verify at least 3 of {`apiVersion`, `filePath`, broken-arrow, shadowColor} make it to the final output.

**Acceptance**: ≥3 previously-killed canonical TPs surface in the final results AND no new false positives appear (compare against `20260503-100333`).

**Risks**:
- Over-eager bullet stripping could match across non-bullet content. Pin with tests.
- Changing the verbatim layer is a downstream change, NOT a prompt change. Don't simultaneously edit the prompt — confounds attribution.

---

## Priority 2 — Doc-fix patch generation

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

## Priority 3 — History-aware reporting

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

## Priority 4 — Second site (do not start until 1–3 land)

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

**Why parked**: the value lands when a second site exists. Doing it now means abstracting against one example. Per the week-3 assessment: do this *with* the second-site work (priority 4), not ahead of it.

**Unpark when**: priority 4 is in flight AND the second site's prompt extension would re-duplicate these same prose patterns. Then it's no longer speculative — it's removing real duplication.

---

## Open questions that would reorder this list

These should be answered before sinking another week into any direction:

1. **Is `out/data/history.json` actually being read anywhere?** If yes, priority 3 may be smaller than it looks. If no, it's larger.
2. **Is there a real timeline for site #2?** If it's "this month," priority 4 jumps. If it's "someday," it stays last.
3. **Cost ceiling.** $5 per 16-doc run, scaling linearly. At what corpus size does this stop being acceptable, and is doc-fix patch generation (priority 2) the lever that justifies the cost?
4. **Who reviews the dashboard today?** If it's just the project author, the trust problem is mostly self-knowledge. If it's a maintainer team, history-aware reporting (priority 3) gets more urgent.

---

## References

- Strategic assessment: [docs/week-3.md](./week-3.md)
- Pipeline discipline: [CLAUDE.md](../CLAUDE.md) — the layered home model is the source of truth for "where does this rule belong?"
- Most recent baseline run: `out/data/runs/20260503-100333`
- Few-shot necessity test: `out/data/runs/20260503-095032` (examples removed) vs `20260503-091051` (with examples) — the proof that few-shot examples are load-bearing.
- Common prompt: `src/adapters/validator/prompts/system.md`
- Gutenberg extension: `prompts/gutenberg-block-api.md` (67 lines, examples included)
