# Pass 2

How Pass 2 of the drift validator turns each Pass-1 candidate that survived the verbatim gate into a final `Issue`, using an agentic `fetch_code` loop and four post-loop filters.

For Pass 1 + the verbatim gate that feeds Pass 2 see [PASS1.md](./PASS1.md). For the per-doc loop that wraps Pass 2 (the *N* survivors arrive from there) see [PER-DOC-PIPELINE.md](./PER-DOC-PIPELINE.md). For the architectural rationale (why two passes, why an agentic shape, what Pass 2 buys over Pass 1 alone) see [ARCHITECTURE.md → Drift Validator](../ARCHITECTURE.md#drift-validator). For locked types (`Issue`, `RawIssue`, `ReportFindingsInput`, `FetchCodeInput`) see [GLOSSARY.md](../GLOSSARY.md). This doc is the operator-and-contributor-facing complement: how each verification *runs*, what causes findings to be *dropped*, and which knobs are real levers vs. coupled constants.

---

## Where Pass 2 sits

Pass 2 is reached after a doc's Pass 1 candidates have cleared the verbatim gate. It does not run on every Pass 1 candidate — only on the *N* survivors. Each survivor gets its own verification; nothing is batched.

```
verbatimPassed: RawIssue[]   ← N survivors from the gate
        │
        ▼  (sequential within the doc)
   ┌──────────────────────────┐
   │  for each candidate:     │
   │    runPass2(candidate)   │   ← one verification per survivor
   └──────────┬───────────────┘
              │
              ▼
   ┌──────────────────────────┐
   │  Issue | null            │   ← keep or drop
   └──────────┬───────────────┘
              │
              ▼
   dedup by (type | codeFile | docSays)
              │
              ▼
   finalIssues: Issue[]
```

So for one doc with *N* gate survivors, Pass 2 runs *N* verifications. Each verification is its own bounded agentic loop (see below), not a single API call.

---

## What "one Pass 2" looks like

The orchestrator loops over survivors at `claude.ts:458-474`:

```ts
const finalIssues: Issue[] = [];
const seenKeys = new Set<string>();
for (const candidate of verbatimPassed) {
  const verified = await this.runPass2(candidate, codeSources, doc.slug);
  if (verified) {
    const key = `${verified.type}|${verified.evidence.codeFile}|${verified.evidence.docSays}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      finalIssues.push(verified);
    }
  }
}
```

Two things to note:

- **Sequential within the doc.** Survivors are verified one after another, not in parallel. The reason isn't documented in code, but the practical effect is that the prompt cache warms cleanly on the first verification and every subsequent one hits warm. Concurrency *across* docs is still 3 (see [PER-DOC-PIPELINE.md → Concurrency](./PER-DOC-PIPELINE.md#concurrency-why-p-limit3)).
- **Dedup happens immediately.** The first survivor with a given `(type, codeFile, docSays)` triple wins; later duplicates from the same doc are dropped with a `[dedup]` warn. This catches the case where Pass 1 surfaced the same finding twice with slightly different evidence quotes — both pass the gate, both get verified, only one ships.

---

## The agentic loop (inside one verification)

`runPass2` (`claude.ts:692-777`) is a bounded turn loop. Each turn is one `anthropic.messages.create` call; the loop ends as soon as the model invokes `report_findings` (or hits the 10-turn cap, or sees an unexpected `stop_reason`).

```
turn 0 ────────────────────────────────┐
  ┌───────────────────────────────┐    │
  │  messages.create               │   │
  │    tools: [fetch_code,         │   │
  │            report_findings]    │   │
  │    tool_choice: { type: 'any' }│   │
  └────────────┬──────────────────┘    │
               │ stop_reason            │
        ┌──────┴──────┐                  │
        ▼              ▼                  │
   tool_use         end_turn ── break ────┤
        │                                 │
   ┌────┴─────────┐                       │
   ▼              ▼                       │
fetch_code   report_findings              │
   │              │                       │
   ▼              ▼                       │
read region   capture result              │
push tool_   ───── break ─────────────────┤
result back                               │
   │                                      │
   └──── next turn (up to 10) ────────────┘
