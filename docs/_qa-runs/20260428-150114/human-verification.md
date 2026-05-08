# Phase 0 Gate — Manual Review
**Run:** `20260428-150114`
**Model:** claude-sonnet-4-6 (Pass 1 + Pass 2)
**Date:** 2026-04-28
**Status:** ✅ Complete

## Improvements vs previous run (20260427-185928)
- Self-rejection detection added
- Pass 2 crash guard added
- Duplicate suppression added
- `schemas/json/block.json` added as primary source for block-metadata and block-attributes
- System prompt updated with source authority hierarchy

## Reproducing the dashboard

```bash
npm run analyze -- --results docs/phase0/20260428-150114/results.json --output ./out
open out/index.html
```

---

## Summary

| Doc | Issues reported | True positive | False positive | Duplicate |
|-----|----------------|---------------|----------------|-----------|
| block-attributes | 1 | 1 | 0 | 0 |
| block-bindings | 1 | 0 | 1 | 0 |
| block-deprecation | 1 | 0 | 1 | 0 |
| block-metadata | 2 | 1 | 1 | 0 |
| block-patterns | 1 | 1 | 0 | 0 |
| block-registration | 2 | 1 | 1 | 0 |
| block-supports | 2 | 2 | 0 | 0 |
| block-transforms | 1 | 0 | 1 | 0 |
| block-variations | 1 | 1 | 0 | 0 |
| **Total** | **12** | **7** | **5** | **0** |

---

## block-attributes

### Issue 1 — [MINOR] `number` described as same as `integer`
**Verdict: ✅ True positive**

Doc says: `` `number` (same as `integer`) `` — misleading. Fix: simply remove the `(same as \`integer\`)` parenthetical. No need to add a longer description — removing the incorrect claim is sufficient.

---

## block-bindings

### Issue 1 — [MAJOR] `label` documented as optional but required in code
**Verdict: ❌ False positive**

The doc prose explicitly states: "Registering a source requires defining at least name, a label and a callback function." The requirement IS documented. The tool flagged it because the parameter table doesn't repeat the "Required" label, but that's a formatting inconsistency, not drift.

---

## block-deprecation

### Issue 1 — [MAJOR] `isEligible` behavior description
**Verdict: ❌ False positive (confirmed)**

Recurring false positive. The doc is correct — `isEligible` is NOT called when `block.isValid` is false due to JavaScript short-circuit evaluation in `if (block.isValid && !isEligible(...))`. The tool misreads the logic. Flagged in both runs.

---

## block-metadata

### Issue 1 — [CRITICAL] `apiVersion` documented as optional but required in schema
**Verdict: ❌ False positive**

The schema's `required` array is for IDE tooling (autocomplete, editor validation), not runtime enforcement. The doc saying `apiVersion` is Optional is correct — blocks work without it. The schema also has `"const": 3` which would make all existing blocks with older API versions invalid, confirming it's aspirational/tooling-only.

**Learning:** JSON schema `required` arrays should not be used to determine required/optional status. System prompt and mapping guidelines updated accordingly.

### Issue 2 — [MAJOR] Block name format rule incorrect
**Verdict: ✅ True positive**

Doc says "It must begin with a letter" — implying only the overall string needs to start with a letter. The schema regex `^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$` enforces that **both** the namespace AND the block-name segment independently begin with a letter. Good example of schemas being useful for pattern/format validation.

---

## block-patterns

### Issue 1 — [MINOR] `filePath` property not documented
**Verdict: ✅ True positive**

`filePath` (optional, added in WordPress 6.5.0) exists in `class-wp-block-patterns-registry.php` but is missing from the documented properties list for `register_block_pattern()`.

---

## block-registration

### Issue 1 — [MINOR] `icon` type wrong for `registerBlockCollection`
**Verdict: ✅ True positive**

Doc says `icon` type is `Object` only. The type signature accepts both `String` and `Object`.

### Issue 2 — [MINOR] `reusable` category missing from docs
**Verdict: ❌ False positive (confirmed)**

Recurring false positive. `reusable` is an internal reserved category used only by `core/block`. Omitting it from the docs is intentional. Flagged in both runs.

---

## block-supports

### Issue 1 — [MAJOR] `color.gradient` should be `color.gradients` (plural)
**Verdict: ✅ True positive (confirmed)**

Recurring true positive. Confirmed in both runs. Now evidenced by `schemas/json/block.json` in addition to TypeScript source.

### Issue 2 — [MINOR] `aspectRatio` missing from `dimensions` subproperties
**Verdict: ✅ True positive**

`aspectRatio` exists as a subproperty of `dimensions` in `schemas/json/block.json` but is not listed in the documented subproperties alongside `height` and `minHeight`.

---

## block-transforms

### Issue 1 — [MINOR] `getPhrasingContentSchema` deprecated API reference
**Verdict: ❌ False positive**

The doc doesn't mention `getPhrasingContentSchema` at all — it references `cleanNodeList` and links to `phrasing-content.js`. The tool found a deprecated function in the code and incorrectly tied it to an unrelated doc quote. Hallucinated connection between evidence and finding.

---

## block-variations

### Issue 1 — [MAJOR] `isDefault` — "first registered" vs "last registered"
**Verdict: ✅ True positive**

Doc says "The Editor respects the first registered variation with `isDefault`." but `getDefaultBlockVariation` in `selectors.ts` does `.reverse().find(...)` — the last registered variation wins, not the first.

---

## Notes

- `block-context`: **0 issues** ✅ — clean doc confirmed again
- `block-bindings`, `block-metadata`, `block-patterns`, `block-transforms`: new findings from this run
- No duplicates detected ✅ — dedup fix working
- Schema-sourced evidence appearing in block-metadata and block-supports ✅
