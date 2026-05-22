# Output framing guide

This document defines the tone any consumer of `results.json` (dashboards,
exports, integrations) should use when presenting validator findings to a human
reader. It is **non-normative for the validator itself** — only the
presentation layer needs to honour it.

## Principle

The validator surfaces *candidates worth reviewing*, not confirmed defects. A
human must verify each before acting on it.

Why this matters: empirically, ~83% of findings across two sites and 41
verified candidates are real drift, ~17% are noise (hallucinations,
editorial soft-guidance, borderline cases). A consumer that presents findings
as **assertions** ("you have 17 bugs") loses user trust the first time a
hallucination slips through. A consumer that presents them as **invitations to
review** ("here are 17 candidates worth checking") absorbs the noise rate as
part of the expected experience.

## Where the framing lives in the data

- `results.disclaimer` (top-level string) — render this prominently once per
  report. Source of truth for the framing message. Use the value as-is or wrap
  it in a banner; do not rewrite it.
- `results.docs[].issues[].confidence` (0–1 number) — surface this visibly per
  candidate. A `confidence: 0.85` is meaningful information for the reviewer;
  hiding it implies certainty the validator does not claim.
- `results.docs[].issues[].suggestion` (model-generated string) — treat as a
  proposed fix to consider, not a directive to apply. The model can be subtly
  wrong about the right fix even when correctly identifying drift.

## Vocabulary

### Use

- *candidate*, *finding*, *surfaced*, *worth reviewing*, *potential drift*
- "the model suggests…", "looks like…", "may need attention", "appears to differ"
- Always pair severity with confidence when both are available

### Avoid

- *bug*, *error*, *broken* (unless quoting the source `suggestion` verbatim)
- *drift detected* → *potential drift*
- *issues found* → *candidates surfaced*
- *critical/major/minor* alone (without confidence context) — implies the
  validator is grading defects rather than ranking review priority

## Concrete before / after

Bad (asserts certainty):

> **Critical Issues: 1** · **Major Issues: 17**
>
> ### Issue: broken-example
> The example function calls `register_block_pattern_category()` but should
> call `unregister_block_pattern_category()`.

Good (frames as candidate):

> **23 candidates surfaced · 18 worth reviewing first · 5 lower priority**
>
> ### Candidate: example may be broken — confidence 1.00
> Looks like the function name says "unregister" but the body calls
> `register_block_pattern_category()`. **Verify before fixing.**

## Calibration baseline

| Site | Verified | REAL | Precision |
|---|---|---|---|
| Gutenberg Block Editor Handbook | 12 | 11 | 92% |
| WordPress Theme Handbook (smoke) | 6 | 4 | 67% |
| WordPress Theme Handbook (full)  | 23 | 19 | 83% |
| **Combined** | **41** | **34** | **83%** |

Known noise modes (each one a tag a reviewer is likely to apply when triaging):

- **Hallucination — enum-large**: model fabricates a structured detail like a
  30-value enum that does not exist in the schema. Surfaces when the doc is
  vague about an enumerable.
- **Hallucination — prose paraphrase**: model paraphrases a bullet list into
  a prose sentence and claims drift on the paraphrase. The exact `docSays`
  string is not in the doc.
- **Hallucination — doc/code swap**: model puts a PHPDoc string from the
  source file into `docSays` (treating code-side documentation as if it were
  the handbook). The exact `docSays` text only exists in the cited code file.
- **Editorial soft-guidance misread**: model treats a "(use X instead)"
  parenthetical as a factual deprecation claim. The cited code typically
  shows both items are still active.
- **Required-optional borderline**: model flags type-signature differences
  where the doc uses "optional" in a colloquial sense.

Frame the output to accept this mix as expected behaviour, not as a product
failure. The reviewer applies judgement; the validator surfaces candidates.

## Where this guide is enforced

Nowhere automatically. This is a tone guide for whoever builds or maintains a
presentation layer over `results.json`. Update this file when the calibration
baseline shifts (new site verified, new noise mode identified, precision
changes meaningfully).
