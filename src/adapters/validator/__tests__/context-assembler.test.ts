import { describe, it, expect } from 'vitest';
import { extractDocSymbols, findMissingSymbols, isTestFile, TOKEN_BUDGET } from '../context-assembler.js';

describe('TOKEN_BUDGET', () => {
  // Pinned because the budget is the lever for the "spend on context"
  // rule in CLAUDE.md. Drops below 200K should be a deliberate change
  // visible in a PR diff, not an accidental revert during refactoring.
  it('is sized for 1M-context models, not the older 50K constraint', () => {
    expect(TOKEN_BUDGET).toBeGreaterThanOrEqual(200_000);
  });
});

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

  it('ignores primitive type names and literals (denylist)', () => {
    const content =
      'Type `string`, `boolean`, or `number`. Default: `null`. Returns `true` or `false`. Use `registerBlockType`.';
    const symbols = extractDocSymbols(content);
    expect(symbols).toContain('registerBlockType');
    expect(symbols).not.toContain('string');
    expect(symbols).not.toContain('boolean');
    expect(symbols).not.toContain('number');
    expect(symbols).not.toContain('null');
    expect(symbols).not.toContain('true');
    expect(symbols).not.toContain('false');
  });

  it('strips call parens so call-form tokens match indexed bare identifiers', () => {
    // Without this normalization `registerBlockVariation()` never matches the
    // index entry from `export const registerBlockVariation = (...)`, and the
    // canonical implementation file goes silently missing from candidates.
    const symbols = extractDocSymbols('Call `registerBlockVariation()` to register one.');
    expect(symbols).toContain('registerBlockVariation');
    expect(symbols).not.toContain('registerBlockVariation()');
  });

  it('strips namespace/object prefixes from call-form tokens', () => {
    const symbols = extractDocSymbols(
      'Use `wp.blocks.registerBlockVariation()` and `wp.blocks.unregisterBlockVariation()`.',
    );
    expect(symbols).toContain('registerBlockVariation');
    expect(symbols).toContain('unregisterBlockVariation');
  });

  it('strips PHP `::` and `->` from call-form tokens', () => {
    const symbols = extractDocSymbols(
      'Call `WP_Block_Type_Registry::get_instance()` then `$registry->register()`.',
    );
    expect(symbols).toContain('get_instance');
    expect(symbols).toContain('register');
  });

  it('leaves bare dotted tokens (e.g. file names) untouched', () => {
    // `block.json` has no parens — it's a filename, not a call. The dotted-
    // segment rule must not apply or we'd lose `block.json` and emit `json`.
    const symbols = extractDocSymbols('Edit `block.json` to set `registerBlockType`.');
    expect(symbols).toContain('block.json');
    expect(symbols).toContain('registerBlockType');
    expect(symbols).not.toContain('json');
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

  it('matches /__tests__/ case-insensitively', () => {
    expect(isTestFile('src/__TESTS__/foo.ts')).toBe(true);
    expect(isTestFile('src/__Tests__/foo.ts')).toBe(true);
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
