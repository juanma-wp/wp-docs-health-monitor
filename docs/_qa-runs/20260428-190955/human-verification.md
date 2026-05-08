# Phase 0 Gate — Manual Review
**Run:** `20260428-190955`
**Model:** claude-sonnet-4-6 (Pass 1 + Pass 2)
**Date:** 2026-04-28
**Status:** ✅ Complete — **Gate passed (Go decision)**

## Improvements vs previous run (20260428-150114)

- Test files added to `primary` tier for all 10 mapped slugs
- `packages/blocks/src/types.ts` added as type definition source (primary/secondary) for all JS-heavy slugs
- Source authority reordered: tests → type definitions → JSDoc/PHPDoc → JSON Schema → implementation code
- AST-generated symbols slot documented in system prompt (future step; `types.ts` serves as placeholder)

## Reproducing the dashboard

```bash
npm run analyze -- --results docs/phase0/20260428-190955/results.json --output ./out
open out/index.html
```

---

## Summary

| Doc | Issues reported | True positive | False positive | Duplicate |
|-----|----------------|---------------|----------------|-----------|
| block-metadata | 1 | 1 | 0 | 0 |
| block-registration | 2 | 2 | 0 | 0 |
| block-supports | 1 | 1 | 0 | 0 |
| block-variations | 2 | 2 | 0 | 0 |
| **Total** | **6** | **6** | **0** | **0** |

Precision: **6/6 = 100%** (target ≥ 80% ✅)
Clean-doc (`block-context`): **0 issues** ✅

---

## Verbatim drops (dropped before Pass 2, not in results)

| Doc | Dropped quote | Cause |
|-----|---------------|-------|
| block-attributes | Enum value list from `schemas/json/block.json` | Indentation/whitespace mismatch in verbatim check |
| block-patterns | PHPDoc `@type string $content...` | Text cited from patterns registry but lives in a different file |
| block-registration (×2) | SVG icon code from `test/registration.js` | Model tried to cite test as icon type evidence; SVG not in that file |
| block-transforms | `isMatch` test assertion | Model tried to cite test for array behavior; exact quote not found — **known recall loss** |

---

## block-metadata

### Issue 1 — [MINOR] Block name constraint missing namespace format
**Verdict: ✅ True positive**

Doc says: "A block name can only contain lowercase alphanumeric characters and dashes, and must begin with a letter." — omits the required `namespace/block-name` format entirely. The regex `^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$` enforces that both the namespace AND block-name segment individually start with a letter. Same underlying issue as block-registration issue 1 — the same doc text appears in both pages.

---

## block-registration

### Issue 1 — [MAJOR] Block name constraint missing namespace format
**Verdict: ✅ True positive**

Same as block-metadata issue 1. Classified major here because the suggestion references the runtime warning message directly: "Block names must contain a namespace prefix... Example: my-plugin/my-custom-block." A developer following the doc's description could write a valid-looking but rejected block name.

### Issue 2 — [MINOR] `variations` typed as `Object[]` instead of `BlockVariation[]`
**Verdict: ✅ True positive**

Doc says `variations` type is `Object[]`. `packages/blocks/src/types.ts` line 401: `variations?: BlockVariation< Attributes >[];`. This is the type definition file doing exactly what it should — surfacing a typed interface that `Object[]` obscures. Developers lose all shape information about what a variation object can contain.

---

## block-supports

### Issue 1 — [MAJOR] `color.gradient` should be `color.gradients` (plural)
**Verdict: ✅ True positive (confirmed third time)**

Doc says: "When the block declares support for `color.gradient`…" — runtime key is `color.gradients` (plural), checked via `!! colorSupport.gradients` in `hasGradientSupport()` in `color.js`. Consistently detected across all three runs.

---

## block-variations

### Issue 1 — [MAJOR] `scope` default value description misleading
**Verdict: ✅ True positive**

Doc says: "Defaults to `block` and `inserter`." Code in `selectors.ts`: `variation.scope || ['block', 'inserter']` — the fallback is `block` and `inserter`, but lines 332–334 reveal a separate fallback that only applies for `block` and `transform` scopes (not `inserter`) in a different context. Additionally, the JSDoc on `types.ts` says "assumes all available scopes" which contradicts both the doc and the runtime. The doc is partially right but incomplete.

### Issue 2 — [MINOR] `title` documented as optional but required in TypeScript
**Verdict: ✅ True positive**

Doc says: "`title` (optional, type `string`)". `packages/blocks/src/types.ts` line 68: `title: string;` — no `?` modifier, so required. Clean signal from the type definition source: the model read the type directly rather than inferring from implementation code.

---

## Notes

- All 6 issues are sourced from either test files or `types.ts` — implementation code was not the primary evidence for any surviving issue
- `block-context`: **0 issues** ✅ — clean doc confirmed for third consecutive run
- `block-transforms` `isMatch` array TP from previous run not reproduced — model attempted test citation but verbatim check failed. Structural tension between strict verbatim checking and test-first authority; worth monitoring as recall cost
- No duplicates ✅
- Cost: $4.05 (993,588 input · 37,097 output · 48% cache hit) — higher than previous runs due to new primary files not yet in cache
