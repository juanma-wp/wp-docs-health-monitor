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

## How auto-map works under the hood

Two layers: a **lexical retrieval** pass that finds candidate files cheaply and deterministically, and an optional **AI re-rank** pass that picks among them with semantic judgement.

```
       doc markdown                   configured repos
             │                              │
             ▼                              ▼
  ┌────────────────────┐         ┌────────────────────────┐
  │ extractDocSymbols  │         │  buildSymbolIndex      │
  │ • backtick tokens  │         │  • AST per file:       │
  │ • normalize calls  │         │     TS/JS · PHP · JSON │
  │ • drop primitives  │         │  • symbols + hooks     │
  └────────┬───────────┘         │  • per-repo IDF        │
           │                     │  • cached by commit SHA│
           │                     └───────────┬────────────┘
           │                                 │
           └──────────┬──────────────────────┘
                      ▼
          ┌──────────────────────────┐
          │ scoreFilesAcrossRepos    │
          │ score = Σ weight · idf   │  ← lexical retrieval
          │ sort desc, take top-30   │     (cheap, deterministic)
          └────────────┬─────────────┘
                       │
                       ▼
       ┌─────────────────────────────────┐
       │ Reranker (Claude + tool-use)    │  ← AI ranking
       │ INPUT:  doc + 30× {repo,path,   │     skip with --no-rerank
       │         score, matchedSymbols}  │
       │ OUTPUT: primary/secondary/      │
       │         context/dropped, each   │
       │         with rationale +        │
       │         confidence (kept)       │
       └────────────┬────────────────────┘
                    │  on failure ↓
                    ▼
       ┌────────────────────────┐
       │ confidence floor 0.5   │     lexicalTiers fallback
       │ → CodeTiers projection │     (top-3, top-5, tree
       │ + audit JSON           │      heuristic for context)
       └────────────┬───────────┘
                    ▼
              mapping JSON
              + <site>.audit.json
```

### Step 1 — extract doc symbols

`extractDocSymbols` (in `src/adapters/validator/context-assembler.ts`) pulls backtick-wrapped tokens out of the doc markdown. Call-form tokens like `wp.blocks.registerBlockType()` are normalised to `registerBlockType` so they match the bare identifier the AST indexer recorded. Primitive literals (`true`, `null`, `string`) are dropped — they have no retrieval value.

### Step 2 — build a symbol index per repo

`buildSymbolIndex` walks each repo's tree once and parses every indexable file (`.ts/.tsx/.js/.jsx/.php`, plus `.json` only under `schemas/`). Per-language extractors live under `src/extractors/` — they parse with `@typescript-eslint/parser` (TS/JS), `php-parser` (PHP), and a hand-rolled AST walker for JSON Schemas. Each file emits **symbols** (named exports, declared functions, schema property names) and **hooks** (firing sites for `apply_filters` / `do_action` / `addFilter` / `addAction`).

The index is cached on disk keyed by repo + commit SHA, so re-running auto-map on the same revision is free after the first build. Each repo also gets an **IDF** (inverse document frequency) per symbol name, so generic identifiers like `name`, `style`, `icon` (which appear everywhere) contribute much less to relevance than rare ones like `registerBlockBindingsSource`.

### Step 3 — score files lexically

`scoreFilesAcrossRepos` walks every doc symbol, looks up the files that define or fire it across all repo indexes, and accumulates per-file scores:

```
score(file) = Σ over matched symbols ( fileWeight(file) × idf(symbol) )
```

`fileWeight` boosts authoritative paths (`schemas/json/*.json` and `*.d.ts` × 2.0) and demotes noise (`*.story.tsx` and `icons/`/`fixtures/` × 0.1). The result is a flat list of `{repo, path, score, matchedSymbols}` sorted by score. Top-30 advances; the rest is dropped.

### Step 4 — re-rank with the LLM

The Reranker (`src/auto-map/rerank.ts`) sends the doc + the 30 candidates to Claude with a strict tool-use schema (`report_rerank`). The model has access to **no file contents** — only `{repo, path, score, matchedSymbols}` per candidate plus the doc markdown. The system prompt forces every rationale to be grounded in observable evidence (a name from `matchedSymbols`, a path-convention argument, or a slug-to-path correspondence) — hedge words like "likely contains" or "should define" are forbidden. The model returns each file classified as:

- **primary** (max 3): canonical implementation files; read these first.
- **secondary** (max 5): meaningfully implements/parses/validates/tests the same subject.
- **context** (max 8): related but not authoritative on its own.
- **dropped**: lexical match that's actually noise (single English-word collision, generic schema property, fixture/icon match).

Each kept file carries a confidence in [0, 1]. Files with confidence below **0.5** are filtered out at projection time — the rationale is in `MIN_INCLUSION_CONFIDENCE` in `orchestrator.ts`: the model's own self-rated confidence is honoured rather than fought.

The full re-rank result (rationales + confidences + dropped files) is written verbatim to `<site>.audit.json` for inspection. The canonical mapping JSON receives only `{repo, path}` — the locked `CodeTiers` shape.

### Step 5 — fall back to lexical-only on failure

If the LLM call errors, returns malformed output, or the API key is missing, the orchestrator falls back to `lexicalTiers`: top-3 by score → primary (capped at 1 schema file), next 5 → secondary, and for context it runs `findFilesByTreeHeuristic` — files whose **path** contains keywords from the slug (split on `-_/`, drop short and common words). This is also what `--no-rerank` produces directly. No audit file is written when the rerank step doesn't run.

---


## Gotchas

- **Slug renames break mappings silently.** If a doc's slug changes upstream, the mapping key becomes stale and the validator reports "no mapping found" for the new slug while the old key sits orphaned. Lint step is deferred — for now, grep is your friend.
- **Re-running auto-map overwrites your hand-tuning.** Treat regenerations as an active decision: diff the result against the previous version (`git diff`), keep what auto-map improved, and re-apply tuning that still applies.
