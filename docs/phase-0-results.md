# Phase 0 Validation Gate — Results

Date: 2026-04-28
Validator version: claude-sonnet-4-6 (Pass 1 + Pass 2)
Runs evaluated: `20260427-185928` and `20260428-150114`

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

## Results — latest run (`20260428-150114`, 16 docs)

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

| Metric | Result | Target |
|--------|--------|--------|
| Precision (TP / issues reported) | 7/12 = **58%** | ≥ 80% |
| Recall | Not measured¹ | ≥ 70% |
| Clean-doc false positives (`block-context`) | **0** | = 0 |

¹ Computing recall requires an independent human sweep to find issues the tool missed.
That exercise was out of scope for the Phase 0 gate — the primary gate signal is
precision and the clean-doc check.

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

- [ ] Go — precision ≥ 80% AND clean doc shows 0 issues
- [x] **No-go — iterate system prompt, re-run, measure again**
- [ ] Abort — PoC not viable

---

## Rationale

Precision at 58% is below the 80% target. However:

1. The clean-doc check **passes** (0 issues on `block-context`).
2. All 7 true positives are **high quality** — verbatim evidence, actionable suggestions,
   confirmed real drift.
3. The false positive pattern is **identifiable**:
   - 2 are recurring across both runs (block-deprecation, block-registration reusable)
     — same bug, same FP.
   - 1 is the JSON schema `required` issue — the system prompt rule already exists but
     is not strong enough.
   - 1 is a hallucination with no doc quote connection — needs a structural guard.
4. Estimated **post-fix precision: ~78–90%** if the 3 addressable FPs are suppressed.

Recommended prompt additions before re-run:

1. **Short-circuit rule:** "When evaluating conditional logic, account for JavaScript/PHP
   short-circuit evaluation. `if (A && B)` means B is never evaluated when A is false.
   Do not report drift based on a branch that cannot be reached."
2. **Strengthen JSON schema required prohibition:** "NEVER report a
   `required-optional-mismatch` issue based solely on a JSON schema's `required` array.
   You MUST find a TypeScript or PHP source confirming this before reporting. If you
   cannot, do not report it."
3. **Internal category rule:** "If a block category exists in the codebase but is not
   documented in the developer-facing docs, this is NOT drift if the category is clearly
   an internal or reserved category used only by WordPress core internals (e.g.
   `reusable`). Omitting internal APIs from docs is intentional."

Abort is not warranted — the PoC is producing actionable signal on real docs. The
failure mode is false positives on edge cases, not systematic hallucination.

---

## Cross-run improvements (20260427-185928 → 20260428-150114)

| Change | Effect |
|--------|--------|
| Self-rejection detection added | FP from `block-variations` (`__experimentalBlockVariationPicker`) eliminated |
| Duplicate suppression added | 2 duplicate issues from first run eliminated |
| JSON schema added as primary source | New TPs found in `block-metadata` and `block-supports` |
| Source authority hierarchy added to prompt | Partially reduced schema overreach; not fully effective |
