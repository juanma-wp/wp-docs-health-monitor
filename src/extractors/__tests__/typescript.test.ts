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

  it('extracts exported interface with structured members', () => {
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
    expect(symbols[0].signature).toBe('BlockVariation');
    expect(symbols[0].members).toHaveLength(3);
    expect(symbols[0].members?.[0].signature).toBe('title: string');
    expect(symbols[0].members?.[1].signature).toBe('scope?: BlockVariationScope[]');
    expect(symbols[0].members?.[2].signature).toContain('isActive(blockAttributes: Record<string, unknown>): boolean');
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

  it('captures JSDoc description above an exported function', () => {
    const src = `
/**
 * Registers a new block type.
 */
export function registerBlockType(name: string): BlockType {
  return null as any;
}
`;
    const symbols = extractSymbolsFromSource(src, 'registration.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].jsdoc?.description).toBe('Registers a new block type.');
  });

  it('leaves jsdoc undefined when no JSDoc is present', () => {
    const src = `export function noDoc(): void {}`;
    const symbols = extractSymbolsFromSource(src, 'foo.ts');
    expect(symbols[0].jsdoc).toBeUndefined();
  });

  it('attaches the same JSDoc to every const in a multi-declaration statement', () => {
    const src = `
/** Shared doc. */
export const A = 1, B = 2;
`;
    const symbols = extractSymbolsFromSource(src, 'consts.ts');
    expect(symbols).toHaveLength(2);
    expect(symbols[0].jsdoc?.description).toBe('Shared doc.');
    expect(symbols[1].jsdoc?.description).toBe('Shared doc.');
  });
});

describe('extractSymbolsFromSource — JSDoc capture', () => {
  it('captures @deprecated tag on a function', () => {
    const src = `
/**
 * Registers a new block.
 * @deprecated Use registerBlockTypeFromMetadata instead
 */
export function registerBlockType(name: string): void {}
`;
    const symbols = extractSymbolsFromSource(src, 'registration.ts');
    expect(symbols[0].jsdoc).toBeDefined();
    expect(symbols[0].jsdoc?.description).toBe('Registers a new block.');
    expect(symbols[0].jsdoc?.deprecated).toBe('Use registerBlockTypeFromMetadata instead');
  });

  it('captures bare @deprecated marker (empty value)', () => {
    const src = `
/**
 * @deprecated
 */
export function oldFn(): void {}
`;
    const symbols = extractSymbolsFromSource(src, 'foo.ts');
    expect(symbols[0].jsdoc?.deprecated).toBe('');
  });

  it('captures prose description on a type alias', () => {
    const src = `
/**
 * The icon for a block — can be a string, a React element, or a component.
 */
export type Icon = string | ReactElement | ComponentType;
`;
    const symbols = extractSymbolsFromSource(src, 'types.ts');
    expect(symbols[0].jsdoc?.description).toBe(
      'The icon for a block — can be a string, a React element, or a component.'
    );
  });

  it('captures @default and description on interface members', () => {
    const src = `
export interface BlockVariation {
  /**
   * The unique and machine-readable name.
   */
  name: string;
  /**
   * The list of scopes where the variation is applicable.
   * @default ['block', 'inserter']
   */
  scope?: BlockVariationScope[];
  /**
   * @since 5.9.0
   */
  isDefault?: boolean;
}
`;
    const symbols = extractSymbolsFromSource(src, 'types.ts');
    expect(symbols[0].members).toHaveLength(3);

    expect(symbols[0].members?.[0].jsdoc?.description).toBe('The unique and machine-readable name.');

    expect(symbols[0].members?.[1].jsdoc?.description).toBe(
      'The list of scopes where the variation is applicable.'
    );
    expect(symbols[0].members?.[1].jsdoc?.default).toBe("['block', 'inserter']");

    expect(symbols[0].members?.[2].jsdoc?.since).toBe('5.9.0');
  });

  it('leaves jsdoc undefined for symbols with no JSDoc comment', () => {
    const src = `export function plain(): void {}`;
    const symbols = extractSymbolsFromSource(src, 'plain.ts');
    expect(symbols[0].jsdoc).toBeUndefined();
  });

  it('handles interface with mixed member JSDoc presence', () => {
    const src = `
export interface Mixed {
  /** Documented. */
  a: string;
  b: number;
}
`;
    const symbols = extractSymbolsFromSource(src, 'mixed.ts');
    expect(symbols[0].members?.[0].jsdoc?.description).toBe('Documented.');
    expect(symbols[0].members?.[1].jsdoc).toBeUndefined();
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

  it('renders JSDoc description and @default below a top-level symbol', () => {
    const files: ExtractedFile[] = [
      {
        repo: 'gutenberg',
        path: 'foo.ts',
        symbols: [
          {
            kind: 'function',
            name: 'foo',
            signature: 'foo(): void',
            jsdoc: { description: 'Does the foo thing.', deprecated: 'Use bar' },
          },
        ],
      },
    ];

    const text = formatSymbolsAsText(files);
    expect(text).toContain('  foo(): void');
    expect(text).toContain('    Does the foo thing.');
    expect(text).toContain('    @deprecated Use bar');
  });

  it('renders interface members with their JSDoc indented under the member', () => {
    const files: ExtractedFile[] = [
      {
        repo: 'gutenberg',
        path: 'types.ts',
        symbols: [
          {
            kind: 'interface',
            name: 'BlockVariation',
            signature: 'BlockVariation',
            members: [
              {
                name: 'scope',
                signature: 'scope?: BlockVariationScope[]',
                jsdoc: {
                  description: 'The list of scopes where the variation is applicable.',
                  default: "['block', 'inserter']",
                },
              },
              { name: 'title', signature: 'title: string' },
            ],
          },
        ],
      },
    ];

    const text = formatSymbolsAsText(files);
    expect(text).toContain('  BlockVariation {');
    expect(text).toContain('    scope?: BlockVariationScope[]');
    expect(text).toContain('      The list of scopes where the variation is applicable.');
    expect(text).toContain("      @default ['block', 'inserter']");
    expect(text).toContain('    title: string');
    expect(text).toContain('  }');
  });

  it('falls back to raw docComment when jsdoc is absent (PHP extractor compat)', () => {
    const files: ExtractedFile[] = [
      {
        repo: 'wordpress-develop',
        path: 'wp-includes/blocks.php',
        symbols: [
          {
            kind: 'function',
            name: 'register_block_type',
            signature: 'register_block_type(string $name): WP_Block_Type|false',
            docComment: '/**\n * Registers a block type.\n * @deprecated\n */',
          },
        ],
      },
    ];
    const text = formatSymbolsAsText(files);
    expect(text).toContain('  register_block_type(');
    expect(text).toContain('    /**');
    expect(text).toContain('     * Registers a block type.');
    expect(text).toContain('     * @deprecated');
  });
});
