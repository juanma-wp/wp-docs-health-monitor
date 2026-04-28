These rules apply when validating the Gutenberg Block API Reference documentation. They encode learnings from the Phase 0 gate manual review.

### Known internal / reserved identifiers — do not flag as missing from docs

- `reusable` block category — used exclusively by `core/block` (the Reusable Block block itself). It is intentionally omitted from the public category list. Do not report it as missing.

### Short-circuit evaluation — verify before reporting

Before reporting that a function "is not called" or "is always called" based on a conditional, verify the full boolean expression including short-circuit behaviour.

Example: `if (block.isValid && !isEligible(...))` — when `block.isValid` is `false`, JavaScript short-circuits and `isEligible` is never evaluated. The function is NOT called. Do not report the opposite.

### PHP `_doing_it_wrong()` vs required fields

A PHP `_doing_it_wrong()` call does not automatically make a field "required" in the documentation sense. If the requirement is stated clearly in the prose of the documentation page (not just the parameter table), the documentation is correct. Only flag as drift if the requirement is genuinely absent from the documentation.

### JSON schemas in `schemas/json/`

These schemas are designed for IDE tooling (VS Code autocomplete, editor validation). They represent current recommendations, not runtime contracts. Do not use their `required` arrays to claim a field is required — confirm that from TypeScript or PHP source instead.

**Hard rule:** Never report a `required-optional-mismatch` issue based solely on a JSON schema `required` array, regardless of confidence level. This applies even when the schema lists the field explicitly. You must find confirmation in TypeScript or PHP source. If you cannot find it there, do not report the issue.

### Deprecated functions

Only report a deprecated function as drift if the documentation explicitly names and recommends that deprecated function by name. If the deprecated function does not appear anywhere in the documentation text, do not report it — even if it appears in the same file or module as something the doc does reference.
