# Phase 0 Gate — Manual Review
**Run:** `20260427-185928`  
**Model:** claude-sonnet-4-6 (Pass 1 + Pass 2)  
**Date:** 2026-04-27  
**Status:** 🔄 In progress

## Reproducing the dashboard

The `results.json` for this run is committed alongside this file. To load the dashboard locally:

```bash
npm run analyze -- --results docs/phase0/20260427-185928/results.json --output ./out
open out/index.html
```

---

## Summary

| Doc | Issues reported | Reviewed | True positive | False positive | Duplicate | Pending |
|-----|----------------|----------|---------------|----------------|-----------|---------|
| block-attributes | 3 | 3 | 2 | 0 | 1 | 0 |
| block-deprecation | 2 | 2 | 1 | 1 | 0 | 0 |
| block-registration | 2 | 1 | — | — | — | 1 |
| block-supports | 2 | 0 | — | — | — | 2 |
| block-variations | 2 | 0 | — | — | — | 2 |
| **Total** | **11** | **6** | **3** | **1** | **1** | **3** |

---

## block-attributes

### Issue 1 — [MAJOR] `rich-text` missing from valid `type` field values
**Verdict: ✅ True positive**

The doc lists valid `type` values as: `null`, `boolean`, `object`, `array`, `string`, `integer`, `number`. The `rich-text` type is missing. Confirmed by [commit 6a42225](https://github.com/WordPress/gutenberg/commit/6a42225124e69276a2deec4597a855bb504b37cc) which added `case 'rich-text'` to `isOfType()` in `get-block-attributes.ts`. The tool identified the right function.

**Note:** Would benefit from adding `schemas/json/block.json` as a source in the mapping (see issue #31).

---

### Issue 2 — [MAJOR] `html` source incorrectly attributed to RichText
**Verdict: ⚠️ Partial true positive** (finding real, suggestion overreaches)

The doc says `html` is "typically used by `RichText`." This is outdated — `RichText` uses `source: 'rich-text'`, not `source: 'html'`.

The finding is real. The correct fix is simply removing the sentence "This is typically used by `RichText`." The tool's additional suggestion to add a `rich-text` source entry overreaches — it's unclear whether `rich-text` is a public API for block developers to use in `block.json` or an internal implementation detail.

---

### Issue 3 — [MINOR] Duplicate of Issue 2
**Verdict: 🔁 Duplicate**

Same finding as Issue 2, reported twice with slightly different wording. Both point to the same gap in the source values list.

---

## block-deprecation

### Issue 1 — [MINOR] `isEligible` behavior description misleading
**Verdict: ❌ False positive**

The tool claimed `isEligible` is still called when `block.isValid` is `false`. This is incorrect — due to JavaScript short-circuit evaluation, when `block.isValid` is `false`, `isEligible` is never invoked. The doc's statement is accurate.

The tool misread the short-circuit logic in:
```js
if (block.isValid && !isEligible(...)) { continue; }
```

---

### Issue 2 — [MAJOR] Code example missing `createBlock` import
**Verdict: ✅ True positive**

The "Changing the innerBlocks" deprecation example uses `createBlock` but only destructures `registerBlockType` from `wp.blocks`. Running the example as written would throw a `ReferenceError`.

Fix: add `createBlock` to the destructuring: `const { registerBlockType, createBlock } = wp.blocks;`

---

## block-registration

### Issue 1 — [MAJOR] `registerBlockType` signature incomplete
**Verdict: 🔄 Pending manual check**

The doc describes `registerBlockType` as always taking `(name: string, settings: BlockConfiguration)`. The code has a second overload where the first argument can be a `BlockConfiguration` metadata object (e.g. imported from `block.json`), making `settings` optional. This is the recommended modern pattern.

---

### Issue 2 — [MINOR] `reusable` category missing from docs
**Verdict: 🔄 Pending manual check**

`DEFAULT_CATEGORIES` in `reducer.ts` has a 7th entry `{ slug: 'reusable', title: __('Reusable blocks') }` not listed in the documented core categories.

---

## block-supports

### Issue 1 — [MAJOR] `color.gradient` should be `color.gradients` (plural)
**Verdict: 🔄 Pending manual check**

### Issue 2 — [MAJOR] Duplicate of Issue 1
**Verdict: 🔄 Pending manual check**

⚠️ Also a Pass 2 crash diagnostic: `TypeError: Cannot read properties of undefined (reading 'trim')` — bug in the validator to fix.

---

## block-variations

### Issue 1 — [MINOR] `__experimentalBlockVariationPicker` false positive
**Verdict: 🔄 Pending manual check**

Note: the tool's own suggestion says "REJECTED: no change needed" — likely a false positive that slipped through Pass 2.

### Issue 2 — [MINOR] `registerBlockVariation()` accepts array, doc says object only
**Verdict: 🔄 Pending manual check**

---

## Notes

- `block-context` (known-clean doc): **0 issues** ✅ — passes Phase 0 gate expectation
- `block-bindings`, `block-metadata`, `block-patterns`, `block-transforms`: **0 issues** ✅
- Pass 2 crash in `block-supports` needs investigation regardless of gate outcome
