# Mapping

How the docs-to-code mapping works, and how to curate it as an operator.

For the architectural rationale (why mapping is a separate phase, why it's adapter-pluggable, why the slug→tiers shape) see [ARCHITECTURE.md → Doc–Code Mapping](./ARCHITECTURE.md#doccode-mapping-doccodemapper). For the locked contract types (`CodeTiers`, `CodeFile`) see [GLOSSARY.md](./GLOSSARY.md). This doc is the operator-facing complement: how to *use* the mapping pipeline.

---

## Where mapping sits

The validator can't compare a doc to "the codebase" — it needs to know *which files* a given doc is making claims about. The mapping phase is that bridge.

```
manifest (doc index) ──┐
                       ├──► validator
mapping (doc → code) ──┘
```

Slug-keyed JSON. One entry per doc slug. Each entry is a `CodeTiers` shape: `{ primary, secondary, context }` arrays of `{ repo, path }` references. Tiers are token-budget hints, not categories — `primary` is always sent to the validator; `context` is dropped first under pressure.

Mapping quality dominates analysis quality. A doc with no mapping entry is silently skipped; a doc mapped to the wrong files surfaces nonsense drift.

---

## The two mapping files

For a config named `<site>` (e.g. `gutenberg-block-api`), two files live under `mappings/`:

| File | Owner | Read by | Purpose |
|---|---|---|---|
| `<site>.json` | Operator (with auto-map's help) | Validator | Canonical slug→tiers mapping. **The validator's only input.** |
| `<site>.audit.json` | Auto-map | Operator (when reviewing) | Per-slug rationale and confidence from the AI re-ranker. Diagnostic only — never read by the validator. |

Both are committed to git.

---

## Workflow

The full loop is short:

1. **Run auto-map for a slug** (with `--write`):

   ```
   npx tsx scripts/auto-map.ts <slug> --config config/<site>.json --write
   ```

   Auto-map computes a `CodeTiers` candidate, writes it to `<site>.json`, and appends a per-run audit entry to `<site>.audit.json`. Drop `--write` to inspect the candidate without persisting; add `--no-rerank` to skip the AI step (faster, deterministic, but produces no audit); add `--explain` to print rationale + confidence per kept file and reason per dropped file.

2. **Inspect the result.** Open `<site>.json` and check the entry. Cross-check against the doc to confirm the files actually back the claims it makes. The audit file (`<site>.audit.json`) is helpful here — it shows what the re-ranker thought of every candidate.

3. **Tune in place if needed.** Edit the entry by hand: add a primary file auto-map missed, drop a coincidental match, demote something from primary to secondary. The mapping file is plain JSON — no schema gymnastics required.

4. **Commit.** The commit message is the audit trail. If you tuned something, say what and why; future you (or someone else) can find that context with `git log <mapping file>` or `git blame`.

That's it. No side files, no review metadata, no special flags. Re-running auto-map on a slug overwrites its entry; if you have hand-tuning you want to keep, restore it from git after the regen — `git diff` makes the delta visible.

(Don't confuse with `npm run analyze` — that's the validator, which *consumes* the mapping. Auto-map *produces* it.)

---

## CLI flag reference

```
npx tsx scripts/auto-map.ts <slug> [flags]
```

| Flag | Default | Purpose |
|---|---|---|
| `--config <path>` | `config/gutenberg-block-api.json` | Site config to use. Picks the mapping file path, code sources, doc source. |
| `--write` | off | Persist results to disk. Without it, auto-map prints what it would do and exits. |
| `--no-rerank` | off (re-rank is on) | Skip the AI re-ranker. Faster and free, but produces no audit. |
| `--explain` | off | Verbose per-slug rationale to stdout. Diagnostic. |

---

## Gotchas

- **Slug renames break mappings silently.** If a doc's slug changes upstream, the mapping key becomes stale and the validator reports "no mapping found" for the new slug while the old key sits orphaned. Lint step is deferred — for now, grep is your friend.
- **Re-running auto-map overwrites your hand-tuning.** Treat regenerations as an active decision: diff the result against the previous version (`git diff`), keep what auto-map improved, and re-apply tuning that still applies.
