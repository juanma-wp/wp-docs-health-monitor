# The feedback loop

How review feedback on generated reports feeds back into the validator so
each run produces a better outcome than the last — on every site.

## The cycle

```
run pipeline ──► out/<site>/data/runs/<runId>/results.json (report)
     ▲                              │
     │                              ▼
prompts/<site>.md          human reviews findings
(AUTO-CALIBRATION          feedback init → fill verdicts
 block regenerated)        feedback/<site>/<runId>.json
     ▲                              │
     │                              ▼
feedback apply ◄──── push to main → feedback-loop workflow → PR
(also writes feedback/<site>/metrics.json — the precision trend)
```

1. **Run** — the pipeline writes `results.json`; every issue carries a
   `fingerprint`.
2. **Init** — `npm run feedback -- init --site <site> --run <runId>` emits
   `feedback/<site>/<runId>.json` with every reported issue pre-listed as
   `pending`. This replaces the freeform `docs/_qa-runs/*/human-verification.md`
   format with something automation can consume.
3. **Review** — a human sets each verdict (`true-positive`, `false-positive`,
   `duplicate`, `needs-editorial-judgement`) and writes `notes`. FP notes are
   the highest-leverage text in the loop: they are injected verbatim into the
   prompt as "reviewer:" rationale, so phrase them as instructions to a future
   validator ("Do not treat a non-exhaustive listing as drift"), not as diary
   entries. Drift the run *missed* goes under `missed`. Mark the best TPs
   `"exemplar": true`.
4. **Apply** — `npm run feedback -- apply` joins verdicts back to the run by
   `(slug, fingerprint)`, then:
   - writes `feedback/<site>/metrics.json` — per-run and cumulative precision,
     with FP concentration by issue type and severity (says *where* to aim the
     next improvement);
   - regenerates the **AUTO-CALIBRATION block** between markers in the
     site-extension prompt (the file `config/<site>.json` wires as
     `validator.systemPromptExtension`). Hand-written rules outside the
     markers are preserved byte-for-byte; regeneration is idempotent; each
     section is capped newest-run-first so the prompt does not grow without
     bound (full history stays in `feedback/`);
   - reports **promotion candidates**: FP classes recurring across ≥2 sites,
     which per CLAUDE.md § "Where a new rule belongs" are the signal to
     promote a rule up the layer stack. Automation only *reports* these —
     the common `SYSTEM_PROMPT`, language packs, and config injection are
     never written by the loop, because promotion is a judgement call.
5. **Automation** — pushing verdict files to `main` triggers
   `.github/workflows/feedback-loop.yml`, which runs `apply` and opens a PR
   with the regenerated prompt + metrics. Merge it and the next run learns
   from the review. `metrics.json` is excluded from the trigger paths, so the
   loop terminates.

## Design constraints honoured

- **Layer discipline** — reviewer-earned TP/FP examples are layer-4
  (site-extension) material by definition; the loop writes only there.
  Cross-site recurrence is surfaced, never auto-promoted.
- **No heuristic post-processing** — the loop improves *context and prompt*
  (the sanctioned levers), not output filters. Nothing here guards or
  rewrites model output.
- **Locked contracts** — feedback is an overlay keyed by
  `(runId, slug, fingerprint)`; `src/types/` and `RunResults` are untouched.
  Feedback schemas live in `src/feedback/schema.ts`.
- **Fail loudly** — malformed feedback files throw; verdicts that no longer
  match a committed run land in an `unmatched` report instead of being
  silently dropped.
- **Measurable** — every apply refreshes the precision trend, so "did the
  calibration help" is answerable from `metrics.json` after the next
  reviewed run (and via the `runPass1Only` experiment seam for controlled
  comparisons).

## Measuring whether the loop works

After a calibration PR merges, the next reviewed run's entry in
`metrics.json` is the measurement: precision should rise (fewer FPs of the
classes the block teaches) and known misses should convert to reported TPs.
For a controlled before/after on a single doc, run the pipeline with
`--slug <slug>` against the prompt with and without the block (the
`runPass1Only` seam in `claude.ts` supports exactly this comparison).
