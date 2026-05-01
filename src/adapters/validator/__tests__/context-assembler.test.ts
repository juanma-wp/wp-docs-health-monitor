import { describe, it, expect } from 'vitest';
import { extractDocSymbols, findMissingSymbols, isTestFile } from '../context-assembler.js';

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

describe('isTestFile', () => {
  it('matches the WordPress /test/ directory convention', () => {
    expect(isTestFile('packages/blocks/src/api/test/registration.js')).toBe(true);
    expect(isTestFile('test/foo.js')).toBe(true);
  });

  it('matches the /tests/ directory convention (e.g. WP core phpunit)', () => {
    expect(isTestFile('tests/phpunit/tests/blocks/foo.php')).toBe(true);
    expect(isTestFile('src/wp-includes/tests/foo.php')).toBe(true);
  });

  it('matches the /__tests__/ Jest-style directory', () => {
    expect(isTestFile('src/__tests__/foo.ts')).toBe(true);
    expect(isTestFile('packages/blocks/__tests__/foo.tsx')).toBe(true);
  });

  it('matches *.test.{js,jsx,ts,tsx} filenames', () => {
    expect(isTestFile('src/foo.test.ts')).toBe(true);
    expect(isTestFile('src/foo.test.tsx')).toBe(true);
    expect(isTestFile('src/foo.test.js')).toBe(true);
    expect(isTestFile('src/foo.test.jsx')).toBe(true);
  });

  it('matches *.spec.{js,jsx,ts,tsx} filenames', () => {
    expect(isTestFile('src/foo.spec.ts')).toBe(true);
    expect(isTestFile('src/foo.spec.js')).toBe(true);
  });

  it('does not match implementation files containing the word "test" elsewhere', () => {
    expect(isTestFile('src/contains-test-not-real/foo.ts')).toBe(false);
    expect(isTestFile('src/testing-utilities.ts')).toBe(false);
    expect(isTestFile('src/foo-tested.ts')).toBe(false);
  });

  it('does not match plain implementation files', () => {
    expect(isTestFile('packages/blocks/src/api/registration.ts')).toBe(false);
    expect(isTestFile('src/wp-includes/class-wp-block-type.php')).toBe(false);
    expect(isTestFile('schemas/json/block.json')).toBe(false);
  });
});
