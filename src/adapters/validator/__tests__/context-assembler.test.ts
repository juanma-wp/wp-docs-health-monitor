import { describe, it, expect } from 'vitest';
import { extractDocSymbols, findMissingSymbols } from '../context-assembler.js';

describe('extractDocSymbols', () => {
  it('extracts backtick-wrapped identifiers from doc content', () => {
    const content = 'Use `registerBlockType` and `block.json` to register blocks.';
    expect(extractDocSymbols(content)).toContain('registerBlockType');
    expect(extractDocSymbols(content)).toContain('block.json');
  });

  it('deduplicates repeated symbols', () => {
    const content = 'Call `registerBlockType` first, then `registerBlockType` again.';
    const symbols = extractDocSymbols(content);
    expect(symbols.filter(s => s === 'registerBlockType')).toHaveLength(1);
  });

  it('returns an empty array when there are no backtick identifiers', () => {
    expect(extractDocSymbols('No code here.')).toEqual([]);
  });

  it('ignores empty backtick pairs', () => {
    const symbols = extractDocSymbols('Look at `` and `valid`.');
    expect(symbols).not.toContain('');
    expect(symbols).toContain('valid');
  });
});

describe('findMissingSymbols', () => {
  const fileBlocks = [
    { repo: 'gutenberg', path: 'src/index.js', content: 'function registerBlockType(name, settings) {}', tier: 'primary' as const },
  ];

  it('returns symbols not found in any file block', () => {
    const missing = findMissingSymbols(['registerBlockType', 'source'], fileBlocks);
    expect(missing).toEqual(['source']);
  });

  it('returns empty array when all symbols are present', () => {
    const missing = findMissingSymbols(['registerBlockType'], fileBlocks);
    expect(missing).toEqual([]);
  });

  it('returns all symbols when file blocks are empty', () => {
    const missing = findMissingSymbols(['registerBlockType', 'source'], []);
    expect(missing).toEqual(['registerBlockType', 'source']);
  });

  it('returns empty array when symbols list is empty', () => {
    expect(findMissingSymbols([], fileBlocks)).toEqual([]);
  });
});
