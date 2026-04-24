# Phase 0 Validation Gate — Results

Date: TBD (run after ANTHROPIC_API_KEY is configured)
Validator version: TBD

## Docs tested

| Slug | Why chosen | Human-identified issues |
|------|-----------|------------------------|
| block-registration | known documentation of registerBlockType — verify parameter name accuracy | TBD |
| block-attributes | core attribute system — well-documented, expected clean | TBD |
| block-metadata | block.json metadata — complex, potential drift | TBD |

## Results

| Slug | Human issues | Tool issues | True positives | False positives |
|------|-------------|-------------|----------------|-----------------|
| block-registration | TBD | TBD | TBD | TBD |
| block-attributes | TBD | TBD | TBD | TBD |
| block-metadata | TBD | TBD | TBD | TBD |

## Metrics

- Precision: TBD (target ≥ 80%)
- Recall: TBD (target ≥ 70%)
- Clean-doc false positives: TBD (target = 0)

## Decision

- [ ] Go — keep two-pass validation, proceed to full 10-doc run
- [ ] No-go — cut Pass 2, raise confidence threshold to ≥ 0.8, re-run
- [ ] Abort — PoC not viable, escalate

## Rationale

To be completed after running `npm run analyze` against the live Gutenberg codebase
with the `config/gutenberg-block-api.json` configuration and a valid `ANTHROPIC_API_KEY`.

The two-pass design is expected to reduce false positives relative to a single-pass approach:
Pass 1 produces candidates; the verbatim check eliminates hallucinated quotes; Pass 2
gives Claude targeted file access to confirm or reject each surviving candidate.

If Phase 0 shows high false-positive rates on clean docs, the fallback is to cut Pass 2
entirely and raise the Pass 1 confidence threshold to ≥ 0.8.
