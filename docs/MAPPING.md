# Mapping

How the docs-to-code mapping works, and how to curate it as an operator.

For the architectural rationale (why mapping is a separate phase, why it's adapter-pluggable, why the slug→tiers shape) see [ARCHITECTURE.md → Doc–Code Mapping](./ARCHITECTURE.md#doccode-mapping-doccodemapper). For the locked contract types (`CodeTiers`, `CodeFile`, `ReviewEntry`) see [GLOSSARY.md](./GLOSSARY.md). This doc is the operator-facing complement: how to *use* the mapping pipeline.

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

## The three mapping files

For a config named `<site>` (e.g. `gutenberg-block-api`), three files live under `mappings/`:

| File | Owner | Read by | Purpose |
|---|---|---|---|
| `<site>.json` | Operator (with auto-map's help) | Validator | Canonical slug→tiers mapping. **The validator's only input.** |
| `<site>.audit.json` | Auto-map | Operator (when reviewing) | Per-slug rationale and confidence from the AI re-ranker. Diagnostic only — never read by the validator. |
| `<site>.suggested.json` | Auto-map | Operator (during periodic review) | Auto-map's would-be candidates for slugs you've hand-curated. The "annual review prompt" — what auto-map *would* write if you hadn't reviewed. |

All three are committed to git. `<site>.suggested.json` only exists once at least one slug has been reviewed.

---

## Common workflows

### 1. First-time mapping for a new slug

Run auto-map with `--write`:

```
npx tsx scripts/auto-map.ts <slug> --config config/<site>.json --write
```

(Don't confuse with `npm run analyze` — that's the validator, which *consumes* the mapping. Auto-map *produces* it.)

Auto-map computes a `CodeTiers` candidate, writes it to `<site>.json`, and appends a per-run audit entry to `<site>.audit.json`. Re-running on the same slug overwrites — auto-map assumes any slug *without* `_reviews` is its territory.

If you want to inspect the candidate without writing, drop `--write`. To skip the AI re-ranker (faster, deterministic, but no audit), add `--no-rerank`.

### 2. Hand-curating + locking a slug ("manual review")

This is the headline workflow. Once you've decided auto-map's candidate is wrong (or right but you want to lock it down), you:

**Step A — edit `mappings/<site>.json`** for the slug. Adjust `primary`/`secondary`/`context` to whatever's correct.

**Step B — add a `_reviews` array to the slug**:

```jsonc
{
  "block-patterns": {
    "primary":   [
      { "repo": "wordpress-develop", "path": "src/wp-includes/class-wp-block-patterns-registry.php" },
      { "repo": "wordpress-develop", "path": "src/wp-includes/block-patterns.php" }
    ],
    "secondary": [],
    "context":   [],
    "_reviews": [
      { "by": "juanma", "date": "2026-05-09", "notes": "registry class is canonical; auto-map missed it" }
    ]
  }
}
```

`_reviews` schema:

| Field | Type | Required | Notes |
|---|---|---|---|
| `by` | string | yes | Non-empty. Free-text — name, handle, email, whatever you'll recognise later. |
| `date` | string | yes | ISO `YYYY-MM-DD`. Single-digit months/days, slashes, and ISO datetimes are rejected. |
| `notes` | string | no | Free-text. Why this curation is correct, what auto-map got wrong, what to look for at next review. |

The array must be **non-empty when present** (omit the field for unreviewed slugs; an empty `[]` is a schema error). Multiple entries are allowed when the same slug gets reviewed again later — auto-map uses `max(date)` to find "the latest review" for the suggested side file.

**Step C — commit.** Both files (`<site>.json` and the new `_reviews` entry) live in git so curation history is auditable.

That's it. The slug is now locked — auto-map will never silently overwrite it.

### 3. Re-running auto-map after curation

When auto-map runs on a slug that has `_reviews`:

- The canonical mapping is **not** touched.
- The candidate it would have written is staged in `<site>.suggested.json` instead.
- A fresh entry is appended to `<site>.audit.json` (auto-map's audit log doesn't care about review state).

So the operator can re-run auto-map quarterly or annually across all slugs and see what auto-map *would* do today, without losing curation. The diff between `<site>.json` (what the validator uses) and `<site>.suggested.json` (what auto-map currently believes) is the periodic-review surface.

### 4. Reading the suggested side file

Open `mappings/<site>.suggested.json`. It's a flat slug→tiers map, sorted by slug, with the same `CodeTiers` shape as the canonical mapping (no `_reviews` in the side file — it's strictly auto-map's candidate).

For each slug present, ask:
- Did auto-map find a file my curation missed? (likely → consider promoting it into `<site>.json`)
- Did auto-map drop a file I'd kept? (check the audit — it may have a low confidence reason; usually leave the curation alone)
- Has the codebase shape moved enough that the original review is stale? (re-curate, add a new `_reviews` entry with today's date)

After acting on a suggestion, either:
- **Update `<site>.json` manually** and add another `_reviews` entry with a fresh date — the suggested entry remains until auto-map runs again, at which point it gets overwritten or removed.
- **Force-regenerate** (next workflow) if you want auto-map's candidate to fully replace your curation.

### 5. Force-regenerating after a surface change

Sometimes a slug you reviewed two years ago is no longer worth keeping curated — the codebase moved, files renamed, your notes are obsolete. To return the slug to "auto-map territory":

```
npx tsx scripts/auto-map.ts <slug> --config config/<site>.json --write --force-regenerate
```

What this does:
- Overwrites the canonical mapping with the fresh candidate.
- **Strips `_reviews` from that slug's entry** — the slug is now unreviewed again.
- Removes the slug from `<site>.suggested.json` (idempotent — safe even if it wasn't there).

The flag is the deliberate verb. There's no separate confirmation prompt.

---

## WriteDecisionPolicy reference table

When you run `auto-map.ts <slug> --write`, this is what happens (lives in [`src/auto-map/write-decision-policy.ts`](../src/auto-map/write-decision-policy.ts)):

| Existing slug state | `--force-regenerate` | Action |
|---|---|---|
| Not in mapping file | – | `write-mapping` → canonical |
| Present, no `_reviews` field | – | `write-mapping` → canonical (overwrites) |
| Present, valid `_reviews` (≥1 entry) | absent | `write-suggestion` → side file |
| Present, valid `_reviews` (≥1 entry) | present | `force-regenerate` → canonical (strips `_reviews`) |
| Present, **malformed** `_reviews` | any | `abort` with named field error |

"Malformed" means: `_reviews` is not an array, is empty, has an entry missing `by` or `date`, has an empty `by`, or has a non-ISO `date`. The error message names the offending field — fix the JSON and re-run.

---

## CLI flag reference

```
npx tsx scripts/auto-map.ts <slug> [flags]
```

| Flag | Default | Purpose |
|---|---|---|
| `--config <path>` | `config/gutenberg-block-api.json` | Site config to use. Picks the mapping file path, code sources, doc source. |
| `--write` | off | Persist results to disk. Without it, auto-map prints what it would do and exits. |
| `--no-rerank` | off (re-rank is on) | Skip the AI re-ranker. Faster and free, but produces no audit and is incompatible with `--review`. |
| `--explain` | off | Verbose per-slug rationale to stdout. Diagnostic. |
| `--review` | off | Implies `--write`. Surfaces a flagged subset (low-confidence keeps from the re-ranker) for hand-review during the run. Requires the re-ranker (incompatible with `--no-rerank`). |
| `--force-regenerate` | off | Escape hatch. Overwrites `_reviews`-locked slugs and clears their suggested-side-file entry. See workflow 5 above. |

---

## Gotchas

- **Slug renames break mappings silently.** If a doc's slug changes upstream, the mapping key becomes stale and the validator reports "no mapping found" for the new slug while the old key sits orphaned. Lint step is deferred — for now, grep is your friend.
- **`--review` and `--no-rerank` are mutually exclusive.** The flagged subset is derived from re-rank confidence; without the re-ranker there's no audit to flag. Auto-map errors out at flag-parse time rather than producing empty output.
- **`_reviews` is preserved through `MappingSchema.parse()` only because it's a known optional field.** Adding other unknown keys to a slug entry will be silently stripped by Zod. If you need richer per-slug metadata, extend the schema in [`src/types/mapping.ts`](../src/types/mapping.ts) — don't sneak it in via the JSON.
- **The suggested side file is committed to git.** Treat it as documentation of "what auto-map currently thinks," not as scratch state. Diffs to `<site>.suggested.json` are signal — they show how auto-map's beliefs are shifting over time independently of your curation.
- **`--force-regenerate` strips your `_reviews` annotations.** Once you run it, the prior reviewers and notes for that slug are gone (still in git history, but not in the live file). Re-add `_reviews` if you want to keep auditability after the regeneration.
