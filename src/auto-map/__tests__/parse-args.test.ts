import { describe, it, expect, vi, afterEach } from 'vitest';

import { parseArgs } from '../parse-args.js';

// Use a sentinel `process.argv[0..1]` prefix so tests focus on the user args.
function argv(...flags: string[]): string[] {
  return ['node', 'auto-map.ts', ...flags];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseArgs', () => {
  it('parses slug + defaults', () => {
    const args = parseArgs(argv('block-metadata'));
    expect(args.slug).toBe('block-metadata');
    expect(args.write).toBe(false);
    expect(args.rerank).toBe(true);
    expect(args.explain).toBe(false);
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

  it('flags are order-independent (before vs after slug)', () => {
    const beforeSlug = parseArgs(argv('--write', 'block-metadata'));
    const afterSlug  = parseArgs(argv('block-metadata', '--write'));
    expect(beforeSlug.slug).toBe('block-metadata');
    expect(beforeSlug.write).toBe(true);
    expect(afterSlug.slug).toBe('block-metadata');
    expect(afterSlug.write).toBe(true);
  });
});
