import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

import { Reranker, RerankResultSchema, RERANK_TOOL } from '../rerank.js';
import type { Candidate } from '../rerank.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnthropicClient(responses: (Anthropic.Message | Error)[]): Anthropic {
  let callCount = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const resp = responses[callCount] ?? responses[responses.length - 1];
        callCount++;
        if (resp instanceof Error) throw resp;
        return resp;
      }),
    },
  } as unknown as Anthropic;
}

function makeToolUseResponse(input: unknown): Anthropic.Message {
  return {
    id:           'msg_test',
    type:         'message',
    role:         'assistant',
    model:        'claude-sonnet-4-6',
    stop_reason:  'tool_use',
    stop_sequence: null,
    usage:        { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    content: [
      {
        type:  'tool_use',
        id:    'tu_1',
        name:  'report_rerank',
        input,
      } as unknown as Anthropic.ToolUseBlock,
    ],
  } as unknown as Anthropic.Message;
}

function makeCandidate(repo: string, path: string, score: number, matchedSymbols: string[] = []): Candidate {
  return { repo, path, score, matchedSymbols };
}

// ---------------------------------------------------------------------------
// RerankResultSchema — Zod contract
// ---------------------------------------------------------------------------

describe('RerankResultSchema', () => {
  it('accepts well-formed result with rationale + confidence per kept file and rationale per dropped', () => {
    const ok = RerankResultSchema.safeParse({
      primary:   [{ repo: 'r', path: 'a.ts', rationale: 'r', confidence: 0.9 }],
      secondary: [],
      context:   [],
      dropped:   [{ repo: 'r', path: 'b.ts', rationale: 'noisy' }],
    });
    expect(ok.success).toBe(true);
  });

  it('rejects primary with more than 3 entries', () => {
    const bad = RerankResultSchema.safeParse({
      primary: Array.from({ length: 4 }, (_, i) => ({
        repo: 'r', path: `${i}.ts`, rationale: 'r', confidence: 0.9,
      })),
      secondary: [], context: [], dropped: [],
    });
    expect(bad.success).toBe(false);
  });

  it('rejects confidence outside [0, 1]', () => {
    const bad = RerankResultSchema.safeParse({
      primary: [{ repo: 'r', path: 'a.ts', rationale: 'r', confidence: 1.5 }],
      secondary: [], context: [], dropped: [],
    });
    expect(bad.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RERANK_TOOL — schema cap on tier sizes
// ---------------------------------------------------------------------------

describe('RERANK_TOOL schema', () => {
  it('encodes tier caps structurally on the tool schema', () => {
    const schema = RERANK_TOOL.input_schema as {
      properties: {
        primary:   { maxItems?: number };
        secondary: { maxItems?: number };
        context:   { maxItems?: number };
      };
    };
    expect(schema.properties.primary.maxItems).toBe(3);
    expect(schema.properties.secondary.maxItems).toBe(5);
    expect(schema.properties.context.maxItems).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Reranker — happy path
// ---------------------------------------------------------------------------

describe('Reranker — happy path', () => {
  it('returns the structured tool input on a well-formed response', async () => {
    const toolInput = {
      primary: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical impl', confidence: 0.95 },
      ],
      secondary: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js', rationale: 'related parser', confidence: 0.8 },
      ],
      context: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts', rationale: 'helpers', confidence: 0.75 },
      ],
      dropped: [
        { repo: 'gutenberg', path: 'packages/deprecated/src/index.ts', rationale: 'unrelated logger named `deprecated`' },
      ],
    };
    const client = makeAnthropicClient([makeToolUseResponse(toolInput)]);

    const reranker = new Reranker('claude-sonnet-4-6', client);
    const result = await reranker.rerank({
      doc:        '# block-metadata\n\nDocs about block metadata.',
      slug:       'block-metadata',
      candidates: [
        makeCandidate('gutenberg', 'packages/blocks/src/api/registration.js', 5.0, ['registerBlockType']),
        makeCandidate('gutenberg', 'packages/blocks/src/api/parser.js',       3.0, ['parse']),
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.primary[0].path).toBe('packages/blocks/src/api/registration.js');
    expect(result?.dropped[0].rationale).toMatch(/deprecated/);
  });
});

// ---------------------------------------------------------------------------
// Reranker — failure modes return null sentinel
// ---------------------------------------------------------------------------

describe('Reranker — failure modes', () => {
  it('returns null when the SDK throws', async () => {
    const client = makeAnthropicClient([new Error('transient API failure')]);
    const reranker = new Reranker('claude-sonnet-4-6', client);
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await reranker.rerank({
      doc:        'doc',
      slug:       'block-metadata',
      candidates: [makeCandidate('r', 'a.ts', 1)],
    });

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  it('returns null when tool input fails schema validation', async () => {
    const malformed = { primary: 'not an array', secondary: [], context: [], dropped: [] };
    const client = makeAnthropicClient([makeToolUseResponse(malformed)]);
    const reranker = new Reranker('claude-sonnet-4-6', client);
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await reranker.rerank({
      doc:        'doc',
      slug:       'block-metadata',
      candidates: [makeCandidate('r', 'a.ts', 1)],
    });

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  it('returns null when the response carries no tool_use block', async () => {
    const response = {
      id:           'msg_test',
      type:         'message',
      role:         'assistant',
      model:        'claude-sonnet-4-6',
      stop_reason:  'end_turn',
      stop_sequence: null,
      usage:        { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content:      [{ type: 'text', text: 'no tool call here' } as unknown as Anthropic.TextBlock],
    } as unknown as Anthropic.Message;

    const client = makeAnthropicClient([response]);
    const reranker = new Reranker('claude-sonnet-4-6', client);
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await reranker.rerank({
      doc:        'doc',
      slug:       'block-metadata',
      candidates: [makeCandidate('r', 'a.ts', 1)],
    });

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Reranker — SDK call shape (model + temperature + canonical order)
// ---------------------------------------------------------------------------

describe('Reranker — SDK call shape', () => {
  it('passes the configured model on every call and omits temperature by default', async () => {
    const ok = makeToolUseResponse({
      primary: [], secondary: [], context: [], dropped: [],
    });
    const client = makeAnthropicClient([ok]);
    const createSpy = client.messages.create as Mock;

    const reranker = new Reranker('claude-sonnet-4-6', client);
    await reranker.rerank({
      doc:        'doc',
      slug:       'block-metadata',
      candidates: [makeCandidate('r', 'a.ts', 1)],
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    const callArgs = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ model: 'claude-sonnet-4-6' });
    expect('temperature' in callArgs).toBe(false);
  });

  it('passes an explicit temperature when provided to the constructor', async () => {
    const ok = makeToolUseResponse({
      primary: [], secondary: [], context: [], dropped: [],
    });
    const client = makeAnthropicClient([ok]);
    const createSpy = client.messages.create as Mock;

    const reranker = new Reranker('claude-sonnet-4-6', client, { temperature: 0 });
    await reranker.rerank({
      doc:        'doc',
      slug:       'block-metadata',
      candidates: [makeCandidate('r', 'a.ts', 1)],
    });

    expect(createSpy.mock.calls[0][0]).toMatchObject({
      model:       'claude-sonnet-4-6',
      temperature: 0,
    });
  });

  it('serialises top-30 candidates in canonical order (score desc, then repo:path lex)', async () => {
    const ok = makeToolUseResponse({
      primary: [], secondary: [], context: [], dropped: [],
    });
    const client = makeAnthropicClient([ok]);
    const createSpy = client.messages.create as Mock;

    // Deliberately scrambled input order; tied scores forced to test the lex tiebreak.
    const candidates: Candidate[] = [
      makeCandidate('zeta',     'z.ts',  1.0, ['z']),
      makeCandidate('alpha',    'a.ts',  5.0, ['a']),
      makeCandidate('beta',     'b.ts',  5.0, ['b']),    // tied with alpha:a.ts on score
      makeCandidate('alpha',    'b.ts',  5.0, ['b']),    // tied with above on score
      makeCandidate('gutenberg', 'p.ts', 3.0, ['p']),
    ];

    const reranker = new Reranker('claude-sonnet-4-6', client);
    await reranker.rerank({
      doc:        'doc',
      slug:       'block-metadata',
      candidates,
    });

    const userMsg = (createSpy.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    // canonical order: sort by score desc, then by `${repo}:${path}` lex asc
    const orderedRepoPaths = [
      'alpha:a.ts',     // 5.0
      'alpha:b.ts',     // 5.0
      'beta:b.ts',      // 5.0
      'gutenberg:p.ts', // 3.0
      'zeta:z.ts',      // 1.0
    ];
    let last = -1;
    for (const rp of orderedRepoPaths) {
      const idx = userMsg.indexOf(rp);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  it('caps the prompt at the top-30 candidates by score', async () => {
    const ok = makeToolUseResponse({
      primary: [], secondary: [], context: [], dropped: [],
    });
    const client = makeAnthropicClient([ok]);
    const createSpy = client.messages.create as Mock;

    const candidates: Candidate[] = Array.from({ length: 50 }, (_, i) =>
      makeCandidate('r', `file-${String(i).padStart(2, '0')}.ts`, 100 - i, []),
    );

    const reranker = new Reranker('claude-sonnet-4-6', client);
    await reranker.rerank({ doc: 'doc', slug: 'x', candidates });

    const userMsg = (createSpy.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    // Top 30 (highest scores) MUST appear; the 31st onwards MUST NOT.
    expect(userMsg).toContain('file-00.ts');
    expect(userMsg).toContain('file-29.ts');
    expect(userMsg).not.toContain('file-30.ts');
    expect(userMsg).not.toContain('file-49.ts');
  });
});
