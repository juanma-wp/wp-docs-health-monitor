import { describe, it, expect } from 'vitest';
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
  outputDir: './out',
  validator: { type: 'claude', model: 'claude-sonnet-4-6' },
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
    const fp = fingerprintIssue('block-metadata', 'type-signature', 'src/index.ts', 'update the foo');
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is stable: same inputs produce the same fingerprint', () => {
    const a = fingerprintIssue('block-metadata', 'type-signature', 'src/index.ts', 'update the foo');
    const b = fingerprintIssue('block-metadata', 'type-signature', 'src/index.ts', 'update the foo');
    expect(a).toBe(b);
  });

  it('is whitespace-tolerant: extra spaces produce the same fingerprint', () => {
    const a = fingerprintIssue('block-metadata', 'type-signature', 'src/index.ts', 'update the foo');
    const b = fingerprintIssue('block-metadata', 'type-signature', 'src/index.ts', '  update  the  foo  ');
    expect(a).toBe(b);
  });

  it('produces different fingerprints for different slugs', () => {
    const a = fingerprintIssue('block-metadata', 'type-signature', 'src/index.ts', 'update the foo');
    const b = fingerprintIssue('block-supports', 'type-signature', 'src/index.ts', 'update the foo');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// runPipeline stub
// ---------------------------------------------------------------------------

describe('runPipeline', () => {
  it('returns a RunResults with a correctly-formatted runId', async () => {
    const result = await runPipeline(minimalConfig);
    expect(result.runId).toMatch(/^\d{8}-\d{6}$/);
  });

  it('returns a result that passes RunResultsSchema.parse', async () => {
    const result = await runPipeline(minimalConfig);
    expect(() => RunResultsSchema.parse(result)).not.toThrow();
  });
});
