# Open-source models — what we tried, what we learned, where next

**Status**: planning + retrospective. 2026-05-21.
**Pairs with**: [next-steps.md](./next-steps.md) (the project's main working plan — this doc is orthogonal to it).
**State of `main` at time of writing**: **no OSS-model support has landed**. All three exploration arcs below are open PRs (#45, #51, #91, #92). The Anthropic-only `ClaudeValidator` at `src/adapters/index.ts:49-63` is what main ships.

---

## Why this doc exists

The validator's quality is gated by model quality, and the model bill is the dominant cost driver — at $5 per ~16-doc Gutenberg run on Sonnet, scaling to several corpora (per [second-site-experiment.md](./second-site-experiment.md)) becomes meaningful. Two open questions follow naturally:

1. **Cost** — can we get comparable validator quality from cheaper inference (open-source models served locally or via a budget gateway)?
2. **Sovereignty / offline** — can the pipeline run with no key, no network, on a maintainer's laptop, even if quality degrades?

Over the past few weeks three exploration arcs have addressed pieces of those questions in parallel:

- **Arc A (local Ollama)** — PRs [#45](https://github.com/juanma-wp/wp-docs-health-monitor/pull/45) (the `LLMClient` abstraction + `OllamaLLMClient`) and [#51](https://github.com/juanma-wp/wp-docs-health-monitor/pull/51) (`responseMode: "single-prompt"` for models that can't emit OpenAI-shape tool calls).
- **Arc B (OpenRouter as Anthropic-shape proxy)** — PR [#91](https://github.com/juanma-wp/wp-docs-health-monitor/pull/91) wires `provider: "openrouter"` against `https://openrouter.ai/api/v1/anthropic`, plus PR [#92](https://github.com/juanma-wp/wp-docs-health-monitor/pull/92) adds a forward-compat `validator.format` field for later protocol expansion.
- **Arc C (managed OSS inference, deferred)** — Groq / Together / Fireworks for 70B-class OSS models that don't fit on consumer hardware. Discussed on PR #45 but not yet attempted.

None of the four PRs have merged. This doc captures **what the experiments actually showed** so the next person picking up OSS-model work doesn't redo the diagnostics, and so the decision about whether to invest further is grounded in evidence.

---

## Arc A — Local models via Ollama (PRs #45 + #51)

### What was built

**PR #45** introduces a thin `LLMClient` port:

- `LLMClient` interface in `src/adapters/validator/llm-client.ts` (new).
- `AnthropicLLMClient` wrapping `@anthropic-ai/sdk` (preserves prompt caching).
- `OllamaLLMClient` against Ollama's OpenAI-compatible `/v1/chat/completions` endpoint — zero new dependencies (uses native `fetch`), strips `<think>...</think>` tokens for `qwen3` models.
- `ToolUseValidator` (renamed from `ClaudeValidator`) — same two-pass logic, now provider-agnostic.
- Config schema: `validator.type: 'claude'` → `validator.provider: 'anthropic' | 'ollama'`.
- A ready-to-run `config/gutenberg-block-api.ollama.json` pinned to `qwen2.5-coder:7b` + `qwen3-coder:30b`.

**PR #51** complements that by adding `validator.responseMode: 'tool-use' | 'single-prompt'`. The single-prompt path is for endpoints/models that can't reliably emit OpenAI-shape `tool_use` blocks: it asks Pass 1 to return JSON inline, then runs the same safeguards (verbatim gate, confidence ≥ 0.7, weak-suggestion retry for critical/major, dedup, fingerprinting). The two PRs are independent and orthogonal — PR #45 swaps the transport; PR #51 swaps the response envelope — but together they cover the realistic surface of "local model that may or may not speak tool-use cleanly."

### What works

- **The abstraction is sound.** `LLMClient` cleanly separates transport from validator logic. The two-pass safeguard set (verbatim, confidence threshold, retry, dedup) survives the swap. PR #51's `single-prompt` mode hardens the JSON-extraction path (brace-depth candidate scanning + shape selection), which makes it materially more tolerant of noisy model output than the tool-use path.
- **Local transport is reliable end-to-end.** Across `hermes3:8b`, `mistral-small3.2`, and `mistral-nemo`, the `OllamaLLMClient` round-trips a schema-valid `RunResults`, the dashboard renders, and Pass-1 file selection (`relatedCode` / `includedInAnalysis`) is consistent with the Anthropic baseline. Wire-format problems do not corrupt the rest of the pipeline.
- **PR #51's manual test passed cleanly against Anthropic-Claude.** All five safeguards verified, verbatim drop rate under 30 %, retry-recovery observed, dashboard parity with `tool-use` mode. The single-prompt path is *implementation-ready* — what's missing is a model that benefits from it.
- **Diagnosis infrastructure exists.** Progress logging (commit `7cc31b5`) emits `[ollama] → request` / `← response` around every call so a slow local model is distinguishable from a deadlock. This was earned during these runs and is a load-bearing investment.

### What doesn't work

This is where the honest answer lives. Across every local model tested on Gutenberg Block API (10 mapped docs of 16, same config as the Anthropic baseline):

| Backend (Pass 1 / Pass 2) | Issues | Positives | Output tokens | Wall time | Notes |
|---|---:|---:|---:|---:|---|
| `claude-sonnet-4-6` (Anthropic baseline) | **12** (1C / 7M / 4m) | 30 | 51,415 | ~7 min | The bar. |
| `qwen2.5-coder:7b` / `qwen2.5-coder:14b` | 0 | 0 | 6,912 | — | **Wire-format mismatch** — emits tool call as JSON inside `content`, Ollama's shim returns `tool_calls: null`. Adapter correctly produces empty `toolCalls`. |
| `deepseek-coder-v2:16b` | 0 | 0 | 0 | — | **No tool support** — HTTP 400 "does not support tools" on every Pass 1. |
| `llama3.1:8b` | 0 | 0 | 4,024 | — | Tool layer works. Capability gap — model doesn't surface drift even on a deliberately broken doc/code pair. |
| `hermes3:8b` | 0 | 0 | 3,539 | ~4 min | Same shape as llama3.1:8b — protocol OK, no drift surfaced. |
| `mistral-small3.2` | 0 | 0 | **531** | ~17 min | Worst result. Slower than Sonnet on the same docs, 3× `Pass 1 failed: TypeError: fetch failed`, bails out of structured output entirely. |
| `mistral-nemo` | 0 | 0 | 5,727 | ~8 min | Protocol OK, no drift surfaced. |

The three failure modes are distinct and live at different layers:

1. **Wire-format mismatch** (`qwen2.5-coder:*`). Curl probe against `localhost:11434/v1/chat/completions` confirmed the model emits the correct tool name + arguments — *inside `content` as a JSON blob* — while `tool_calls` comes back `null`. This is a Qwen 2.5-coder training quirk that Ollama's compat shim doesn't translate. **Fixable** in principle: either swap models, or teach `OllamaLLMClient` to lift inline-JSON tool calls into `toolCalls`. PR #51's `single-prompt` mode is the *cleanest* fix — it sidesteps the tool-calling envelope entirely.
2. **No tool support** (`deepseek-coder-v2`). Hard 400 from Ollama. Not fixable at the adapter layer; the model is unsuitable. `single-prompt` mode (PR #51) would also unblock this.
3. **Capability gap** (everything else that ran cleanly). The pipeline gets non-empty tokens out, the model picks reasonable files in Pass 1, but Pass 2 returns `issues: []` and `positives: []` on docs where Sonnet finds 12 real drift items. This is not a wiring problem — it's a model-quality problem.

The hardware ceiling sharpens the capability gap further. On the available test machines (32 GB M1, 48 GB M3 Max) the practical Ollama weights budget is ~22–38 GB. That **rules out** `llama3.3:70b`, `qwen2:72b`, and `command-r-plus` at Q4 quality — exactly the models that would be plausible candidates for closing the capability gap. Running them at Q2/Q3 to fit recreates the same "doesn't drill in" failure mode the 8B-class models already produced.

### Net read on Arc A

The wire-format and no-tool-support failures are tractable — between PR #51's `single-prompt` mode and an inline-JSON fallback in `OllamaLLMClient`, both can be designed around. The capability gap is **the blocker**, and no local model that fits on consumer hardware (32–48 GB unified memory) has surfaced even one drift finding on Gutenberg where Sonnet finds 12. Until that changes, local Ollama is real for the offline / zero-cost use case (which is itself valuable) but not a quality substitute. PR #45's reviewer recommendation — ship as "experimental" — is the honest framing.

---

## Arc B — OpenRouter via Anthropic wire format (PRs #91 + #92)

### What was built

**PR #91** adds `validator.provider: 'anthropic' | 'openrouter'` to the config schema and threads it through `createValidator` in `src/adapters/index.ts`. When `provider: 'openrouter'`, the Anthropic SDK is constructed with `baseURL: https://openrouter.ai/api/v1/anthropic` and the key is read from `OPENROUTER_API_KEY` (override via `apiKeyEnvVar`). After review feedback, guardrails were tightened in commit `5e42edd`:

- Rejects `pass1Model` / `pass2Model` that don't carry the `anthropic/...` prefix.
- Rejects `baseUrl` pointing at `/api/v1` (the OpenAI-compatible endpoint).

**PR #92** is schema-only: adds `validator.format: z.literal('anthropic').default('anthropic')` as a stable extension point for a later protocol expansion. Dead config today; the value lands when a non-Anthropic wire format gets implemented.

### What works

- **Backward compatibility preserved.** `provider` defaults to `'anthropic'` and `format` defaults to `'anthropic'`. Existing configs (`config/gutenberg-block-api.json`) parse and run unmodified.
- **Eager validation.** Missing key → constructor throws, not a per-doc diagnostic deep in the pipeline. Wrong model ID / wrong base URL → constructor throws too, after the 2026-05-20 hardening.
- **Test coverage is solid.** Schema defaults, provider rejection paths, custom `apiKeyEnvVar`, and model-ID / base-URL guards are pinned by `src/config/__tests__/schema.test.ts` and `src/adapters/__tests__/index.test.ts`.
- **The PRs are narrowly scoped.** PR #91 is ~30 source lines + tests; PR #92 is 1 schema field + tests. Both pass `path-gate` and are mergeable on their own merits without unblocking the rest of the OSS story.

### What doesn't work — and why this matters

**The headline limitation: as wired, PRs #91 + #92 cannot run open-source models.** This was clarified explicitly in the 2026-05-11 PR #91 follow-up review and not yet addressed:

The `ClaudeValidator` uses `anthropic.messages.create({ ... })` directly with Anthropic-format `tools`, `tool_choice`, `tool_use` content blocks, and Anthropic-specific usage fields (`cache_read_input_tokens`, `cache_creation_input_tokens`). OpenRouter's `/api/v1/anthropic` endpoint **only proxies Anthropic models**. Running `openai/gpt-4o` or `meta-llama/llama-3.3-70b-instruct` through this path is blocked by:

1. The model-ID guard added in `5e42edd` (`pass1Model` must start with `anthropic/`).
2. The base-URL guard rejecting `/api/v1`.

These are deliberate, after-the-fact guardrails — not bugs. The PR's scope was explicitly narrowed to "Anthropic-shape transport through OpenRouter," and the OpenAI-compatible path was deferred to a future PR that introduces a proper `LLMClient` port (mirroring PR #45's abstraction, but living on `main`).

The user's local manual-test artifact (`pr-92-testing-instructions.md` in the working tree) walks through pointing at `https://openrouter.ai/api/v1` with `openai/gpt-4o` — and the post-hardening guards now correctly reject this configuration at validator construction. The artifact was written before the 2026-05-20 hardening; its `openai/gpt-4o` end-to-end section is no longer reachable through PR #91 as it stands.

### Net read on Arc B

PR #91 is genuinely useful **for Anthropic models**: it gives users a way to route through OpenRouter for billing/aggregation reasons without changing model behavior. It is **not** the OSS-model story it was originally explored as. PR #92 prepares the seam for the real OSS path. Both can merge as-is; the OSS-model question lives in a follow-up that's not yet open.

---

## Arc C — Managed OSS inference (Groq / Together / Fireworks) — discussed, not attempted

The PR #45 thread surfaced a third path: pay-per-token gateways that host 70B-class OSS models behind OpenAI- or Anthropic-compatible APIs:

| Model | Provider | Approx. cost per validator run* |
|---|---|---|
| `llama3.3:70b` | Groq | ~$0.002 |
| `llama3.3:70b` | Together AI | ~$0.003 |
| `llama3.3:70b` | Fireworks AI | ~$0.003 |
| `qwen2.5:72b` | Together / Fireworks | ~$0.003–0.004 |
| `command-r-plus` | Cohere API | ~$0.02 |

*Estimated at ~3k input + ~500 output tokens per doc. Sonnet baseline is ~$0.30/doc, so 100×–150× cheaper if quality holds.

This sidesteps both Arc-A failure modes — wire-format is owned by the provider, and 70B-class capability is fully available — at the cost of giving up the offline story. **No experiments have been run.** Groq + `llama3.3:70b` is the strongest single bet on the table (same Llama family whose tool-call format is already proven to work in our harness via the `llama3.1:8b` runs, full Q4 quality, 128k context, cheapest of the credible options).

---

## Cross-arc summary

### What works

- **The `LLMClient` abstraction (PR #45) is the right shape.** It cleanly separates transport from validator logic and is the natural home for any future provider (OpenRouter-OpenAI, Groq, Together). Moving it onto `main` unlocks every subsequent OSS experiment.
- **The single-prompt validator mode (PR #51) is implementation-ready.** It's the right escape hatch for models that can't emit Anthropic-shape tool calls. It currently exists in isolation — wired only to the Anthropic client — but its design generalises.
- **OpenRouter as a transport (PR #91) works for Anthropic models** and the guardrails prevent misconfiguration. It's a useful billing/aggregation feature even if it isn't the OSS story.
- **Diagnosis seams exist and were earned the hard way.** `DUMP_PASS1=1` (already on main), the `[ollama] → / ←` progress logs, and the curl-probe pattern documented on PR #45 form a coherent diagnostic ladder. Don't lose them.

### What doesn't

- **No local model that fits on 32–48 GB unified memory has surfaced even one drift finding** on Gutenberg where Sonnet finds 12. This is the dominant blocker for Arc A's quality story.
- **PR #91 cannot run actual OSS models.** It runs Anthropic models *through* OpenRouter. The OpenAI-compatible path was deferred and is not yet in flight.
- **Three PRs have been open for ~3 weeks.** PR #45 has unaddressed Backend-Engineer review items (the `CostAccumulator` type-leak and the `parseArguments` silent failure). PR #51 is review-clean but unmerged. PR #91 and #92 are review-clean but unmerged. Drift between branches and `main` will keep widening if this is left alone — `main` has already moved through merge cycles since PRs #45 and #51 were opened.
- **The `LLMClient` abstraction exists twice in unmerged form** — once in PR #45's `tool-use-validator.ts` rename, and once *conceptually* in the OpenRouter follow-up that PR #91's reviewer described but didn't open. Whoever picks this up next should reconcile, not duplicate.

### The real question

Three weeks of OSS-model experimentation has produced two answers in tension:

- **Local Ollama is real but lossy.** Ships the offline / zero-cost story. Does not ship validator-quality parity at hardware sizes anyone actually has.
- **Managed OSS inference is plausibly the right answer for cost.** ~100× cheaper than Sonnet at full Q4 quality on 70B-class models, no hardware ceiling. *We have not actually tried it.*

The cheapest experiment that would close the dominant unknown isn't more local-model triage — it's one Groq + `llama3.3:70b` end-to-end run. That probably should happen before any more PRs land on this surface.

---

## Suggested next steps — ordered

### Priority 1 — Run Groq + `llama3.3:70b` end-to-end (the missing experiment)

**Why first**: the cost economics make this the highest-value single data point on the board. If a 70B-class OSS model on managed inference produces validator-quality parity at $0.002/doc, the rest of this plan reorders dramatically. If it doesn't, the project is back to "Anthropic for quality, Ollama for offline" — and the OSS-via-OpenRouter follow-up architecture loses most of its motivation.

**Approach**:
1. **Land PR #91 first** — its Anthropic-shape transport plumbing is the smallest realistic gateway preparation. Even though Groq isn't OpenRouter, the `provider` / `apiKeyEnvVar` / `baseUrl` config surface generalises.
2. **One-off branch**: copy `config/gutenberg-block-api.json` → `config/gutenberg-block-api.groq.json`, point at `https://api.groq.com/openai/v1`, model `llama-3.3-70b-versatile`, key in `GROQ_API_KEY`. Single-slug smoke first (`--slug block-attributes`), then a full 10-doc run.
3. **What to look at**: same metrics as the Sonnet baseline — issues count by severity, positives count, output tokens, wall time, per-doc `diagnostics`. Curl-probe Groq's tool-call shape ahead of the run to confirm structured `tool_calls` survive.

**Acceptance**: ≥ 4 of Sonnet's 12 drift findings reproduced (the stable TPs: `block-attributes` enum, `block-patterns` `content` required, `block-bindings` add_filter, `block-variations` `isDefault`). Anything less and the quality gap remains the blocker.

**Cost cap**: $1. (The full Gutenberg run on Groq should be a fraction of one dollar; if it's $5+, the pricing assumption was wrong and that itself is a finding.)

**Risk**: Groq uses OpenAI-shape, not Anthropic-shape. PR #91 as currently merged would reject this configuration. The experiment may need to live on a throwaway branch with the guardrails removed, *or* wait until the proper `LLMClient` port (the deferred Arc-A follow-up) lands.

### Priority 2 — Land PRs #91 and #92, then PR #51, then PR #45

**Why second**: these are review-clean (#91, #92, #51) or near-clean (#45 has two open Backend-Engineer items). They are all unmerged. Drift cost compounds.

- **PR #91** is the smallest and most independent — provider plumbing with guardrails. Land first.
- **PR #92** stacks on #91 and is one schema line. Land immediately after.
- **PR #51** is the single-prompt mode. Independent of #91/#92. Useful in isolation: any future Claude-compatible-but-not-Anthropic endpoint benefits. Review items are all addressed; manual test passed.
- **PR #45** introduces the `LLMClient` abstraction that the *whole* OSS-model story rests on. Resolve the `CostAccumulator` type leak and the `parseArguments` silent-failure (both flagged by the AGENTS.md Backend Engineer review) before landing. This is the foundation for Priority 3 and 4.

**Acceptance**: PRs merged, `main` carries provider abstraction + format extension point + single-prompt mode. Subsequent OSS work no longer drifts against stale branches.

### Priority 3 — Open the deferred OpenAI-compatible LLM-port follow-up

**Why third**: this is what unlocks `openai/gpt-4o`, `google/gemini-2.5-pro`, and OSS models served via OpenRouter's `/api/v1/chat/completions`. It is also the natural home for **Groq, Together, Fireworks, and any other OpenAI-shape gateway** — one client, many configs.

**Design** (per the PR #91 follow-up review):

```ts
// src/adapters/llm/types.ts
interface LLMClient {
  call(req: LLMRequest): Promise<LLMResponse>;
}
```

`LLMRequest` / `LLMResponse` are a thin internal shape capturing system prompt, messages, tool schemas, forced tool choice, max tokens, temperature, and a usage block. Two concrete adapters: `AnthropicLLMClient` (existing behavior) and `OpenAICompatLLMClient` (new — covers OpenRouter, Groq, Together, Ollama).

**This is the same abstraction PR #45 already builds.** The follow-up should *reuse* PR #45's `LLMClient` interface rather than reinvent it. Confirm shape compatibility with the validator's call patterns (Anthropic ephemeral cache fields, OpenAI-shape `tool_calls` arrays, finish-reason variants) before merging.

**Acceptance**: a single OpenAI-shape config running end-to-end against any one OSS model on any one gateway, producing schema-valid `RunResults`. Quality is a separate question (Priority 4).

### Priority 4 — Capability bake-off

**Why fourth**: once both transports exist on `main` (Anthropic-shape and OpenAI-shape) and at least one OSS model has been validated end-to-end (Priority 1), the question becomes: *which OSS model is the right default for the OSS-quality story?*

Candidates, in rough priority:

1. `llama-3.3-70b` via Groq (results from Priority 1).
2. `qwen-2.5-72b-instruct` via Together or Fireworks.
3. `deepseek-v3` via the upstream API or a gateway.
4. `mistral-large` via Mistral API.

Run each against the same 10-doc Gutenberg config. Score by:
- Drift findings reproduced from the Sonnet baseline (the four stable TPs from Priority 1 are the floor).
- FP rate on human review.
- Cost per run.
- Latency.

This is exploratory; cost-cap at $20 total across all four models.

**Acceptance**: a published decision on which model (if any) is recommended as the OSS-quality default. If none clear the bar, "Anthropic for quality, Ollama for offline, no OSS-quality default" is a valid published outcome.

### Priority 5 — (Deferred) Local-model recovery via single-prompt mode

**Why deferred**: only valuable if Priorities 1 and 4 turn out negatively. If managed OSS works, the cheapest path is to use it. If it doesn't, the question of whether `single-prompt` mode can rescue a Qwen-2.5-coder run is worth revisiting — but only then.

Sketch: wire `OllamaLLMClient` to honour `responseMode: 'single-prompt'`, smoke-test on `qwen2.5-coder:7b`, see whether the inline-JSON behaviour the curl probe identified is recoverable when we *want* JSON-in-content instead of `tool_calls`.

---

## Open questions

1. **Is the offline-zero-cost story actually a project requirement?** PR #45 was framed around it; the actual demand has not been validated. If no maintainer actually needs offline runs, Arc A is a distraction relative to managed OSS inference.
2. **What's the right disposition for PR #45's `tool-use-validator.ts` rename?** If we land PR #45 before Priority 3, the abstraction lives there. If we land Priority 3 first, we may want to start fresh. The two paths converge but the merge ordering matters for diff hygiene.
3. **Is there a sample-size argument for OSS models?** PR #45 turned the "1 sample vs N samples" knob (the `samples` config field) — would running N samples of a 70B-class OSS model and aggregating recover Sonnet-quality findings? Untested.
4. **Do any of the candidate OSS models support prompt caching?** Anthropic's ephemeral cache is doing material work on the Sonnet baseline (visible in `cache_read_input_tokens`). If a gateway / model can't cache, the cost-per-run estimates need to roughly double for the system-prompt token count.

---

## References

- **PR #45** (Ollama + LLM abstraction): https://github.com/juanma-wp/wp-docs-health-monitor/pull/45 — open, Backend-Engineer review pending on two items.
- **PR #51** (single-prompt mode): https://github.com/juanma-wp/wp-docs-health-monitor/pull/51 — open, review items addressed, manual test passed.
- **PR #91** (OpenRouter Anthropic-shape transport): https://github.com/juanma-wp/wp-docs-health-monitor/pull/91 — open, hardened 2026-05-20.
- **PR #92** (`validator.format` forward-compat field): https://github.com/juanma-wp/wp-docs-health-monitor/pull/92 — open, schema-only.
- **Working tree artifacts** (untracked, not committed): `pr-92-testing-instructions.md` — manual test plan for PRs #91/#92 with curl probes and per-model triage steps. The `outputDir: ./out-openrouter` and `config/openrouter-test.json` files referenced there were cleaned up after the test runs.
- **PR #45 local-model run logs** (in PR comments):
  - 2026-04-29: empty-run diagnostics, curl-probe confirming Qwen 2.5-coder wire-format mismatch.
  - 2026-04-30: HF open-source LLM survey + 32 GB / 48 GB hardware-ceiling correction + four-model comparison table (Sonnet vs Hermes3 / Mistral-small / Mistral-nemo).
- **Project plan context**: [next-steps.md](./next-steps.md), [second-site-experiment.md](./second-site-experiment.md).
- **Architectural rationale**: [docs/ARCHITECTURE.md](../ARCHITECTURE.md), [CLAUDE.md](../../CLAUDE.md) "Spend on context and model, not on guards" — the framing argument for *why* model quality is the lever, not heuristic post-filters.
