# Per-doc pipeline

How the pipeline iterates docs — what runs for each one, what is shared across them, and what the cost shape looks like.

For the Pass 1 + gate internals see [PASS1.md](./PASS1.md). For the mapping that decides which files end up in each doc's context see [MAPPING.md](./MAPPING.md). For why the validator is two-pass at all see [ARCHITECTURE.md → Drift Validator](../ARCHITECTURE.md#drift-validator). For load-bearing types (`Doc`, `CodeTiers`, `DocResult`, `RunResults`) see [GLOSSARY.md](../GLOSSARY.md). This doc is the operator-facing complement: the *loop* around all of those pieces.

---

## Where this sits

The orchestrator in `runPipeline` (`src/pipeline.ts`) fans out one independent validator invocation per doc, with bounded concurrency, and collects the results into a `RunResults`. Everything else in the validator stack — assembly, Pass 1, the gate, Pass 2 — runs *inside* one of those invocations.

```
fetchDocs() → Doc[]  (e.g. 150 docs)
              │
              ▼
     ┌──────────────────┐
     │  p-limit(3)       │   ← bounded concurrency, see below
     └────────┬─────────┘
              │  (up to 3 docs in flight)
   ┌──────────┼──────────┐
   ▼          ▼          ▼
 doc A      doc B      doc C       ← each runs a full validator-in-miniature
   │          │          │
   ▼          ▼          ▼
 DocResult  DocResult  DocResult
              │
              ▼
   Promise.all → DocResult[]
              │
              ▼
       RunResults (+ results.json, history.json)
```

For a 150-doc handbook the pipeline performs 150 independent `validateDoc` calls; three of them are in flight at any moment.

---

## The per-doc loop

The fan-out (`pipeline.ts:100-149`):

```ts
const limit = pLimit(3);                          // up to 3 docs at once

const docTasks = docs.map(doc =>
  limit(async (): Promise<DocResult> => {
    const codeTiers = mapper.getCodeTiers(doc.slug);          // 1. mapping
    return await validator.validateDoc(doc, codeTiers, codeSources);
                                                              // 2. Pass 1 + gate + Pass 2
  }),
);

docResults.push(...await Promise.all(docTasks));
```

Two notable wrapping behaviours, both pinned by the schemas test (`src/types/__tests__/schemas.test.ts`, `runPipeline` block):

- A `MappingError` thrown by `getCodeTiers` is caught in-place and turned into a `DocResult` with `status: 'not-mapped'`, `healthScore: null` (`pipeline.ts:106-125`). The doc is *not* sent to the validator.
- A throw from `validator.validateDoc` is caught and turned into a `DocResult` with `status: 'critical'`, the error captured in `diagnostics` (`pipeline.ts:127-147`). The run never aborts on a single bad doc.

Fetch failures from earlier in `fetchDocs()` are appended as their own diagnostic `DocResult`s after the main loop (`pipeline.ts:154-169`).

---

## What runs for each doc

Inside `validateDoc` (`src/adapters/validator/claude.ts:337`), each doc goes through six stages:

