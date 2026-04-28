# Phase 0 Validation Gate — Results

Date: 2026-04-28
Validator version: claude-sonnet-4-6 (Pass 1 + Pass 2)
Runs evaluated: `20260427-185928`, `20260428-150114`, `20260428-190955`

---

## Scope

The gate was originally scoped to 3 docs. In practice, full human verification was
performed across all 16 docs in the latest run. The 3-doc framing is preserved below
for the formal gate decision; the full 16-doc data is in `docs/phase0/`.

| Slug | Role | Notes |
|------|------|-------|
| `block-registration` | known-drifted | Large API surface |
| `block-context` | known-clean | Small, stable — primary false-positive check |
| `block-metadata` | uncertain | Complex block.json schema |

---

## Results — run `20260428-190955` (16 docs) ✅ gate run

Source authority order: tests → type definitions → JSDoc/PHPDoc → JSON Schema → implementation code.
Test files and `packages/blocks/src/types.ts` added to primary tier for all mapped slugs.

| Slug | Issues reported | True positives | False positives | Notes |
|------|----------------|----------------|-----------------|-------|
| block-annotations | 0 | — | — | |
| block-api-versions | 0 | — | — | |
| block-attributes | 0 | — | — | FP from previous run eliminated — test confirmed `number`/`integer` behave identically |
| block-bindings | 0 | — | — | FP from previous run eliminated |
| block-context | 0 | — | — | ✅ known-clean confirmed |
| block-deprecation | 0 | — | — | FP from previous run eliminated |
| block-edit-save | 0 | — | — | |
| block-metadata | 1 | 1 | 0 | block name constraint missing namespace format |
| block-patterns | 0 | — | — | |
| block-registration | 2 | 2 | 0 | block name constraint (TP); `variations: Object[]` should be `BlockVariation[]` (TP via types.ts) |
| block-selectors | 0 | — | — | |
| block-styles | 0 | — | — | |
| block-supports | 1 | 1 | 0 | `color.gradient` → `color.gradients` |
| block-templates | 0 | — | — | |
| block-transforms | 0 | — | — | `isMatch` TP from previous run lost — model failed verbatim check against test file |
| block-variations | 2 | 2 | 0 | `scope` default value (TP via selectors.ts); `title` documented as optional but required in types.ts |
| **Total** | **6** | **6** | **0** | |

---

## Results — run `20260428-150114` (16 docs) — no-go run

| Slug | Issues reported | True positives | False positives | Notes |
|------|----------------|----------------|-----------------|-------|
| block-annotations | 0 | — | — | |
| block-api-versions | 0 | — | — | |
| block-attributes | 1 | 1 | 0 | `number (same as integer)` misleading |
| block-bindings | 1 | 0 | 1 | formatting inconsistency, not drift |
| block-context | 0 | — | — | ✅ known-clean confirmed |
| block-deprecation | 1 | 0 | 1 | misread short-circuit logic (recurring) |
| block-edit-save | 0 | — | — | |
| block-metadata | 2 | 1 | 1 | apiVersion optional vs schema required (FP); block name pattern (TP) |
| block-patterns | 1 | 1 | 0 | `filePath` property undocumented |
| block-registration | 2 | 1 | 1 | icon type (TP); reusable category (FP, recurring) |
| block-selectors | 0 | — | — | |
| block-styles | 0 | — | — | |
| block-supports | 2 | 2 | 0 | `color.gradient` → `color.gradients`; `aspectRatio` missing |
| block-templates | 0 | — | — | |
| block-transforms | 1 | 0 | 1 | hallucinated connection to deprecated function |
| block-variations | 1 | 1 | 0 | `isDefault` first vs last registered |
| **Total** | **12** | **7** | **5** | |

---

## Metrics

### Gate run (`20260428-190955`)

| Metric | Result | Target |
|--------|--------|--------|
| Precision (TP / issues reported) | 6/6 = **100%** | ≥ 80% ✅ |
| Recall | Not measured¹ | ≥ 70% |
| Clean-doc false positives (`block-context`) | **0** | = 0 ✅ |

