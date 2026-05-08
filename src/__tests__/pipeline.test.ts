import { describe, it, expect, vi } from 'vitest';

import type { Config } from '../config/schema.js';
import type { DocSource } from '../adapters/doc-source/types.js';
import type { CodeSource } from '../adapters/code-source/types.js';
import type { DocCodeMapper } from '../adapters/doc-code-mapper/types.js';
import type { Validator } from '../adapters/validator/types.js';
import type { CodeTiers } from '../types/mapping.js';
import type { DocResult } from '../types/results.js';
import type { Doc } from '../adapters/doc-source/types.js';

// ---------------------------------------------------------------------------
// Fake adapter factory — installed via vi.mock before runPipeline is imported
// ---------------------------------------------------------------------------

const TIERS: CodeTiers = { primary: [], secondary: [], context: [] };

const docA: Doc = {
  slug:        'doc-a',
  title:       'Doc A',
  parent:      'test',
  sourceUrl:   'https://example.com/doc-a',
  content:     '# Doc A',
  metrics:     { wordCount: 2, codeExampleCount: 0, linkCount: 0 },
  lastModified: null,
};
const docB: Doc = {
  slug:        'doc-b',
  title:       'Doc B',
  parent:      'test',
  sourceUrl:   'https://example.com/doc-b',
  content:     '# Doc B',
  metrics:     { wordCount: 2, codeExampleCount: 0, linkCount: 0 },
  lastModified: null,
};

const fakeDocSource: DocSource = {
  fetchDocs: async () => [
    { ok: true,  doc: docA },
    { ok: true,  doc: docB },
  ],
};

const fakeCodeSources: Record<string, CodeSource> = {
  gutenberg: {
    readFile:     async () => '',
    listDir:      async () => [],
    getCommitSha: async () => 'deadbeef',
  },
};

const fakeMapper: DocCodeMapper = {
  getCodeTiers: () => TIERS,
};

// Validator that throws for doc-a but returns a healthy DocResult for doc-b.
// This is the scenario that used to abort the entire run.
const throwingValidator: Validator = {
  validateDoc: async (doc) => {
    if (doc.slug === 'doc-a') {
      throw new Error('boom: simulated validator crash');
    }
    return {
      slug:        doc.slug,
      title:       doc.title,
      parent:      doc.parent,
      sourceUrl:   doc.sourceUrl,
      healthScore: 100,
      status:      'healthy',
      issues:      [],
      positives:   [],
      relatedCode: [],
      diagnostics: [],
      commitSha:   'deadbeef',
      analyzedAt:  new Date().toISOString(),
    } satisfies DocResult;
  },
};

vi.mock('../adapters/index.js', () => ({
  createDocSource:      () => fakeDocSource,
  createCodeSources:    () => fakeCodeSources,
  createDocCodeMapper:  () => fakeMapper,
  createValidator:      () => throwingValidator,
}));

// Import AFTER vi.mock so the mock is active.
const { runPipeline } = await import('../pipeline.js');
const { RunResultsSchema } = await import('../types/results.js');

const minimalConfig: Config = {
  project: { name: 'Test' },
  docSource: {
    type: 'manifest-url',
    manifestUrl: 'https://example.com/manifest.json',
    parentSlug: 'test',
  },
  codeSources: {
    gutenberg: {
      type: 'git-clone',
      repoUrl: 'https://github.com/WordPress/gutenberg.git',
      ref: 'trunk',
    },
  },
  mappingPath: 'mappings/test.json',
  outputDir: '/tmp/wp-docs-health-monitor-pipeline-test',
  validator: { type: 'claude', pass1Model: 'claude-sonnet-4-6', pass2Model: 'claude-sonnet-4-6', temperature: 0, samples: 1 },
  pricing: { inputPerMtok: 3, outputPerMtok: 15, cacheWritePerMtok: 3.75, cacheReadPerMtok: 0.30 },
};

describe('runPipeline — validator failure isolation', () => {
  it('produces a critical DocResult when the validator throws on one doc, instead of aborting the run', async () => {
    const result = await runPipeline(minimalConfig);

    expect(result.docs).toHaveLength(2);

    const a = result.docs.find(d => d.slug === 'doc-a')!;
    const b = result.docs.find(d => d.slug === 'doc-b')!;

    expect(a.status).toBe('critical');
    expect(a.healthScore).toBe(0);
    expect(a.diagnostics.some(d => /boom: simulated validator crash/.test(d))).toBe(true);

    expect(b.status).toBe('healthy');
    expect(b.healthScore).toBe(100);

    // Run-level shape must still be a valid RunResults
    expect(() => RunResultsSchema.parse(result)).not.toThrow();
  });
});
