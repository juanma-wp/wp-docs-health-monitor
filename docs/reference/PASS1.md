# Pass 1

How Pass 1 of the drift validator turns an assembled doc+code context into a verified set of candidate findings.

For the architectural rationale (why two passes, why structured tool use, why the verbatim check sits where it does) see [ARCHITECTURE.md → Drift Validator](../ARCHITECTURE.md#drift-validator). For the locked contract types (`Issue`, `RawIssue`, `ReportFindingsInput`) see [GLOSSARY.md](../GLOSSARY.md). For how files end up in sections 2-6 of Pass 1's user message see [MAPPING.md](./MAPPING.md). This doc is the operator-and-contributor-facing complement: how the call is *built*, how the gate *works*, and what gets *dropped* before Pass 2 sees anything.

---

## Where Pass 1 sits

The pipeline reaches Pass 1 after the doc has been ingested, its related code files mapped and assembled into a single user message, and the missing-symbol pre-pass has run. Pass 1 turns that input into a structured set of candidate findings, then a deterministic gate verifies that the model's evidence is real.

```
assembled context (Doc + tiered code + extractors)
            │
            ▼
   ┌──────────────────────┐
   │  Pass 1 — Claude call │   ← single Anthropic API call
   │  cached system prompt │     forced report_findings tool
   └──────────┬───────────┘
              │
              ▼
   Issue[] + up to 3 positives    ← structured output
              │
              ▼
   ┌──────────────────────┐
   │  Verbatim check      │      ← deterministic gate
   │  (gate function)     │        no LLM, no tokens
   └──────────┬───────────┘
        │     │
   drop │     │ keep
        ▼     ▼
   (silent)  Pass 2
```

Pass 1's output is candidates, not findings. The verbatim check is what makes the difference: until evidence is verified, an Issue is a *claim*, not a finding. Pass 2 then does the semantic re-check.

---

## What Pass 1 is

A single call to `anthropic.messages.create` (`src/adapters/validator/claude.ts:621`) with four inputs working together:

| Input | What it carries | Role |
|---|---|---|
| `system` | The cached system prompt | Drift definition, severity rubric, evidence rules, language packs, site extension |
| `messages` | The composed user message | The doc + tiered code + structured extractors + pre-pass hint (see [composition](#the-user-message-composed)) |
| `tools` | `[REPORT_FINDINGS_TOOL]` | JSON schema describing the output shape |
| `tool_choice` | `{ type: 'tool', name: 'report_findings' }` | Forces the model to emit a tool_use block, not free prose |

The response contains a single `tool_use` block whose `input` field is the structured output. Pass 1 parses it into `Issue[]` (candidate drift findings) and `string[]` (up to 3 evidence-backed positives, capped by the schema).

Nothing is *invoked* during this call — `report_findings` is a contract the model fills, not a function we run. See [The report_findings tool](#the-report_findings-tool) for the distinction.

---

## The three collaborating pieces

The verbatim rule is enforced across three layers, each with a different cost and a different failure mode.

| Layer | Encodes | Enforced by | Failure mode if removed |
|---|---|---|---|
| Tool schema (`REPORT_FINDINGS_TOOL`) | Shape: which fields exist, their types, the drift-type enum | Anthropic SDK rejects malformed tool calls | Free-form output flows in; downstream parsing breaks |
| `tool_choice` | "Use this tool, no prose" | Anthropic API | Model intermittently replies in prose; findings silently lost |
| System prompt (`prompts/system.md`) | Semantics: verbatim quote, contiguous span, direct contradiction | Model instruction-following (imperfect) | Model paraphrases without consequence; gate becomes the *only* enforcement |
| Runtime verbatim check (`verbatimIncludes`) | Final verification that the semantic rule held | Project code, deterministic | Fabricated quotes survive Pass 1 and reach Pass 2 + the doc author |

Each layer is narrow on its own. Together they form a commitment-and-verify pair: the schema and prompt force the model to *commit* to a quote; the runtime check *verifies* the commitment. Removing any one layer weakens the pair.

---

## The user message (composed)

The user message is built by `buildUserContent` (`src/adapters/validator/claude.ts:533`). It concatenates seven sections in this order, each with an inline authority note (telling the model what that section is authoritative for and what it is not):

1. **Documentation** — doc URL + full markdown content.
2. **Exported API symbols** — TS + PHP AST extraction: exported names, signatures, JSDoc/PHPDoc tags.
3. **Hooks and filters** — `do_action` / `apply_filters` / `addAction` / `addFilter` firing sites.
4. **Defaults** — extracted default-value sites (`wp_parse_args` calls, object-spread merges).
5. **Schemas** — JSON schema files (routed here instead of into Source Code).
6. **Source Code** — the tiered file blocks (`primary` / `secondary` / `context`), token-budgeted.
7. **Potentially removed APIs** — backtick-wrapped identifiers from the doc not found in any assembled source (the pre-pass output, only present when non-empty).

Sections 2-6 are all derived from the *same* mapped file list. The mapping defines "which files matter for this doc"; the assembler then runs every extractor over that list and surfaces each through the corresponding section. The token budget is applied only to section 6; structured extractors are not budgeted because their output is already compact.

Section 1 is the doc. Section 7 comes from the pre-pass (see [ARCHITECTURE.md](../ARCHITECTURE.md#drift-validator)).

---

## The `report_findings` tool

`REPORT_FINDINGS_TOOL` (`src/adapters/validator/claude.ts:95-133`) is a JSON Schema, not a function. It exists to constrain the *shape* of the model's output:

```jsonc
{
  "issues": [
    {
      "severity":   "critical" | "major" | "minor",
      "type":       "type-signature" | "default-value" | "deprecated-api"
                  | "broken-example" | "nonexistent-name"
                  | "required-optional-mismatch",
      "evidence":   { "docSays": string, "codeSays": string,
                      "codeFile": string, "codeRepo": string },
      "suggestion": string,
      "confidence": number 0..1
    }
  ],
  "positives": [ string ]   // maxItems: 3
}
```

The schema enforces:

- All four `evidence` fields are required strings.
- `severity` and `type` are constrained enums.
- `confidence` is bounded 0..1.
- `issues` is capped at `PASS1_MAX_ISSUES` items per doc.
- `positives` is capped at 3 items — deliberately small to force substantive picks.

What the schema *cannot* enforce, because JSON Schema cannot express it:

- Whether `codeSays` actually appears in `codeFile`.
- Whether `docSays` actually appears in the doc.
- Whether the codeSays/docSays pair *contradicts* each other rather than restates each other.

Those three constraints live in the system prompt as prose and are enforced post-hoc by the runtime verbatim check.

**`tool_choice: { type: 'tool', name: 'report_findings' }`** is the second half of this layer. Without it, the model could choose between calling the tool or replying in prose; with it, the only output path is a `tool_use` block matching the schema. The API enforces this — it is not a soft prompt rule.

---

## The system prompt

The system prompt (`src/adapters/validator/prompts/system.md`) carries everything the schema cannot:

- **What counts as drift** — the six drift-type taxonomy and what each one means.
- **Severity rubric** — critical / major / minor calibration with the impact filter (*"if a developer copies this part of the doc verbatim, will their code fail?"*).
- **Evidence rules** — the verbatim-quote requirement, single-contiguous-span rule, direct-contradiction rule, ellipsis prohibition, paraphrase prohibition.
- **Evidence-slot carve-outs** — when an empty `docSays` or `codeSays` is acceptable (for `nonexistent-name` and `broken-example`) and when it is not.
- **Authority guidance** — which input section is authoritative for which kind of claim (schemas for property names, source code for runtime behaviour, etc.).
- **Language pack rules** — JS/TS conventions (JSDoc, `*.d.ts` as surface contract) or PHP conventions (PHPDoc, `_doing_it_wrong()`), included via `validator.languagePacks` in the site config.
- **Site-specific rules** — appended after the common prompt via `config.validator.promptExtension` (`claude.ts:327-328`). This is where per-corpus carve-outs and the true/false-positive example list live.

The prompt is sent with `cache_control: { type: 'ephemeral' }`, so subsequent docs in the same run hit the Anthropic prompt cache rather than re-billing the prompt tokens. Target cache hit rate >90% — see [ARCHITECTURE.md](../ARCHITECTURE.md#drift-validator) for the cost rationale.

Crucially, the prompt **tells the model what the verbatim check does**:

> Non-contiguous or reformatted quotes are rejected by the verbatim check and the issue is dropped silently — at the cost of a real finding being lost.

This aligns the model's objective with the gate's. The model is incentivised to either find a literal quote or skip the finding — not to ship a paraphrase and hope.

---

## The verbatim check (gate function)

After Pass 1 returns, the validator loops over every candidate Issue and applies two deterministic gates (`src/adapters/validator/claude.ts:414-453`):

```js
const verbatimPassed = [];
const normalizedDoc = normalizeForVerbatim(doc.content);
const normalizedFileCache = new Map();

for (const issue of pass1Issues) {
  const { codeRepo, codeFile, codeSays, docSays } = issue.evidence;

  // Gate 1: docSays must be in the doc
  if (!verbatimIncludes(normalizedDoc, docSays)) {
    this.droppedHallucinations++;
    console.warn(`dropped: docSays not found in doc`);
    continue;
  }

  // Gate 2: codeSays must be in the file (skipped for nonexistent-name)
  const normalizedFile = /* read + normalize + cache */;
  const isAbsenceIssue = issue.type === 'nonexistent-name';
  if (!isAbsenceIssue && !verbatimIncludes(normalizedFile, codeSays)) {
    this.droppedHallucinations++;
    console.warn(`dropped: codeSays not found in ${codeRepo}:${codeFile}`);
    continue;
  }

  verbatimPassed.push(issue);
}
```

Two gate calls per issue; both must pass. Each `continue` is the diamond's "no" branch in the pipeline diagram. No LLM is consulted during this loop; the cost is microseconds per issue plus one file read per `(repo, file)` pair (cached after the first read).

### `normalizeForVerbatim`

The normaliser (`claude.ts:209`) is applied to both sides of every comparison. It collapses real-world authoring drift that the model can't reliably mirror:

| Drift | Example | Normaliser action |
|---|---|---|
| Whitespace, line breaks | Multi-line bullet list quoted as one line | `/\s+/g → " "` |
| Markdown link syntax | Doc has `[foo](url)`, model quotes `foo` | `[text](url) → text` |

What is *intentionally not* normalised: comment-continuation characters (`*` PHPDoc, `#` Python, `///` Rust), bold/italic emphasis markers, inline code backticks. Each of those carries semantic distinctions that stripping would erase. The decision rationale is documented inline in `claude.ts:195-208`.

### `verbatimIncludes` — three strategies

The check (`claude.ts:246-265`) tries three matchers in order, returning `true` on the first hit:

1. **Direct normalised match** — `haystack.includes(needle)` after both sides are normalised. The common path.
2. **Bullet-stripped match** — strips `- ` bullet markers from both sides and retries. Catches the case where the model quotes individual list items as `- foo` while the doc surface has a flat sentence. Guard: only activates when the needle contains a bullet pattern, to avoid spurious matches.
3. **Single backtick identifier** — when the needle is `` `identifier` ``, also tries matching the bare `identifier` against the haystack. Catches the case where the model added backticks to a property name that appears unquoted in the source.

Beyond these three, the gate gives up and returns `false`.

### Carve-outs

Two drift types are handled specially because their evidence is structurally different from "doc says X, code says Y":

- **`nonexistent-name`** — the API the doc references no longer exists. There is no code line to quote because the thing was deleted. Gate 2 is skipped entirely (`claude.ts:441-442`). The evidence is *absence*, captured by the pre-pass; the model is instructed to put the surrounding doc passage in `docSays` (or leave it `""` if no surrounding passage exists). Gate 1 still runs.
- **`broken-example`** — a doc snippet that would fail at runtime. The system prompt tells the model that an empty `codeSays` is acceptable when no comparison-code applies. An empty needle always passes the substring check (`haystack.includes("")` is true), so the gate is bypassed naturally without a code-level carve-out.

In both cases the corrective content goes in `suggestion`, not in an evidence slot.

### Drop semantics

When a gate fails:

- The Issue is **not** included in `verbatimPassed` — it never reaches Pass 2, never reaches the doc author.
- `this.droppedHallucinations` is incremented (a per-run counter exposed at `claude.ts:314`).
- A `console.warn` is logged with the slug, the failing field, and the value the model emitted. High-confidence drops (`confidence ≥ 0.9`) are tagged `[verbatim-check][high-conf]` to surface "the model was sure and still wrong" cases for prompt-tuning review.
- No retry. No second chance. The Issue is gone for this run.

---

## Diagnostics

Two seams exist for inspecting Pass 1 output:

**Raw Pass 1 dump (`DUMP_PASS1=1`).** Setting `DUMP_PASS1=1` in the environment (`claude.ts:655`) makes `runPass1` write the raw `report_findings` input to `/tmp/wp-docs-pass1-dump/pass1-<ts>.json` *before* the verbatim check runs. Useful for seeing exactly what the model emitted, including fabrications that will be silently dropped downstream. Targeted invocation:

```
DUMP_PASS1=1 npm run analyze -- --slug <slug> --config <config> --output ./out
```

**Dropped-hallucinations counter (`claude.ts:314`).** Each `ClaudeValidator` instance tracks how many issues were dropped by the verbatim check across the run. Read it from the instance after `analyzeDoc` returns, or expose it via a wrapper.

The `[verbatim-check]` warnings on stderr are the third diagnostic — every drop logs the slug, the field, and the offending string. Pipe stderr to a file when running a batch to retain them.

---

## Gotchas

- **Real lines paraphrased beyond the normaliser are silently dropped.** The normaliser only handles whitespace and Markdown links. A real line the model reformatted (e.g. PHPDoc continuation `*` stripped, `**bold**` markers added, indentation altered) will fail the gate even though the *meaningful* content is correct. The fix is to extend the normaliser or the fallback strategies with evidence — not to relax the gate.
- **Wrong-file quotes look identical to fabrication.** If the model quotes a real line but names the wrong file in `codeFile`, the gate reads the wrong file, doesn't find the quote, and drops the issue. The drop log will say "codeSays not found in <wrong-file>" — useful signal that the mapping or the model's file selection is off.
- **The verbatim check doesn't catch semantic errors.** A real line quoted from the correct file is not the same as a real *contradiction*. The model can quote a perfectly real line that doesn't actually contradict the doc, and the gate will let it through. That's Pass 2's job — it re-reads the region with `fetch_code` and decides whether the contradiction actually holds.
- **`nonexistent-name` relaxes only Gate 2.** Gate 1 (`docSays in doc`) still runs. The model is expected to quote a real surrounding passage from the doc, or leave `docSays` empty.
- **Empty slots are not the same as missing slots.** The schema requires the field to exist; an empty string satisfies that. The verbatim check then auto-passes on empty needles (`includes("")` is true). The model uses this — with prompt guidance — to opt out of evidence slots cleanly rather than fabricating to fill them.
- **Cache pollution.** `normalizedFileCache` is per-call, scoped to one doc. Files are not shared across docs in a batch — a deliberate choice because each doc may pin a different commit SHA. If you change file reads to share across docs, also key the cache by commit SHA.