```

In practice most verifications finish in **2–3 round-trips**: one `fetch_code` turn (model asks to inspect a region), one `tool_result` turn (orchestrator returns the bytes), one `report_findings` turn (model commits to a verdict). The 10-turn cap is a safety boundary, not the operating point.

### The two tools

The model has exactly two tools available, declared at `claude.ts:135-148` and `claude.ts:95-133`:

| Tool | Purpose | Effect on the loop |
|---|---|---|
| `fetch_code(repo, path, startLine, endLine)` | Ask the orchestrator to read a region of a file in one of the configured code sources. | The orchestrator calls `codeSources[repo].readFile(path, start, end)`, pushes the bytes back as a `tool_result`, and continues the loop. Errors return `"Error fetching code: …"` rather than throwing — the model can see the error and try a different file. |
| `report_findings` | Commit to a verdict: 0 or 1 issues, plus 0–3 positives. | The first `report_findings` block ends the loop. Its `input` becomes `result` and gets carried into the post-loop filters. |

The pairing matters: `fetch_code` is "ask for more"; `report_findings` is "I'm done." `tool_choice: { type: 'any' }` (`claude.ts:725`) tells the API "you must call one of these tools each turn" — the model cannot reply in prose. This is what gives the loop deterministic shape: every turn either fetches more code or commits.

### What "agentic" means here

Pass 1 gets the model a curated, token-budgeted assembled context up front — all seven sections of the user message, pre-staged. The model never asks for more bytes; it works with what it was given.

Pass 2 inverts that. The model sees only the candidate (a JSON-serialised `RawIssue`) and the cached system prompt. It then *drives its own context-gathering* by calling `fetch_code` for whatever region it wants to inspect. The orchestrator is a tool runner, not a context broker.

That's what "agentic" means in this context: **the model decides what to fetch next, instead of the orchestrator pre-staging context.** The loop is bounded at 10 turns as a safety cap, not as a target; if a verification needs more than 2–3 round-trips it usually means the candidate is non-obvious (e.g. the model is comparing multiple files to resolve authority) — exactly when extra turns are worth the cost.

---

## The user message and system prompt

The system prompt is the **same** `SYSTEM_PROMPT` as Pass 1, with the same site extension appended (`claude.ts:716-722`). Pass 2 does not have its own prompt. This is a deliberate (if implicit) decision: drift definitions, severity rubric, evidence rules, and authority guidance apply identically to both passes; only the *job* differs.

The user message is short — built inline at `claude.ts:697-705`:

```
Re-evaluate this candidate issue using the fetch_code tool to inspect the relevant code region.
Confirm or reject the issue. If confirmed, ensure the suggestion is specific.

