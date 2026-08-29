# feedback/ — review verdicts that feed the loop

Structured human review of validator runs. Every verdict recorded here makes
the next run better: false positives become "do not report this again"
calibration in the site-extension prompt, exemplar true positives become
findings to emulate, and missed drift becomes recall guidance. Precision per
run is tracked in `metrics.json` so improvement is measurable, not assumed.

See [`docs/reference/FEEDBACK.md`](../docs/reference/FEEDBACK.md) for the
full cycle.

## Layout

```
feedback/<site>/<runId>.json   review verdicts for one run (hand-edited)
feedback/<site>/metrics.json   derived precision metrics (generated — do not edit)
```

`<site>` is the config file basename (e.g. `gutenberg-block-editor`);
`<runId>` matches a committed run under `out/<site>/data/runs/`.

## Workflow

```bash
# 1. Generate a skeleton with every reported issue pre-listed as "pending"
npm run feedback -- init --site gutenberg-block-editor --run 20260525-100223

# 2. Edit feedback/<site>/<runId>.json: set each verdict, write notes
#    (FP notes become prompt guidance — phrase them as instructions),
#    add drift the run missed under "missed".

# 3. Apply — writes metrics.json and regenerates the AUTO-CALIBRATION
#    block in the site-extension prompt
npm run feedback -- apply --site gutenberg-block-editor
```

Verdicts: `true-positive` (set `"exemplar": true` on the ones worth showing
the model), `false-positive`, `duplicate`, `needs-editorial-judgement`,
`pending` (ignored by metrics and calibration).

Pushing verdict files to `main` triggers `.github/workflows/feedback-loop.yml`,
which runs `apply` and opens a PR with the regenerated prompt + metrics.