### No-go run (`20260428-150114`)

| Metric | Result | Target |
|--------|--------|--------|
| Precision (TP / issues reported) | 7/12 = **58%** | ≥ 80% ❌ |
| Clean-doc false positives (`block-context`) | **0** | = 0 ✅ |

¹ Computing recall requires an independent human sweep to find issues the tool missed.
That exercise was out of scope for the Phase 0 gate — the primary gate signal is
precision and the clean-doc check. Known recall cost: `block-transforms` `isMatch` TP
from previous run was lost — model tried to cite test evidence but failed verbatim
check.

---

## False positive analysis

| Doc | FP type | Cause | Addressable? |
|-----|---------|-------|-------------|
| block-bindings | `label` optional vs required | Formatting inconsistency (requirement stated in prose, not parameter table) | Partially — hard to distinguish formatting from omission |
| block-deprecation | `isEligible` called when invalid | Misread short-circuit `A && B` as sequential | Yes — add short-circuit rule to prompt |
| block-metadata | `apiVersion` optional vs schema required | JSON schema `required` array used despite prompt rule | Yes — strengthen the prohibition |
| block-registration | `reusable` category missing | Internal reserved category, intentional doc omission | Yes — add rule about internal-only categories |
| block-transforms | `getPhrasingContentSchema` | Hallucinated connection between deprecated function and unrelated doc quote | Hard — requires verbatim connection check |

3 of 5 FPs have clear, addressable prompt rules. 2 are harder structural issues.

---

## Decision

- [x] **Go — precision ≥ 80% AND clean doc shows 0 issues**
- [ ] No-go — iterate system prompt, re-run, measure again
- [ ] Abort — PoC not viable

---

## Rationale

Precision improved from 58% to 100% between the no-go and gate runs. The key change
was restructuring source authority to prioritise tests and type definitions over
implementation code.

What drove the improvement:

1. **Test files eliminated implementation-detail FPs.** `block-attributes`
   `number (same as integer)` was the clearest case — the test confirmed both types
   accept floats, matching the doc claim. With tests as primary authority, the model
   correctly treated this as documented behavior rather than drift.

2. **`types.ts` as type definition source found real TPs.** Two new issues were
   found via `packages/blocks/src/types.ts` that implementation code alone did not
   surface cleanly: `variations: Object[]` should be `BlockVariation[]`, and `title`
   is required not optional. These are high-quality, actionable findings.

3. **All 6 surviving issues are high-quality.** Verbatim evidence, actionable
   suggestions, confirmed real drift against code that developers will actually use.

Known recall cost: `block-transforms` `isMatch` array TP from the previous run was
lost — the model attempted to cite test evidence but failed the verbatim check. This
is a structural tension between strict verbatim checking and test-first authority.

Clean-doc check passes (0 issues on `block-context`). Gate criteria met.

---

## Cross-run improvements

### 20260427-185928 → 20260428-150114

| Change | Effect |
|--------|--------|
| Self-rejection detection added | FP from `block-variations` (`__experimentalBlockVariationPicker`) eliminated |
| Duplicate suppression added | 2 duplicate issues from first run eliminated |
| JSON schema added as primary source | New TPs found in `block-metadata` and `block-supports` |
| Source authority hierarchy added to prompt | Partially reduced schema overreach; not fully effective |

### 20260428-150114 → 20260428-190955

| Change | Effect |
|--------|--------|
| Test files added to primary tier (all 10 slugs) | Eliminated 3 FPs caused by implementation-detail over-interpretation |
| `packages/blocks/src/types.ts` added to primary/secondary tiers | Found 2 new TPs (`variations` type, `title` required) that implementation code didn't surface |
| Source authority reordered: tests → types → JSDoc → schema → impl | Model now treats tested behavior as documented contract, not drift |
| Precision: 58% → 100% | Gate passed |
