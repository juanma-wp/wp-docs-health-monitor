import { describe, it, expect } from 'vitest';
import { extractSymbolsFromSource, formatSymbolsAsText } from '../typescript.js';
import type { ExtractedFile } from '../types.js';

describe('extractSymbolsFromSource', () => {
  it('extracts exported function with typed params and return type', () => {
    const src = `
export function registerBlockType(
  blockNameOrMetadata: string | BlockConfiguration,
  settings?: Partial<BlockConfiguration>
): BlockType | undefined {
  return undefined;
}
`;
    const symbols = extractSymbolsFromSource(src, 'registration.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe('function');
    expect(symbols[0].name).toBe('registerBlockType');
    expect(symbols[0].signature).toContain('blockNameOrMetadata: string | BlockConfiguration');
    expect(symbols[0].signature).toContain('settings?: Partial<BlockConfiguration>');
    expect(symbols[0].signature).toContain(': BlockType | undefined');
  });

  it('ignores non-exported functions', () => {
    const src = `
function internal(): void {}
export function external(): void {}
`;
    const symbols = extractSymbolsFromSource(src, 'foo.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('external');
  });

  it('extracts exported interface with properties and methods', () => {
    const src = `
export interface BlockVariation {
  title: string;
  scope?: BlockVariationScope[];
  isActive?(blockAttributes: Record<string, unknown>): boolean;
}
`;
    const symbols = extractSymbolsFromSource(src, 'types.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe('interface');
    expect(symbols[0].name).toBe('BlockVariation');
    expect(symbols[0].signature).toContain('title: string');
    expect(symbols[0].signature).toContain('scope?: BlockVariationScope[]');
  });

  it('extracts exported type alias', () => {
    const src = `export type Icon = string | ReactElement | ComponentType;`;
    const symbols = extractSymbolsFromSource(src, 'types.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe('type');
    expect(symbols[0].name).toBe('Icon');
    expect(symbols[0].signature).toBe('Icon = string | ReactElement | ComponentType');
  });

  it('extracts exported const with explicit type', () => {
    const src = `export const DEFAULT_BLOCK_NAME: string = 'core/paragraph';`;
    const symbols = extractSymbolsFromSource(src, 'constants.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe('const');
    expect(symbols[0].name).toBe('DEFAULT_BLOCK_NAME');
    expect(symbols[0].signature).toContain('DEFAULT_BLOCK_NAME: string');
  });

  it('extracts arrow function const and infers signature', () => {
    const src = `export const getBlockType = (name: string): BlockType | undefined => undefined;`;
    const symbols = extractSymbolsFromSource(src, 'store.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('getBlockType');
    expect(symbols[0].signature).toContain('(name: string) => BlockType | undefined');
  });

  it('extracts exported enum', () => {
    const src = `export enum BlockVariationScope { Block = 'block', Inserter = 'inserter' }`;
    const symbols = extractSymbolsFromSource(src, 'types.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe('enum');
    expect(symbols[0].name).toBe('BlockVariationScope');
  });

  it('returns empty array for file with no exports', () => {
    const src = `const x = 1; function foo() {}`;
    expect(extractSymbolsFromSource(src, 'internal.ts')).toHaveLength(0);
  });

  it('handles rest parameters', () => {
    const src = `export function log(...args: unknown[]): void {}`;
    const symbols = extractSymbolsFromSource(src, 'utils.ts');
    expect(symbols[0].signature).toContain('...args: unknown[]');
  });
});

describe('formatSymbolsAsText', () => {
  it('formats extracted files as structured text block', () => {
    const files: ExtractedFile[] = [
      {
        repo: 'gutenberg',
        path: 'packages/blocks/src/api/registration.ts',
        symbols: [
          { kind: 'function', name: 'registerBlockType', signature: 'registerBlockType(name: string): void' },
          { kind: 'function', name: 'getBlockType', signature: 'getBlockType(name: string): BlockType | undefined' },
        ],
      },
    ];

    const text = formatSymbolsAsText(files);
    expect(text).toContain('[gutenberg] packages/blocks/src/api/registration.ts');
    expect(text).toContain('  registerBlockType(name: string): void');
    expect(text).toContain('  getBlockType(name: string): BlockType | undefined');
  });

  it('returns empty string for empty input', () => {
    expect(formatSymbolsAsText([])).toBe('');
  });

  it('separates multiple files with a blank line', () => {
    const files: ExtractedFile[] = [
      { repo: 'r', path: 'a.ts', symbols: [{ kind: 'const', name: 'A', signature: 'A: string' }] },
      { repo: 'r', path: 'b.ts', symbols: [{ kind: 'const', name: 'B', signature: 'B: number' }] },
    ];
    const text = formatSymbolsAsText(files);
    expect(text).toContain('\n\n');
  });
});
