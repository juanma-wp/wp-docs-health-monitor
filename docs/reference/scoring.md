# Scoring

How a doc's health score is computed, how that score becomes a status badge (`healthy` / `needs-attention` / `critical`), and how per-doc scores roll up into group and overall scores shown on the dashboard.

Source of truth: [`src/health-scorer.ts`](../../src/health-scorer.ts) and [`src/pipeline.ts`](../../src/pipeline.ts) (`computeOverallHealth`).

---

## Per-doc score

Each doc starts at **100** and loses points for every issue the validator reports. Penalties are keyed to issue **severity**, not issue type:

| Severity | Penalty per issue |
| --- | --- |
| `critical` | **−15** |
| `major`    | **−7**  |
| `minor`    | **−2**  |

```
healthScore = max(0, 100 − 15·critical − 7·major − 2·minor)
```

Floored at 0, capped at 100. Examples:

- 1 critical → 85
- 2 criticals → 70
- 1 major → 93
- 6 minors → 88
- 12 majors → 16

Severity itself is assigned by the validator according to the rubric in [`src/adapters/validator/prompts/system.md`](../../src/adapters/validator/prompts/system.md) (impact filter + severity rubric). For the per-check default severities, see [`reference/checks.md`](./checks.md).

## Status (the badge colour)

Status is derived from the score, not directly from issue counts:

| Score range | Status            | Dashboard colour |
| ---         | ---               | ---              |
| **≥ 85**    | `healthy`         | green            |
| **60–84**   | `needs-attention` | yellow           |
| **< 60**    | `critical`        | red              |

The numeric score chip on the dashboard uses the same thresholds ([`src/dashboard/templates/shared.ts`](../../src/dashboard/templates/shared.ts)).

Two non-scoring statuses are possible alongside these three:

- `not-mapped` — the doc has no entry in the mappings file, so there is no code to compare against. `healthScore` is `null`.
- `analysis-failed` — the validator did not produce findings (e.g. API error after retries). `healthScore` is `null`.

Both are excluded from group and overall averages.

## Group and overall scores

The **Overall Health** number on the dashboard, and each group score (e.g. `block-api: 96`), are plain **arithmetic means** of the per-doc scores in that scope. Severities are *not* re-weighted at the group level — they only enter via the per-doc penalties.

```
overallHealth = round( sum(doc.healthScore) / count(doc) )
```

…over docs whose status is neither `not-mapped` nor `analysis-failed` ([`src/pipeline.ts` — `computeOverallHealth`](../../src/pipeline.ts)). If every doc is excluded, the overall is reported as 100.

The group-level rollup uses the same average over the docs in that group ([`src/dashboard/tree-builder.ts`](../../src/dashboard/tree-builder.ts)).

## Known sharp edges

- **Status is a pure function of the score.** A doc with 2 criticals (score 70) lands in `needs-attention` (yellow), while a doc with 6 minors (score 88) lands in `healthy` (green). If the goal is "any critical issue should colour the doc red regardless of total score," that is a status-rule change, not a weight change.
- **Penalties are linear and uncapped in count.** A doc with 10 majors scores 30; a doc with 15 majors scores 0. There is no per-severity ceiling, so the floor at 0 absorbs additional issues silently.
- **Group averages mask outliers.** A group of 20 docs at 100 and one doc at 40 averages to ~97 (`healthy`). The dashboard's per-row breakdown is where outliers surface.
