import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type Anthropic from '@anthropic-ai/sdk';

import { buildTiersForSlug, auditPathFor } from '../orchestrator.js';
import { Reranker } from '../rerank.js';
import { RerankCache } from '../rerank-cache.js';
import { AuditWriter, MappingAuditSchema } from '../audit-writer.js';
import type { ScoredFile } from '../../indexer/symbol-index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnthropicClient(responses: (Anthropic.Message | Error)[]): Anthropic {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const r = responses[i] ?? responses[responses.length - 1];
        i++;
        if (r instanceof Error) throw r;
        return r;
      }),
    },
  } as unknown as Anthropic;
}

function makeToolUseResponse(input: unknown): Anthropic.Message {
  return {
    id:           'msg',
    type:         'message',
    role:         'assistant',
    model:        'claude-sonnet-4-6',
    stop_reason:  'tool_use',
    stop_sequence: null,
    usage:        { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    content: [
      { type: 'tool_use', id: 'tu', name: 'report_rerank', input } as unknown as Anthropic.ToolUseBlock,
    ],
  } as unknown as Anthropic.Message;
}

// Schemas are deliberately placed at the top so the lexical-only path is
// forced through the primary-tier diversity cap (max 1 schema).
const SCORED: ScoredFile[] = [
  { repo: 'gutenberg', path: 'schemas/json/block.json',                 score: 6.0, matchedSymbols: ['name', 'style']     },
  { repo: 'gutenberg', path: 'schemas/json/theme.json',                 score: 5.5, matchedSymbols: ['name']              },
  { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', score: 5.0, matchedSymbols: ['registerBlockType'] },
  { repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js',       score: 4.0, matchedSymbols: ['parse']             },
  { repo: 'gutenberg', path: 'packages/deprecated/src/index.ts',        score: 3.0, matchedSymbols: ['deprecated']        },
  { repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts',        score: 2.0, matchedSymbols: ['utils']             },
];

const ALL_FILES: Record<string, string[]> = {
  gutenberg: [
    'packages/blocks/src/api/registration.js',
    'packages/blocks/src/api/parser.js',
    'packages/blocks/src/api/utils.ts',
    'packages/blocks/src/api/block-metadata.ts',
    'packages/deprecated/src/index.ts',
    'schemas/json/block.json',
    'schemas/json/theme.json',
  ],
};

// ---------------------------------------------------------------------------
// --no-rerank: lexical-only path (matches pre-rerank behaviour)
// ---------------------------------------------------------------------------

describe('orchestrator — --no-rerank (lexical-only)', () => {
  it('produces tiers from pickNext + tree heuristic when reranker is null', async () => {
    const { tiers, rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker:       null,
    });

    // primary cap of 3 with at most 1 schema (the existing diversity rule)
    expect(tiers.primary).toHaveLength(3);
    expect(tiers.primary.map(f => f.path)).toContain('packages/blocks/src/api/registration.js');
    const schemasInPrimary = tiers.primary.filter(f => /(^|\/)schemas\//.test(f.path));
    expect(schemasInPrimary).toHaveLength(1);

    // secondary up to 5
    expect(tiers.secondary.length).toBeLessThanOrEqual(5);

    // context populated by tree heuristic (slug-keyword match on `block-metadata`)
    expect(tiers.context.length).toBeGreaterThan(0);
    expect(tiers.context.map(f => f.path)).toContain('packages/blocks/src/api/block-metadata.ts');

    // No rerank ran -> no audit material is exposed.
    expect(rerankResult).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rerank-on: tiers come from the rerank result
// ---------------------------------------------------------------------------

describe('orchestrator — rerank on, mocked LLM', () => {
  it('projects rerank result into the locked CodeTiers shape (repo + path only)', async () => {
    const toolInput = {
      primary: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical impl', confidence: 0.95 },
      ],
      secondary: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js', rationale: 'parser', confidence: 0.85 },
      ],
      context: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts', rationale: 'helpers', confidence: 0.75 },
      ],
      // The deprecated FP (issue #72 acceptance) is dropped, not in primary.
      dropped: [
        { repo: 'gutenberg', path: 'packages/deprecated/src/index.ts', rationale: 'unrelated logger named `deprecated`' },
        { repo: 'gutenberg', path: 'schemas/json/theme.json',          rationale: 'cross-schema property collision (`name`)' },
      ],
    };
    const client = makeAnthropicClient([makeToolUseResponse(toolInput)]);
    const reranker = new Reranker('claude-sonnet-4-6', client);

    const { tiers, rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
    });

    // The locked CodeTiers shape carries no rationale/confidence — only repo + path.
    expect(tiers.primary).toEqual([{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js' }]);
    expect(tiers.secondary).toEqual([{ repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js' }]);
    expect(tiers.context).toEqual([{ repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts' }]);
    // Diagnosed FP is no longer in primary
    expect(tiers.primary.map(f => f.path)).not.toContain('packages/deprecated/src/index.ts');

    // The rerank result is exposed alongside tiers so the script can write
    // the audit file and render --explain.
    expect(rerankResult).not.toBeNull();
    expect(rerankResult?.dropped.map(f => f.path)).toContain('packages/deprecated/src/index.ts');
  });

  it('filters confidence < 0.5 entries from CodeTiers but keeps them in rerankResult/audit', async () => {
    // Defends the user-visible invariant: weak entries (confidence < 0.5) must
    // NOT reach the validator pipeline as authoritative input, but the audit
    // must still record them so reviewers can see what the model considered.
    // The model's prompt instructs it to drop these directly; this test pins
    // the projection floor that catches the case where the model defies that
    // instruction — exactly the `factory.ts @ 0.45` failure we observed live.
    const toolInput = {
      primary: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical', confidence: 0.95 },
      ],
      secondary: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js', rationale: 'parser',  confidence: 0.80 },
        { repo: 'gutenberg', path: 'schemas/json/theme.json',           rationale: 'tangential schema',  confidence: 0.45 },
      ],
      context: [
        { repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts',  rationale: 'helpers', confidence: 0.70 },
        { repo: 'gutenberg', path: 'packages/blocks/src/api/factory.ts', rationale: 'matched only on transform', confidence: 0.45 },
      ],
      dropped: [],
    };
    const client = makeAnthropicClient([makeToolUseResponse(toolInput)]);
    const reranker = new Reranker('claude-sonnet-4-6', client);

    const { tiers, rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
    });

    // CodeTiers (validator-pipeline input) excludes the < 0.5 entries.
    expect(tiers.secondary.map(f => f.path)).toEqual(['packages/blocks/src/api/parser.js']);
    expect(tiers.secondary.map(f => f.path)).not.toContain('schemas/json/theme.json');
    expect(tiers.context.map(f => f.path)).toEqual(['packages/blocks/src/api/utils.ts']);
    expect(tiers.context.map(f => f.path)).not.toContain('packages/blocks/src/api/factory.ts');

    // RerankResult (audit input) preserves them so reviewers see the full picture.
    expect(rerankResult?.secondary.map(f => f.path)).toContain('schemas/json/theme.json');
    expect(rerankResult?.context.map(f => f.path)).toContain('packages/blocks/src/api/factory.ts');
  });

  it('keeps entries exactly at the 0.5 floor (>= is the bar, not >)', async () => {
    // Off-by-one defence: a 0.5-confidence entry passes; only strictly < 0.5 drops.
    const toolInput = {
      primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical', confidence: 0.95 }],
      secondary: [],
      context:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts', rationale: 'on the floor', confidence: 0.5 }],
      dropped:   [],
    };
    const client = makeAnthropicClient([makeToolUseResponse(toolInput)]);
    const reranker = new Reranker('claude-sonnet-4-6', client);
    const { tiers } = await buildTiersForSlug({
      docContent: '# x', slug: 'x', scored: SCORED, allFilesByRepo: ALL_FILES, reranker,
    });
    expect(tiers.context.map(f => f.path)).toContain('packages/blocks/src/api/utils.ts');
  });
});

// ---------------------------------------------------------------------------
// rerank-on with cache: second invocation is a cache hit (no LLM call)
// ---------------------------------------------------------------------------

describe('orchestrator — cache hit skips the LLM call', () => {
  it('makes exactly one LLM call across two consecutive invocations on identical inputs', async () => {
    const toolInput = {
      primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical impl', confidence: 0.95 }],
      secondary: [{ repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js',       rationale: 'parser',         confidence: 0.85 }],
      context:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts',        rationale: 'helpers',        confidence: 0.75 }],
      dropped:   [{ repo: 'gutenberg', path: 'packages/deprecated/src/index.ts',        rationale: 'unrelated logger named `deprecated`' }],
    };
    const client = makeAnthropicClient([makeToolUseResponse(toolInput)]);
    const createSpy = client.messages.create as ReturnType<typeof vi.fn>;

    const reranker = new Reranker('claude-sonnet-4-6', client);
    const cache    = new RerankCache(mkdtempSync(join(tmpdir(), 'orch-cache-test-')));

    const inputs = {
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
      cache,
    };

    const t1 = await buildTiersForSlug(inputs);
    const t2 = await buildTiersForSlug(inputs);

    expect(createSpy).toHaveBeenCalledTimes(1);
    // Both invocations produce the same tiers projected from the cached result.
    expect(t2).toEqual(t1);
    expect(t1.tiers.primary).toEqual([{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js' }]);
    // The cached path also surfaces the underlying RerankResult.
    expect(t1.rerankResult).not.toBeNull();
  });

  it('produces a fresh LLM call when the cache is null (caching disabled)', async () => {
    const toolInput = {
      primary: [], secondary: [], context: [], dropped: [],
    };
    // Two responses queued — if the orchestrator only made one LLM call we'd
    // still see it pinned by toHaveBeenCalledTimes(2) below.
    const client = makeAnthropicClient([
      makeToolUseResponse(toolInput),
      makeToolUseResponse(toolInput),
    ]);
    const createSpy = client.messages.create as ReturnType<typeof vi.fn>;

    const reranker = new Reranker('claude-sonnet-4-6', client);

    const inputs = {
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
      cache:          null,
    };

    await buildTiersForSlug(inputs);
    await buildTiersForSlug(inputs);

    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it('does not store a sentinel result on rerank failure (next run still calls LLM)', async () => {
    const toolInput = {
      primary: [], secondary: [], context: [], dropped: [],
    };
    // First call throws (sentinel returned, fallback to lexical), second
    // call succeeds with valid input.
    const client = makeAnthropicClient([
      new Error('transient API failure'),
      makeToolUseResponse(toolInput),
    ]);
    const createSpy = client.messages.create as ReturnType<typeof vi.fn>;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const reranker = new Reranker('claude-sonnet-4-6', client);
    const cache    = new RerankCache(mkdtempSync(join(tmpdir(), 'orch-cache-fail-')));

    const inputs = {
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
      cache,
    };

    await buildTiersForSlug(inputs);
    await buildTiersForSlug(inputs);

    // Cache miss + miss (sentinel not stored) means the LLM was called twice.
    expect(createSpy).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// rerank-on but LLM fails: fallback to lexical-only
// ---------------------------------------------------------------------------

describe('orchestrator — rerank on but LLM fails', () => {
  it('falls back to lexical-only tiers when the reranker returns null', async () => {
    const client = makeAnthropicClient([new Error('SDK error')]);
    const reranker = new Reranker('claude-sonnet-4-6', client);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { tiers, rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
    });

    // Same as the --no-rerank path
    expect(tiers.primary.map(f => f.path)).toContain('packages/blocks/src/api/registration.js');
    expect(tiers.context.map(f => f.path)).toContain('packages/blocks/src/api/block-metadata.ts');
    // No audit material on rerank failure — caller skips writing the audit.
    expect(rerankResult).toBeNull();
    // The Reranker emitted the user-visible warning before falling back.
    const allCalls = errSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allCalls).toMatch(/AI re-rank failed/);

    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Smoke: audit + --explain — gating logic between rerank result and audit write
// ---------------------------------------------------------------------------

describe('orchestrator + AuditWriter wiring (smoke)', () => {
  const TOOL_INPUT = {
    primary: [
      { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical impl', confidence: 0.95 },
    ],
    secondary: [
      { repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js', rationale: 'parses the block', confidence: 0.85 },
    ],
    context: [
      { repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts', rationale: 'helpers', confidence: 0.75 },
    ],
    dropped: [
      { repo: 'gutenberg', path: 'packages/deprecated/src/index.ts', rationale: 'unrelated logger named `deprecated`' },
    ],
  };

  it('writes the audit file when re-rank ran successfully and --write was set', async () => {
    const client = makeAnthropicClient([makeToolUseResponse(TOOL_INPUT)]);
    const reranker = new Reranker('claude-sonnet-4-6', client);

    const { rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
    });

    // Caller guard: only write audit when rerank produced a non-null result.
    expect(rerankResult).not.toBeNull();

    const dir = mkdtempSync(join(tmpdir(), 'orch-smoke-'));
    const auditPath = auditPathFor(join(dir, 'site.json'));
    expect(auditPath).toBe(join(dir, 'site.audit.json'));

    if (rerankResult) {
      new AuditWriter().writeAudit(auditPath, 'block-metadata', rerankResult);
    }

    expect(existsSync(auditPath)).toBe(true);
    const parsed = MappingAuditSchema.parse(JSON.parse(readFileSync(auditPath, 'utf-8')));
    expect(parsed.audits['block-metadata']).toEqual(rerankResult);
  });

  it('does NOT produce audit material under --no-rerank (caller must skip writeAudit)', async () => {
    const { rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker:       null,
    });

    // No rerank means no audit material exists for the caller to write.
    expect(rerankResult).toBeNull();
  });

  it('does NOT produce audit material when re-rank fails (caller must skip writeAudit)', async () => {
    const client = makeAnthropicClient([new Error('SDK error')]);
    const reranker = new Reranker('claude-sonnet-4-6', client);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
    });

    expect(rerankResult).toBeNull();
    errSpy.mockRestore();
  });

  it('--explain renders rationale per file (kept and dropped)', async () => {
    const client = makeAnthropicClient([makeToolUseResponse(TOOL_INPUT)]);
    const reranker = new Reranker('claude-sonnet-4-6', client);

    const { rerankResult } = await buildTiersForSlug({
      docContent:     '# block-metadata',
      slug:           'block-metadata',
      scored:         SCORED,
      allFilesByRepo: ALL_FILES,
      reranker,
    });

    expect(rerankResult).not.toBeNull();
    if (!rerankResult) return;

    const out = new AuditWriter().formatExplain(rerankResult);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('canonical impl');
    expect(out).toContain('parses the block');
    expect(out).toContain('helpers');
    expect(out).toContain('unrelated logger named `deprecated`');
  });

  it('auditPathFor derives `<mapping>.audit.json` from `<mapping>.json`', () => {
    expect(auditPathFor('mappings/gutenberg-block-api.json')).toBe(
      'mappings/gutenberg-block-api.audit.json',
    );
    // Falls back to suffix append for non-.json paths
    expect(auditPathFor('mappings/site')).toBe('mappings/site.audit.json');
  });

});
