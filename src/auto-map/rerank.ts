/**
 * AI re-ranker for `scripts/auto-map.ts`.
 *
 * The lexical indexer (`src/indexer/symbol-index.ts`) is the retrieval layer:
 * cheap, deterministic, and it returns a top-N candidate list. This module is
 * the ranking layer: it asks an LLM to re-order the candidates by semantic
 * judgment, drop coincidental matches, and attach a short rationale per file
 * (kept files: why this tier; dropped files: which noise pattern fired).
 *
 * Public surface is intentionally small — `rerank({ doc, slug, candidates })`
 * returns a typed `RerankResult` or `null` (sentinel) on any failure mode
 * (SDK error, missing API key, malformed tool input, no tool_use block in
 * response). The orchestrator falls back to the lexical-only mapping on null
 * and emits a clear stderr warning to the user.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tier caps (mirror CodeTiersSchema in src/types/mapping.ts)
// ---------------------------------------------------------------------------
const PRIMARY_MAX   = 3;
const SECONDARY_MAX = 5;
const CONTEXT_MAX   = 8;

// Top-N candidates passed to the model. Matches the PRD figure (#71). The
// indexer's rest is dropped before serialisation so prompt size is bounded.
const TOP_N_CANDIDATES = 30;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Candidate = {
  repo:           string;
  path:           string;
  score:          number;
  matchedSymbols: string[];
};

const KeptFileSchema = z.object({
  repo:       z.string(),
  path:       z.string(),
  rationale:  z.string(),
  confidence: z.number().min(0).max(1),
});

// Dropped files use the same `rationale` field name as kept files — single
// concept ("why is this file in this bucket?"), single field. The PRD sketch
// (#71) used `reason`, but the model reliably emitted `rationale` for both
// kept and dropped entries during diagnosis (see commit history); the split
// was below the model's signal floor and forced every drop to fail schema.
const DroppedFileSchema = z.object({
  repo:      z.string(),
  path:      z.string(),
  rationale: z.string(),
});

export const RerankResultSchema = z.object({
  primary:   z.array(KeptFileSchema).max(PRIMARY_MAX),
  secondary: z.array(KeptFileSchema).max(SECONDARY_MAX),
  context:   z.array(KeptFileSchema).max(CONTEXT_MAX),
  dropped:   z.array(DroppedFileSchema),
});

export type RerankResult = z.infer<typeof RerankResultSchema>;
export type KeptFile     = z.infer<typeof KeptFileSchema>;
export type DroppedFile  = z.infer<typeof DroppedFileSchema>;

// ---------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------

const KEPT_FILE_PROPERTIES = {
  repo:       { type: 'string', description: 'The repo id from the candidate list (e.g. "gutenberg", "wordpress-develop").' },
  path:       { type: 'string', description: 'The file path within the repo, exactly as it appeared in the candidate list.' },
  rationale:  { type: 'string', description: 'One-line explanation of what this file is and why it belongs in this tier.' },
  confidence: { type: 'number', minimum: 0, maximum: 1, description: 'How sure you are this file belongs in this tier (0–1).' },
} as const;

const DROPPED_FILE_PROPERTIES = {
  repo:      { type: 'string', description: 'The repo id from the candidate list.' },
  path:      { type: 'string', description: 'The file path from the candidate list.' },
  rationale: { type: 'string', description: 'One-line explanation naming the noise pattern (e.g. "single-token English match — `deprecated` is the JS logger, not block deprecation").' },
} as const;

export const RERANK_TOOL: Anthropic.Tool = {
  name: 'report_rerank',
  description:
    'Report the re-ranked auto-map result: which candidate files belong in primary / secondary / context (each with a one-line rationale and a confidence in [0, 1]), and which were dropped (each with a one-line rationale naming the noise pattern).',
  input_schema: {
    type: 'object' as const,
    required: ['primary', 'secondary', 'context', 'dropped'],
    properties: {
      primary: {
        type: 'array',
        maxItems: PRIMARY_MAX,
        items: {
          type: 'object',
          required: ['repo', 'path', 'rationale', 'confidence'],
          properties: KEPT_FILE_PROPERTIES,
        },
      },
      secondary: {
        type: 'array',
        maxItems: SECONDARY_MAX,
        items: {
          type: 'object',
          required: ['repo', 'path', 'rationale', 'confidence'],
          properties: KEPT_FILE_PROPERTIES,
        },
      },
      context: {
        type: 'array',
        maxItems: CONTEXT_MAX,
        items: {
          type: 'object',
          required: ['repo', 'path', 'rationale', 'confidence'],
          properties: KEPT_FILE_PROPERTIES,
        },
      },
      dropped: {
        type: 'array',
        items: {
          type: 'object',
          required: ['repo', 'path', 'rationale'],
          properties: DROPPED_FILE_PROPERTIES,
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an AI re-ranker for documentation-vs-code mapping. Given a documentation page and a ranked list of candidate source files (lexical retrieval — symbol-name overlap), classify each candidate file into one of:

  - primary   (max 3): the canonical implementation files for the doc's subject. The reader should read these first to understand the doc.
  - secondary (max 5): files that meaningfully implement, parse, validate, or test the same subject. Useful for cross-checking the doc.
  - context   (max 8): related files that establish surrounding behaviour (helpers, types, integration points). Not authoritative on their own.
  - dropped:  files that match lexically but are NOT about this doc's subject (English-word collisions, cross-schema property collisions, generic identifiers). Each dropped file MUST carry a one-line rationale naming the noise pattern.

Every file (kept or dropped) carries a one-line \`rationale\`. For kept files, the rationale describes what the file is and why this tier; for dropped files, the rationale names the noise pattern (e.g. "single-token English match", "cross-schema property collision"). Kept files additionally carry a \`confidence\` in [0, 1]:
  - 0.9–1.0: the file is unambiguously canonical for this doc.
  - 0.7–0.9: the file is clearly related but not the single canonical source.
  - 0.5–0.7: plausibly related but the reviewer should double-check.
  - < 0.5:   keep only if no better candidate exists; flag for human review.

Drop, do not keep at low confidence, when:
  - the only match is a single English word that happens to be a code identifier (e.g. "deprecated" matches a logging utility because the file exports a function literally called \`deprecated\`),
  - the only match is a generic JSON-schema property name shared across multiple unrelated schemas (\`name\`, \`style\`, \`title\`, \`version\`),
  - the file is in a fixtures, examples, stories, or icon directory and matches only generic identifiers.

Use the \`report_rerank\` tool to return your result. Do not include files that were not in the candidate list.`;

// ---------------------------------------------------------------------------
// Reranker
// ---------------------------------------------------------------------------

export type RerankInput = {
  doc:        string;
  slug:       string;
  candidates: Candidate[];
};

export class Reranker {
  public  readonly model:       string;
  private readonly anthropic:   Anthropic;
  private readonly temperature: number;

  constructor(model: string, anthropic: Anthropic, options: { temperature?: number } = {}) {
    this.model       = model;
    this.anthropic   = anthropic;
    this.temperature = options.temperature ?? 0;
  }

  async rerank(input: RerankInput): Promise<RerankResult | null> {
    const userContent = buildUserContent(input);

    let response: Anthropic.Message;
    try {
      response = await this.anthropic.messages.create({
        model:       this.model,
        max_tokens:  4096,
        temperature: this.temperature,
        system: [
          {
            type:          'text',
            text:          SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages:    [{ role: 'user', content: userContent }],
        tools:       [RERANK_TOOL],
        tool_choice: { type: 'tool', name: 'report_rerank' },
      });
    } catch (err) {
      console.error(`AI re-rank failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }

    for (const block of response.content) {
      if (block.type !== 'tool_use' || block.name !== 'report_rerank') continue;
      // Diagnostic seam — set DUMP_RERANK=1 to capture the raw tool input under
      // /tmp/wp-docs-rerank-dump/. Used to diagnose the original `reason` vs
      // `rationale` field-conflation bug; kept as the seam for future
      // model-output regressions per CLAUDE.md "Diagnose before defending".
      if (process.env.DUMP_RERANK) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const dir = '/tmp/wp-docs-rerank-dump';
          fs.mkdirSync(dir, { recursive: true });
          const ts = Date.now();
          fs.writeFileSync(
            path.join(dir, `rerank-${input.slug}-${ts}.json`),
            JSON.stringify({ stop_reason: response.stop_reason, usage: response.usage, input: block.input }, null, 2),
          );
        } catch { /* dump is best-effort */ }
      }
      const parsed = RerankResultSchema.safeParse(block.input);
      if (!parsed.success) {
        console.error(`AI re-rank failed: tool input did not match schema: ${parsed.error.toString()}`);
        return null;
      }
      return parsed.data;
    }

    console.error('AI re-rank failed: response carried no report_rerank tool_use block');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Canonical order + prompt assembly
// ---------------------------------------------------------------------------

// Top-N in canonical order: score desc, then `repo:path` lex asc. Ties broken
// deterministically so the cache key (slice B) and the prompt itself are
// reproducible regardless of upstream iteration order.
function canonicalOrder(candidates: Candidate[]): Candidate[] {
  return [...candidates]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ka = `${a.repo}:${a.path}`;
      const kb = `${b.repo}:${b.path}`;
      return ka.localeCompare(kb);
    })
    .slice(0, TOP_N_CANDIDATES);
}

function buildUserContent({ doc, slug, candidates }: RerankInput): string {
  const ordered = canonicalOrder(candidates);
  const rows = ordered.map(c => {
    const symbols = c.matchedSymbols.length > 0
      ? ` (matched: ${c.matchedSymbols.slice(0, 8).join(', ')})`
      : '';
    return `- ${c.repo}:${c.path}  score=${c.score.toFixed(2)}${symbols}`;
  }).join('\n');

  return `## Documentation slug: ${slug}

## Documentation content

${doc}

---

## Candidate files (top ${ordered.length}, lexical retrieval — sorted by score desc)

${rows || '(no candidates)'}

---

Re-rank these candidates into primary / secondary / context / dropped using the \`report_rerank\` tool.`;
}
