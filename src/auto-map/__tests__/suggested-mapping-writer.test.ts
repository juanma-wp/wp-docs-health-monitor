import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { SuggestedMappingWriter } from '../suggested-mapping-writer.js';
import type { CodeTiers } from '../../types/mapping.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpSuggestedPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'suggested-writer-test-'));
  return join(dir, 'sample-site.suggested.json');
}

const TIERS_A: CodeTiers = {
  primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js' }],
  secondary: [{ repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js' }],
  context:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts' }],
};

const TIERS_B: CodeTiers = {
  primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/serializer.js' }],
  secondary: [],
  context:   [],
};

const TIERS_C: CodeTiers = {
  primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/factory.js' }],
  secondary: [],
  context:   [],
};

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe('SuggestedMappingWriter.read', () => {
  it('returns empty object when file is missing', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    expect(writer.read(path)).toEqual({});
  });

  it('returns empty object when file is malformed JSON', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writeFileSync(path, '{ this is not valid json');
    expect(writer.read(path)).toEqual({});
  });

  it('returns the parsed slug→tiers map when file exists', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-a', TIERS_A);
    expect(writer.read(path)).toEqual({ 'slug-a': TIERS_A });
  });
});

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

describe('SuggestedMappingWriter.upsert', () => {
  it('creates the file with one entry when it does not exist', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-a', TIERS_A);

    expect(existsSync(path)).toBe(true);
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw).toEqual({ 'slug-a': TIERS_A });
  });

  it('creates the parent directory if it does not yet exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'suggested-mkdir-'));
    const path = join(dir, 'nested', 'sub', 'site.suggested.json');
    const writer = new SuggestedMappingWriter();
    writer.upsert(path, 'slug-a', TIERS_A);
    expect(existsSync(path)).toBe(true);
  });

  it('preserves other slug entries when upserting a new slug', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-a', TIERS_A);
    writer.upsert(path, 'slug-b', TIERS_B);

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw).toEqual({ 'slug-a': TIERS_A, 'slug-b': TIERS_B });
  });

  it('replaces the target slug (no append semantics; latest view wins)', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-a', TIERS_A);
    writer.upsert(path, 'slug-a', TIERS_B);

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw).toEqual({ 'slug-a': TIERS_B });
    expect(Object.keys(raw)).toEqual(['slug-a']);
  });

  it('emits slug keys in deterministic (sorted) order', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'zeta',  TIERS_B);
    writer.upsert(path, 'alpha', TIERS_A);
    writer.upsert(path, 'mu',    TIERS_C);

    const text = readFileSync(path, 'utf-8');
    const idxAlpha = text.indexOf('"alpha"');
    const idxMu    = text.indexOf('"mu"');
    const idxZeta  = text.indexOf('"zeta"');
    expect(idxAlpha).toBeGreaterThan(0);
    expect(idxMu).toBeGreaterThan(idxAlpha);
    expect(idxZeta).toBeGreaterThan(idxMu);
  });

  it('treats a malformed existing file as empty (does not throw)', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writeFileSync(path, '{ broken json');
    expect(() => writer.upsert(path, 'slug-a', TIERS_A)).not.toThrow();
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw).toEqual({ 'slug-a': TIERS_A });
  });

  it('writes file ending in a trailing newline', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-a', TIERS_A);
    const text = readFileSync(path, 'utf-8');
    expect(text.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe('SuggestedMappingWriter.remove', () => {
  it('deletes the target slug entry', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-a', TIERS_A);
    writer.upsert(path, 'slug-b', TIERS_B);

    writer.remove(path, 'slug-a');

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw).toEqual({ 'slug-b': TIERS_B });
  });

  it('is a no-op when the slug is absent (other slugs untouched)', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-b', TIERS_B);

    writer.remove(path, 'slug-a');

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw).toEqual({ 'slug-b': TIERS_B });
  });

  it('is a no-op when the file does not exist (does not create it, does not throw)', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    expect(() => writer.remove(path, 'slug-a')).not.toThrow();
    expect(existsSync(path)).toBe(false);
  });

  it('leaves `{}\\n` rather than deleting the file when the last slug is removed', () => {
    const writer = new SuggestedMappingWriter();
    const path = tmpSuggestedPath();
    writer.upsert(path, 'slug-a', TIERS_A);

    writer.remove(path, 'slug-a');

    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf-8');
    expect(text).toBe('{}\n');
  });
});