| # | Stage | Where | Cost | What it does |
|---|---|---|---|---|
| 1 | `assembleContext` | `claude.ts:342` | local | Runs extractors over the mapped files, applies the token budget to Section 6, runs the missing-symbol pre-pass. Output is the `assembled` bundle that becomes the user message. |
| 2 | `buildUserContent` | `claude.ts:357` | local | Concatenates the seven sections of the user message (see [PASS1.md → The user message](./PASS1.md#the-user-message-composed)). |
| 3 | `runPass1` × `samples` | `claude.ts:614` | **1 Claude call per sample** | One `messages.create` call with the cached system prompt and forced `report_findings` tool. With `samples > 1` (issue #56), unique candidates are unioned by fingerprint before the gate. |
| 4 | Verbatim gate | `claude.ts:414-453` | free (no LLM) | Two deterministic checks per candidate (`docSays` in doc, `codeSays` in file). See [PASS1.md → The verbatim check](./PASS1.md#the-verbatim-check-gate-function). |
| 5 | `runPass2` × *N* | `claude.ts:458-474` | **1 Claude call per survivor** | Sequential within the doc. Each surviving candidate gets re-read with `fetch_code` and either confirmed or dropped. Survivors are deduped by `type \| codeFile \| docSays` immediately on emission. |
| 6 | `buildDocResult` | `claude.ts:476-479` | local | Applies the health-score formula (see [ARCHITECTURE.md → Drift Validator](../ARCHITECTURE.md#drift-validator)) and packs the `DocResult`. |

Per-doc API cost:

```
1 × Pass 1                  (or `samples` × Pass 1 when samples > 1)
+ N × Pass 2                (N = candidates that survived the gate)
+ verbatim gate              free
+ dedup                      free
─────────────────────────
≈ (1 + N) Anthropic calls per doc
```

Aggregate for a 150-doc run: `150 × (1 + avg-N)` calls, with the cached system prompt amortised across all of them.

---

## Two load-bearing properties

### Per-doc independence

Each `validateDoc` call is fully self-contained:

- Its own `codeTiers` (per `mappings/<slug>.json`).
- Its own `assembled` bundle and user message.
- Its own `normalizedFileCache` — scoped to the call, not shared (`claude.ts:416`). The cache is pinned to the per-doc commit SHA picture; sharing across docs would require keying by SHA too. See [PASS1.md → Gotchas → Cache pollution](./PASS1.md#gotchas).
- Its own `droppedHallucinations` increment (the counter on the `ClaudeValidator` instance is shared, but only as a run-wide tally).

Pass 2 in doc A cannot influence Pass 2 in doc B — there is no cross-doc state in the validator. This is the precondition that makes `p-limit(3)` concurrency safe: three docs running in parallel do not interfere with one another.

The corollary: a doc that fails to validate (mapping error, validator throw, Pass 1 retries exhausted) cannot poison the rest of the run. The `try`/`catch` in `pipeline.ts:107-147` is the last fence; everything inside `validateDoc` is just bookkeeping for one doc.

### Shared prompt cache

The Anthropic prompt cache is **per-API-key, not per-call**. The system prompt is sent with `cache_control: { type: 'ephemeral' }` (`claude.ts` system-prompt assembly), so the first call in a run populates the cache and every subsequent Pass 1 and Pass 2 call hits it — across all 150 docs.

This is the primary cost lever. A 150-doc run might fire `150 + 150×avg-N` calls; the cached system prompt is paid once and served warm to all of them. Target hit rate >90% across the run (see [ARCHITECTURE.md → Drift Validator](../ARCHITECTURE.md#drift-validator)). The `logCostSummary` block at `pipeline.ts:49-65` reports the realised hit rate at the end of every run.

What follows from this:

- Tightening the verbatim gate reduces *N* (Pass 2 calls), which directly lowers run cost.
- Adding to the system prompt is cheap at runtime (cached after the first call) but raises the floor cost on every cache miss — keep it coherent rather than terse, but don't lard it.
- The cache works best when calls *arrive sequentially relative to the first one finishing*. Three concurrent first-calls race to populate; calls 4+ all hit warm. See the concurrency rationale below for why 3 was chosen rather than higher.

---

## Concurrency: why `p-limit(3)`

The number lives at `pipeline.ts:100` and is the smallest value that meaningfully exploits parallelism without breaking any of four constraints.

### Against 1 (fully sequential)

Wastes wall-clock time. Most per-doc runtime is `await` on Anthropic responses; a single-threaded loop idles waiting for network I/O. For a 150-doc handbook a sequential run takes roughly 3-5× longer than concurrency 3 for zero quality benefit.

### Against unbounded `Promise.all`

Breaks in four ways:

1. **Anthropic rate limits.** A 150-doc run firing dozens of simultaneous calls would trip per-minute request limits. Cache misses cluster too — many docs starting at once race to populate the cache instead of sharing a warm one.
2. **Local memory.** Each in-flight doc holds its assembled user message (up to ~50k tokens of source), `normalizedFileCache`, and partial result state. Bounding to 3 keeps the resident footprint predictable.
3. **Git clone serialisation.** `GitCloneSource` caches clones by `(repo, commitSha)`; the first request triggers the clone, subsequent ones reuse the cache. Under unbounded concurrency the first wave would race to clone the same repos N times before any of them finished. With 3, at most 3 races happen, and `getCommitSha` warm-up at `pipeline.ts:79-84` collapses most of them before the doc loop even starts.
4. **Cache hit-rate degradation.** Anthropic's prompt cache is most efficient when one call populates and subsequent calls hit. Many simultaneous cold calls are each treated as a miss. Concurrency 3 lets one call warm the cache while two others run; from call 4 onwards everything hits warm.

### What 3 protects, and what it leaves on the table

3 is the smallest number that gets measurable parallelism (three docs progress simultaneously, hiding most of the network wait) while staying comfortably inside the rate-limit envelope, memory footprint, and clone-cache behaviour. It also leaves headroom for retries and slow docs without pushing the run into the danger zone.

What it leaves on the table is absolute throughput. On a fast machine with a generous rate-limit tier, 5-10 might produce a faster wall clock at the cost of a slightly higher cache miss rate. The value is intentionally conservative — see [CLAUDE.md → Spend on context and model, not on guards](../../CLAUDE.md): the project's stance is don't optimise concurrency until the run becomes a problem. Today, 3 is fine; the constant is a single edit away.

The number is a heuristic. No test pins it. If you bump it to 6 and run a full handbook, expect a faster wall clock and a small dip in cache hit rate — measure before committing to a new constant.

---

## Gotchas

- **`MappingError` short-circuits before the validator runs.** A doc without a mapping ends up as `status: 'not-mapped'` with `healthScore: null` and is excluded from the overall-health average (`pipeline.ts:24-32`). It contributes one row to `totals.notMapped` and nothing else. If you expect a doc to be analysed and instead see `not-mapped`, the mapping is missing, not the validator failing.
- **Validator throws never abort the run.** They become per-doc `DocResult`s with `status: 'critical'`, `healthScore: 0`, and the error in `diagnostics` (`pipeline.ts:127-147`). To distinguish "real critical drift" from "validator threw," read `diagnostics` — a non-empty diagnostic with no `issues` is the throw case.
- **`samples > 1` multiplies Pass 1 calls, not Pass 2.** With `samples = 3`, each doc fires three Pass 1 calls, unions unique candidates by fingerprint, then the gate and Pass 2 run once per unique candidate. The cost grows with `samples`, not with `samples × N`.
- **Concurrency is per-pipeline, not global.** Two pipelines running in the same process (e.g. multi-site batch) each get their own `p-limit(3)`. Six concurrent Anthropic calls is well within limits, but be aware of the multiplication when running batches.
- **`normalizedFileCache` is per-doc.** Files are not shared across docs in a batch — a deliberate choice because each doc may pin a different commit SHA. If you change file reads to share across docs, also key the cache by `(repo, commitSha)`. See [PASS1.md → Gotchas → Cache pollution](./PASS1.md#gotchas).
- **The cost summary line is the run's receipt.** `logCostSummary` (`pipeline.ts:49-65`) prints docs / critical / major / minor / overall-health and the cache hit rate at the end of every run. The hit-rate number is the single best feedback signal that the prompt cache is working; if it drops below ~90%, suspect a system-prompt change that broke the cache key, or a run that started too many concurrent first-calls.