Issue:
<JSON-serialised RawIssue>
```

Two prompt instructions matter:

- **"Confirm or reject."** Pass 2's primary job is a yes/no on the candidate. The model is expected to either re-emit a verified `Issue` or emit zero issues. There is no "partial confirmation" output shape.
- **"Ensure the suggestion is specific."** The model is told upfront that vague suggestions are unacceptable. This is what the post-loop `isWeakSuggestion` gate (below) enforces deterministically.

---

## Drop conditions (the four filters)

When the loop exits, `result` either holds a `ReportFindingsInput` or is `null` (the latter only on unexpected `stop_reason`). The candidate is then run through four filters in order (`claude.ts:779-803`); failing any one drops the finding:

| # | Filter | Where | Effect |
|---|---|---|---|
| 1 | `result.issues.length > 0` and `rawIssue` defined | `claude.ts:779-782` | Zero-issue results are the explicit "reject" path. Returns `null` silently. |
| 2 | `rawIssue.confidence ≥ 0.7` | `claude.ts:784-785` | Hard floor on Pass 2's re-scored confidence. See [§ The 0.7 constant](#the-07-confidence-constant) below. |
| 3 | `rawIssue.suggestion` defined and not self-rejected | `claude.ts:787-791` | Catches malformed responses (missing field) and the case where the model rejects its own finding in the suggestion prose (e.g. "Rejected: not actually drift"). |
| 4 | `!isWeakSuggestion(rawIssue.suggestion)` or retry succeeds | `claude.ts:793-803` | Generic suggestions ("update the documentation") are dropped. Critical/major findings get one retry; minor findings drop without retry. |

If all four pass, `runPass2` constructs the final `Issue` (with a fingerprint, `claude.ts:806-813`) and returns it.

### The 0.7 confidence constant

The number lives in two places:

- **Prompt** — `prompts/system.md` → "Confidence" section: *"Rate your confidence from 0.0 to 1.0. Only report issues you are confident about (≥ 0.7). When in doubt, omit."*
- **Code** — `claude.ts:785`: `if (rawIssue.confidence < 0.7) return null;`

Origin: both landed in the very first validator commit (`28e1a87`, 24 Apr 2026). The number was a design hypothesis — a round "high confidence" cutoff — with a documented fallback to `≥ 0.8` if Pass 2 were ever cut entirely (see `PLAN.md:170-172`, `ARCHITECTURE.md:205`). No precision/recall sweep grounded the choice.

What it actually does today: **very little active filtering.** The model is told to omit < 0.7 findings upstream, so the code-level check almost never fires. Across stored runs in `out/data/runs/*/results.json`, the distribution of confidences that reach the code filter is:

| Band | Share of findings |
|---|---:|
| ≥ 0.95 | ~68% |
| 0.90–0.94 | ~16% |
| 0.85–0.89 | ~8% |
| 0.80–0.84 | ~5% |
| 0.70–0.79 | ~3% |
| < 0.70 | 0% |

The zero in the bottom row is the giveaway: the prompt is the active filter; the code threshold is a defense-in-depth guardrail. Raising the code value in isolation (e.g. to `0.85`) drops ~3% of findings — a tiny perturbation. Lowering it changes nothing (the model still self-censors).

For the threshold to become a real tuning knob it has to be **decoupled** from the prompt: instruct the model to use its full confidence range without self-censoring, then sweep the code-level floor against the captured `DUMP_PASS1` corpus. Today, treat `0.7` as a name for "the prompt-and-code agreement on a high-confidence floor," not as a parameter you can tune in isolation.

### Weak-suggestion detection and retry

`isWeakSuggestion` (`claude.ts:265-278`) is a deterministic check on the `suggestion` field. A suggestion is weak if any of:

- It matches one of the generic-only phrases — `/^update (the )?documentation\.?$/i`, `/^revise (this )?section\.?$/i`, etc. (`GENERIC_ONLY_PHRASES`, `claude.ts:154-160`).
- It contains no code-identifier-like token (`CODE_IDENTIFIER_PATTERN`, `claude.ts:162` — matches backtick-quoted tokens, camelCase, snake_case, function-call syntax, file paths, file extensions).
- It is short (≤ 8 words) *and* contains no identifier.

When the suggestion is weak the validator branches on severity (`claude.ts:793-803`):

- **`minor` → drop without retry.** A vague suggestion on a minor finding isn't worth a second API call.
- **`critical`/`major` → retry once.** `retryWeakSuggestion` (`claude.ts:818-861`) appends `"The suggestion is too generic. Rewrite it to name the exact function, parameter, or line that needs to change."` to the conversation history and asks for a re-emitted finding, this time with `tool_choice: { type: 'tool', name: 'report_findings' }` (forced). If the retry still produces a weak suggestion, drop.

The retry conversation re-uses the previous turns' context (including any `fetch_code` results), so the model isn't asked to re-fetch.

### Self-rejection detection

`isSelfRejected` (`claude.ts:172-175`) catches the case where the model uses the suggestion field to disagree with its own finding — e.g. `"Rejected: this is not actually drift, the doc is correct"`. Patterns include `/^rejected[:\s]/i`, `/no change (needed|required)/i`, `/should be rejected/i`, etc. (`claude.ts:164-169`).

This filter exists because `tool_choice: { type: 'any' }` lets the model emit `report_findings` even when it wants to reject — and sometimes it does, then uses the suggestion to say so in prose rather than emitting an empty `issues` array. Without this filter those would ship as findings.

---

## Cost accounting

Each turn (both in the main loop and in the retry) accumulates into `costAccumulator`:

```ts
this.costAccumulator.inputTokens         += response.usage.input_tokens;
this.costAccumulator.outputTokens        += response.usage.output_tokens;
this.costAccumulator.cacheReadTokens     += response.usage.cache_read_input_tokens    ?? 0;
this.costAccumulator.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;
```

Pass 2's input tokens grow turn-over-turn within a single verification: each turn re-sends the full conversation history (system prompt + user prompt + every prior assistant response + every `tool_result`). The system prompt is cached; the conversation history is not. So a 5-turn verification pays for the conversation context roughly 5×.

This is part of why short verifications (2–3 turns) are operationally better than long ones — not just from latency, but from input-token amortisation. The 10-turn cap is the worst-case bound.

---

## Configuration knobs

| Knob | Where | Effect |
|---|---|---|
| `pass2Model` | `config.validator.pass2Model` → constructor | Model used for both the agentic loop and the retry. Decoupled from `pass1Model`. |
| `temperature` | `ClaudeValidatorOptions.temperature` (default `0`) | Applied to every `messages.create` in Pass 2 (loop turns and retry). Deterministic by default. |
| `tool_choice` | Hard-coded `{ type: 'any' }` (loop) and `{ type: 'tool', name: 'report_findings' }` (retry) | Not config-driven. The retry's forced tool is what guarantees the retry produces something. |
| Turn cap (10) | Hard-coded at `claude.ts:711` | No config knob. Bumping it would mostly matter for adversarial cases where the model keeps fetching without committing. |
| Confidence floor (0.7) | Hard-coded at `claude.ts:785` + prompt | Coupled with the prompt; see [§ The 0.7 constant](#the-07-confidence-constant) for why this isn't really a tunable knob today. |

---

## Diagnostics

Pass 2 has no direct equivalent of `DUMP_PASS1`. The closest signals are:

- **`[dedup] dropped duplicate issue …`** (`claude.ts:468`) — same `(type, codeFile, docSays)` shipped twice.
- **`Pass 2 failed for issue in <slug>: …`** (`claude.ts:472`) — a throw from `runPass2`; recorded in `diagnostics` on the `DocResult`, the candidate is silently dropped.
- The cost summary line at end-of-run reflects Pass 2 turns aggregated across all verifications across all docs — `(input - cache hit) ≈ Pass 2 conversation tokens` if you back out Pass 1.

For deeper inspection, add a second dump seam (mirroring `DUMP_PASS1`) inside `runPass2` that writes each `(turn, response)` pair to disk. There is no such seam today.

---

## Gotchas

- **The loop never re-verifies `codeSays` against fetched bytes.** Pass 2 can `fetch_code` from a different file than the candidate's `evidence.codeFile`, see something useful there, and emit a confirmation — while `evidence.codeFile` still names the original. The dedup key includes `codeFile`, so this can also pollute dedup. There is no code-level guard for "the fetched region must overlap the claimed `codeFile`."
- **`isWeakSuggestion` doesn't see severity in the regex layer.** It matches the same `GENERIC_ONLY_PHRASES` regardless of severity; the severity branch only decides whether to retry. A suggestion like `"update the documentation"` on a critical finding triggers a retry even if the *issue itself* is rock-solid — that's by design (the suggestion needs to be actionable) but worth knowing.
- **System prompt is shared with Pass 1.** Pass 2 inherits every authority rule, drift definition, and site extension that was written with Pass 1 in mind. There is no Pass-2-specific section. If a rule needs to apply only at verification time, today there is no clean home for it — either inline it into the Pass 2 user prompt (`claude.ts:697-705`) or carve out a `## Pass 2 verification` section in the common prompt.
- **The 10-turn cap is silent.** If the loop hits turn 10 without `report_findings`, `result` stays `null` and the candidate is dropped without a diagnostic. A loud warn here would surface "model kept fetching without committing" cases for prompt-tuning review.
- **`fetch_code` line ranges are unbounded.** The tool schema requires `startLine ≥ 1` and `endLine ≥ 1`, but does not cap the span. A `fetch_code(start=1, end=99999)` is a legal call. The cost shows up in the next turn's input tokens. In practice the model picks reasonable ranges; the absence of a cap is a latent risk, not an observed problem.
- **The agentic loop can't reach Pass 1's pre-pass output.** The "Potentially removed APIs" section that Pass 1 sees (the missing-symbol pre-pass; see [PASS1.md → The user message](./PASS1.md#the-user-message-composed)) is not in Pass 2's user prompt. For `nonexistent-name` candidates Pass 2 has to re-discover the absence by failing to find the identifier via `fetch_code` — which it generally does, but with extra turns.
- **Confidence and threshold are coupled, not independent.** Treat `0.7` as a name for "the prompt-and-code agreement on a high-confidence floor," not as a parameter you can tune in code alone. See [§ The 0.7 constant](#the-07-confidence-constant).
