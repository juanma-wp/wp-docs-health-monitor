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
    expect(args.all).toBe(false);
    expect(args.force).toBe(false);
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

  // ---------------------------------------------------------------------------
  // Batch mode (--all) — #94
  // ---------------------------------------------------------------------------

  it('parses --all and implies --write (opting out of write makes batch mode useless)', () => {
    const args = parseArgs(argv('--all'));
    expect(args.all).toBe(true);
    expect(args.write).toBe(true);
    expect(args.slug).toBe('');
    expect(args.force).toBe(false);
  });

  it('parses --all --force', () => {
    const args = parseArgs(argv('--all', '--force'));
    expect(args.all).toBe(true);
    expect(args.force).toBe(true);
  });

  it('--all + --no-rerank is a valid combination (cheap lexical-only batch)', () => {
    const args = parseArgs(argv('--all', '--no-rerank'));
    expect(args.all).toBe(true);
    expect(args.rerank).toBe(false);
    expect(args.write).toBe(true); // --all still implies --write
  });

  it('rejects combining <slug> with --all (mutually exclusive)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseArgs(argv('block-metadata', '--all'))).toThrow(/exit:1/);
    const allErr = errSpy.mock.calls.flat().join('\n');
    expect(allErr).toMatch(/cannot combine|mutually exclusive|both/i);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('rejects no slug and no --all (usage error)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parseArgs(argv())).toThrow(/exit:1/);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
