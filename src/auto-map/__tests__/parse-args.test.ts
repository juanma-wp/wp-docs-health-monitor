import { describe, it, expect, vi, afterEach } from 'vitest';

import { parseArgs } from '../parse-args.js';

// Use a sentinel `process.argv[0..1]` prefix so tests focus on the user args.
function argv(...flags: string[]): string[] {
  return ['node', 'auto-map.ts', ...flags];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseArgs — --force-regenerate flag', () => {
  it('returns forceRegenerate: false when the flag is absent', () => {
    const args = parseArgs(argv('block-metadata'));
    expect(args.forceRegenerate).toBe(false);
  });

  it('returns forceRegenerate: true when --force-regenerate is present', () => {
    const args = parseArgs(argv('block-metadata', '--force-regenerate'));
    expect(args.forceRegenerate).toBe(true);
  });

  it('--force-regenerate composes with other flags without consuming the slug', () => {
    const args = parseArgs(argv('block-metadata', '--write', '--force-regenerate'));
    expect(args.slug).toBe('block-metadata');
    expect(args.write).toBe(true);
    expect(args.forceRegenerate).toBe(true);
  });

  it('--force-regenerate is order-independent (before vs after slug)', () => {
    const beforeSlug = parseArgs(argv('--force-regenerate', 'block-metadata'));
    const afterSlug  = parseArgs(argv('block-metadata', '--force-regenerate'));
    expect(beforeSlug.slug).toBe('block-metadata');
    expect(beforeSlug.forceRegenerate).toBe(true);
    expect(afterSlug.slug).toBe('block-metadata');
    expect(afterSlug.forceRegenerate).toBe(true);
  });
});

describe('parseArgs — pre-existing flags still parsed', () => {
  it('parses slug + defaults', () => {
    const args = parseArgs(argv('block-metadata'));
    expect(args.slug).toBe('block-metadata');
    expect(args.write).toBe(false);
    expect(args.rerank).toBe(true);
    expect(args.explain).toBe(false);
    expect(args.review).toBe(false);
    expect(args.forceRegenerate).toBe(false);
  });

  it('parses --write', () => {
    expect(parseArgs(argv('s', '--write')).write).toBe(true);
  });

  it('parses --no-rerank', () => {
    expect(parseArgs(argv('s', '--no-rerank')).rerank).toBe(false);
  });

  it('parses --explain', () => {
    expect(parseArgs(argv('s', '--explain')).explain).toBe(true);
  });

  it('--review implies --write', () => {
    const args = parseArgs(argv('s', '--review'));
    expect(args.review).toBe(true);
    expect(args.write).toBe(true);
  });
});
