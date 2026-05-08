import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  RerankCache,
  RERANK_CACHE_VERSION,
} from '../rerank-cache.js';
import type { Candidate, RerankResult } from '../rerank.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpCacheDir(): string {
  return mkdtempSync(join(tmpdir(), 'rerank-cache-test-'));
}

function makeCandidate(repo: string, path: string, score: number, matchedSymbols: string[] = []): Candidate {
  return { repo, path, score, matchedSymbols };
}

const SAMPLE_RESULT: RerankResult = {
  primary: [
    { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical impl', confidence: 0.95 },
  ],
  secondary: [
    { repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js', rationale: 'parser', confidence: 0.85 },
  ],
  context: [
    { repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts', rationale: 'helpers', confidence: 0.7 },
  ],
  dropped: [
    { repo: 'gutenberg', path: 'packages/deprecated/src/index.ts', reason: 'unrelated logger named `deprecated`' },
  ],
};

const SAMPLE_DOC = '# block-metadata\n\nDocs about block metadata.';
const SAMPLE_MODEL = 'claude-sonnet-4-6';

const SAMPLE_CANDIDATES: Candidate[] = [
  makeCandidate('gutenberg', 'packages/blocks/src/api/registration.js', 5.0, ['registerBlockType']),
  makeCandidate('gutenberg', 'packages/blocks/src/api/parser.js',       3.0, ['parse']),
  makeCandidate('gutenberg', 'packages/deprecated/src/index.ts',        1.0, ['deprecated']),
];

// ---------------------------------------------------------------------------
// get / put round-trip
// ---------------------------------------------------------------------------

describe('RerankCache — get/put round-trip', () => {
  it('returns null for a missing key', () => {
    const cache = new RerankCache(tmpCacheDir());
    const key = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });
    expect(cache.get(key)).toBeNull();
  });

  it('round-trips a stored RerankResult', () => {
    const cache = new RerankCache(tmpCacheDir());
    const key = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });
    cache.put(key, SAMPLE_RESULT);

    const recovered = cache.get(key);
    expect(recovered).toEqual(SAMPLE_RESULT);
  });

  it('creates the cache directory on first put', () => {
    const dir = join(tmpCacheDir(), 'nested-not-yet-created');
    expect(existsSync(dir)).toBe(false);

    const cache = new RerankCache(dir);
    const key = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });
    cache.put(key, SAMPLE_RESULT);

    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Key derivation — what changes the key, what doesn't
// ---------------------------------------------------------------------------

describe('RerankCache — key derivation', () => {
  it('produces different keys for different doc content (cache miss across docs)', () => {
    const cache = new RerankCache(tmpCacheDir());
    const k1 = cache.keyFor({ docContent: 'doc A', candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });
    const k2 = cache.keyFor({ docContent: 'doc B', candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });
    expect(k1).not.toBe(k2);

    cache.put(k1, SAMPLE_RESULT);
    expect(cache.get(k2)).toBeNull();
  });

  it('produces the same key when candidates are reordered (canonical sort)', () => {
    const cache = new RerankCache(tmpCacheDir());

    const ordered = [...SAMPLE_CANDIDATES];
    const scrambled = [SAMPLE_CANDIDATES[2], SAMPLE_CANDIDATES[0], SAMPLE_CANDIDATES[1]];

    const k1 = cache.keyFor({ docContent: SAMPLE_DOC, candidates: ordered,   model: SAMPLE_MODEL });
    const k2 = cache.keyFor({ docContent: SAMPLE_DOC, candidates: scrambled, model: SAMPLE_MODEL });
    expect(k1).toBe(k2);
  });

  it('produces the same key when score-tied candidates appear in different orders (lex tiebreak)', () => {
    const cache = new RerankCache(tmpCacheDir());

    const a: Candidate[] = [
      makeCandidate('alpha', 'a.ts', 5.0),
      makeCandidate('beta',  'b.ts', 5.0),
      makeCandidate('alpha', 'b.ts', 5.0),
    ];
    const b: Candidate[] = [
      makeCandidate('beta',  'b.ts', 5.0),
      makeCandidate('alpha', 'b.ts', 5.0),
      makeCandidate('alpha', 'a.ts', 5.0),
    ];

    const ka = cache.keyFor({ docContent: SAMPLE_DOC, candidates: a, model: SAMPLE_MODEL });
    const kb = cache.keyFor({ docContent: SAMPLE_DOC, candidates: b, model: SAMPLE_MODEL });
    expect(ka).toBe(kb);
  });

  it('produces different keys for different model names', () => {
    const cache = new RerankCache(tmpCacheDir());
    const k1 = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: 'claude-sonnet-4-6' });
    const k2 = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: 'claude-opus-4-7' });
    expect(k1).not.toBe(k2);
  });

  it('produces different keys when a candidate is added/removed', () => {
    const cache = new RerankCache(tmpCacheDir());
    const k1 = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });
    const k2 = cache.keyFor({
      docContent: SAMPLE_DOC,
      candidates: [...SAMPLE_CANDIDATES, makeCandidate('gutenberg', 'extra.ts', 0.5)],
      model:      SAMPLE_MODEL,
    });
    expect(k1).not.toBe(k2);
  });

  it('uses a 16-char hex key (filename-friendly)', () => {
    const cache = new RerankCache(tmpCacheDir());
    const key = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// Version handling — bumping invalidates older entries
// ---------------------------------------------------------------------------

describe('RerankCache — version invalidation', () => {
  it('treats a cache file with a different version field as a miss', () => {
    const dir = tmpCacheDir();
    const cache = new RerankCache(dir);
    const key = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });

    // Hand-write a stale cache file under the same key but with a wrong version.
    writeFileSync(
      join(dir, `${key}.json`),
      JSON.stringify({ version: RERANK_CACHE_VERSION + 99, result: SAMPLE_RESULT }),
    );

    expect(cache.get(key)).toBeNull();
  });

  it('treats a malformed cache file as a miss without throwing', () => {
    const dir = tmpCacheDir();
    const cache = new RerankCache(dir);
    const key = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });

    writeFileSync(join(dir, `${key}.json`), '{ this is not valid json');

    expect(cache.get(key)).toBeNull();
  });

  it('treats a cache file with a result that fails schema validation as a miss', () => {
    const dir = tmpCacheDir();
    const cache = new RerankCache(dir);
    const key = cache.keyFor({ docContent: SAMPLE_DOC, candidates: SAMPLE_CANDIDATES, model: SAMPLE_MODEL });

    writeFileSync(
      join(dir, `${key}.json`),
      JSON.stringify({
        version: RERANK_CACHE_VERSION,
        result:  { primary: 'not an array', secondary: [], context: [], dropped: [] },
      }),
    );

    expect(cache.get(key)).toBeNull();
  });
});
