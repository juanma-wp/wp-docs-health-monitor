import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { ZodError } from 'zod';
import {
  RunResultsSchema,
  IssueSchema,
} from '../results.js';
import {
  ManifestEntrySchema,
  CodeFileSchema,
  CodeTiersSchema,
} from '../mapping.js';
import { fingerprintIssue } from '../../history.js';
import { runPipeline } from '../../pipeline.js';
import type { Config } from '../../config/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadMockResults(): unknown {
  const p = resolve(__dirname, '../../../examples/mock-results.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

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
  outputDir: '/tmp/wp-docs-health-monitor-test',
  validator: { type: 'claude', pass1Model: 'claude-sonnet-4-6', pass2Model: 'claude-sonnet-4-6', responseMode: 'tool-use' },
  pricing: { inputPerMtok: 3, outputPerMtok: 15, cacheWritePerMtok: 3.75, cacheReadPerMtok: 0.30 },
};

// ---------------------------------------------------------------------------
// RunResultsSchema
// ---------------------------------------------------------------------------

describe('RunResultsSchema', () => {
  it('parses the full mock fixture without error', () => {
    const raw = loadMockResults();
    expect(() => RunResultsSchema.parse(raw)).not.toThrow();
  });

  it('throws ZodError when given an empty object', () => {
    expect(() => RunResultsSchema.parse({})).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// CodeFileSchema
// ---------------------------------------------------------------------------

describe('CodeFileSchema', () => {
  it('accepts a valid { repo, path } pair', () => {
    expect(() =>
      CodeFileSchema.parse({ repo: 'gutenberg', path: 'packages/blocks/src/index.js' })
    ).not.toThrow();
  });

  it('rejects an object missing the repo field', () => {
    expect(() => CodeFileSchema.parse({ path: 'foo.ts' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CodeTiersSchema
// ---------------------------------------------------------------------------

describe('CodeTiersSchema', () => {
  const makeFile = (i: number) => ({ repo: 'gutenberg', path: `file-${i}.ts` });

  it('rejects a primary array with 4 items (.max(3) enforced)', () => {
    expect(() =>
      CodeTiersSchema.parse({
        primary:   [0, 1, 2, 3].map(makeFile),
        secondary: [],
        context:   [],
      })
    ).toThrow();
  });

  it('accepts a primary array with exactly 3 items', () => {
    expect(() =>
      CodeTiersSchema.parse({
        primary:   [0, 1, 2].map(makeFile),
        secondary: [],
        context:   [],
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IssueSchema
// ---------------------------------------------------------------------------

describe('IssueSchema', () => {
  const validIssue = {
    severity:    'major',
    type:        'type-signature',
    evidence: {
      docSays:  'Says X',
      codeSays: 'Says Y',
      codeFile: 'packages/blocks/src/index.js',
      codeRepo: 'gutenberg',
    },
    suggestion:  'Fix it',
    confidence:  0.9,
    fingerprint: 'a1b2c3d4e5f6a7b8',
  } as const;

  it('accepts a valid issue', () => {
    expect(() => IssueSchema.parse(validIssue)).not.toThrow();
  });

  it('rejects confidence: 1.1 (above max)', () => {
    expect(() => IssueSchema.parse({ ...validIssue, confidence: 1.1 })).toThrow();
  });

  it('rejects confidence: -0.1 (below min)', () => {
    expect(() => IssueSchema.parse({ ...validIssue, confidence: -0.1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ManifestEntrySchema
// ---------------------------------------------------------------------------

describe('ManifestEntrySchema', () => {
  it('rejects a relative markdown_source path', () => {
    expect(() =>
      ManifestEntrySchema.parse({
        slug:            'block-attributes',
        title:           'Block Attributes',
        markdown_source: '../docs/block-attributes.md',
        parent:          'block-api',
      })
    ).toThrow();
  });

  it('accepts an absolute URL as markdown_source', () => {
    expect(() =>
      ManifestEntrySchema.parse({
        slug:            'block-attributes',
        title:           'Block Attributes',
        markdown_source: 'https://raw.githubusercontent.com/WordPress/gutenberg/trunk/docs/block-attributes.md',
        parent:          'block-api',
      })
    ).not.toThrow();
  });

  it('accepts parent: null (top-level entry)', () => {
    expect(() =>
      ManifestEntrySchema.parse({
        slug:            'block-api',
        title:           'Block API',
        markdown_source: 'https://example.com/block-api.md',
        parent:          null,
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fingerprintIssue
// ---------------------------------------------------------------------------

describe('fingerprintIssue', () => {
  it('returns a 16-character hex string', () => {
    const fp = fingerprintIssue('block-metadata', 'type-signature', 'gutenberg', 'src/index.ts');
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is stable: same inputs produce the same fingerprint', () => {
    const a = fingerprintIssue('block-metadata', 'type-signature', 'gutenberg', 'src/index.ts');
    const b = fingerprintIssue('block-metadata', 'type-signature', 'gutenberg', 'src/index.ts');
    expect(a).toBe(b);
  });

  it('produces different fingerprints for different slugs', () => {
    const a = fingerprintIssue('block-metadata', 'type-signature', 'gutenberg', 'src/index.ts');
    const b = fingerprintIssue('block-supports', 'type-signature', 'gutenberg', 'src/index.ts');
    expect(a).not.toBe(b);
  });

  it('produces different fingerprints for different codeRepos', () => {
    const a = fingerprintIssue('block-metadata', 'type-signature', 'gutenberg', 'src/index.ts');
    const b = fingerprintIssue('block-metadata', 'type-signature', 'wordpress-develop', 'src/index.ts');
    expect(a).not.toBe(b);
  });

  it('produces different fingerprints for different codeFiles', () => {
    const a = fingerprintIssue('block-metadata', 'type-signature', 'gutenberg', 'src/index.ts');
    const b = fingerprintIssue('block-metadata', 'type-signature', 'gutenberg', 'src/other.ts');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// runPipeline stub
// ---------------------------------------------------------------------------

const MANIFEST_URL_SCHEMA = 'https://example.com/manifest.json';
const DOC_URL_SCHEMA = 'https://raw.githubusercontent.com/WordPress/gutenberg/trunk/docs/block-api/block-attributes.md';

/** One-entry manifest whose parent matches minimalConfig.docSource.parentSlug ('test') */
const singleEntryManifest = JSON.stringify([{
  slug: 'block-attributes',
  title: 'Block Attributes',
  markdown_source: DOC_URL_SCHEMA,
  parent: 'test',
}]);

describe('runPipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a RunResults with a correctly-formatted runId', async () => {
    const result = await runPipeline(minimalConfig);
    expect(result.runId).toMatch(/^\d{8}-\d{6}$/);
  });

  it('returns a result that passes RunResultsSchema.parse', async () => {
    const result = await runPipeline(minimalConfig);
    expect(() => RunResultsSchema.parse(result)).not.toThrow();
  });

  it('appends a DocResult with diagnostics when doc fetch returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr === MANIFEST_URL_SCHEMA) {
        return new Response(singleEntryManifest, { status: 200 });
      }
      if (urlStr === DOC_URL_SCHEMA) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    const result = await runPipeline(minimalConfig);

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0].slug).toBe('block-attributes');
    expect(result.docs[0].status).toBe('critical');
    expect(result.docs[0].diagnostics[0]).toContain('404');
    expect(() => RunResultsSchema.parse(result)).not.toThrow();
  });

  it('handles MappingError per-doc without crashing the pipeline when slug is absent from mapping', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr === MANIFEST_URL_SCHEMA) {
        return new Response(singleEntryManifest, { status: 200 });
      }
      if (urlStr === DOC_URL_SCHEMA) {
        return new Response('# Block Attributes\nSome content.', { status: 200 });
      }
      // GitHub Commits API
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    // minimalConfig uses mappings/test.json which is empty — 'block-attributes' has no entry
    // MappingError must be caught per-doc; the pipeline must not throw
    const result = await runPipeline(minimalConfig);

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0].slug).toBe('block-attributes');
    expect(result.docs[0].diagnostics.length).toBeGreaterThan(0);
    expect(result.docs[0].diagnostics[0]).toContain('block-attributes');
    expect(() => RunResultsSchema.parse(result)).not.toThrow();
  });
});
