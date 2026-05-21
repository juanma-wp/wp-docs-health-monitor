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

  // ---------------------------------------------------------------------------
  // JSX bracket unwrap — Pattern B Gap 1
  // ---------------------------------------------------------------------------

  it('unwraps JSX self-closing tags to bare identifiers', () => {
    // Symbol index keys on bare `PluginSidebar`, not on `<PluginSidebar />`.
    // Without unwrap, slotfill docs that reference the component this way
    // surface zero matchable symbols.
    const symbols = extractDocSymbols('Use `<PluginSidebar />` to add an entry.');
    expect(symbols).toContain('PluginSidebar');
    expect(symbols).not.toContain('<PluginSidebar />');
  });

  it('unwraps JSX opening and closing tags', () => {
    expect(extractDocSymbols('See `<PluginSidebar>` and `</PluginSidebar>`.'))
      .toEqual(['PluginSidebar']);
  });

  it('skips lowercase HTML elements (`<div>`, `<p>`) — components are uppercase by convention', () => {
    const symbols = extractDocSymbols('Wrap output in `<div>` or `<span />`.');
    expect(symbols).not.toContain('div');
    expect(symbols).not.toContain('span');
  });

  // ---------------------------------------------------------------------------
  // H1 heading extraction — Pattern B Gap 2
  // ---------------------------------------------------------------------------

  it('extracts H1 headings that look like a single identifier', () => {
    // SlotFill-style docs put the API name in the H1 (`# PluginSidebar`)
    // and never mention it again in inline backticks — without this rule
    // the symbol set is empty.
    const symbols = extractDocSymbols('# PluginSidebar\n\nThis slot allows…');
    expect(symbols).toContain('PluginSidebar');
  });

  it('rejects H1 headings that are plain English titles', () => {
    // `Accessibility`, `Tutorial`, `Overview` are too generic to be useful
    // index candidates — they have only one capital and no separator.
    expect(extractDocSymbols('# Accessibility\n\nGuidance…')).not.toContain('Accessibility');
    expect(extractDocSymbols('# Tutorial\n\nGuidance…')).not.toContain('Tutorial');
  });

  it('extracts kebab-case and snake_case H1 identifiers', () => {
    expect(extractDocSymbols('# theme-json\n\nDescribes theme.json…')).toContain('theme-json');
    expect(extractDocSymbols('# WP_Block\n\nCore PHP class…')).toContain('WP_Block');
  });

  it('extracts camelCase / hook-style H1 identifiers', () => {
    expect(extractDocSymbols('# useBlockProps\n\nReact hook…')).toContain('useBlockProps');
  });

  it('does NOT extract H2/H3 (H1 only by deliberate choice)', () => {
    const symbols = extractDocSymbols('## PluginSidebar\n\n### useBlockProps\n');
    expect(symbols).not.toContain('PluginSidebar');
    expect(symbols).not.toContain('useBlockProps');
  });

  it('ignores multi-word H1 titles (must be a single identifier-shaped token)', () => {
    expect(extractDocSymbols('# Block Editor Handbook\n\nWelcome…')).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Fenced code-block imports — Pattern B Gap 3
  // ---------------------------------------------------------------------------

  it('extracts JS/TS named imports from inside fenced code blocks', () => {
    // Reference docs like `plugin-post-publish-panel.md` show the import in a
    // ```js fence — without parsing fence content, the component name is
    // invisible to the lexical retrieval.
    const content = [
      '# PluginPostPublishPanel',
      '',
      '```js',
      "import { PluginPostPublishPanel } from '@wordpress/editor';",
      '```',
    ].join('\n');
    expect(extractDocSymbols(content)).toContain('PluginPostPublishPanel');
  });

  it('handles aliased imports — extracts the original name, not the alias', () => {
    const content =
      '```js\n' +
      "import { __experimentalMainDashboardButton as MainDashboardButton } from '@wordpress/edit-post';\n" +
      '```';
    const symbols = extractDocSymbols(content);
    expect(symbols).toContain('__experimentalMainDashboardButton');
    // The alias is the local name in the example, not what the index knows.
    expect(symbols).not.toContain('MainDashboardButton');
  });

  it('extracts JS default imports', () => {
    const content = '```js\nimport React from \'react\';\nimport defaultExport from \'./foo\';\n```';
    const symbols = extractDocSymbols(content);
    expect(symbols).toContain('React');
    expect(symbols).toContain('defaultExport');
  });

  it('extracts multi-line and type-only imports', () => {
    const content = [
      '```ts',
      'import {',
      '  PluginSidebar,',
      '  PluginSidebarMoreMenuItem,',
      '  type EditorProps,',
      "} from '@wordpress/editor';",
      "import type EditorDefault from '@wordpress/editor';",
      '```',
    ].join('\n');
    const symbols = extractDocSymbols(content);
    expect(symbols).toContain('PluginSidebar');
    expect(symbols).toContain('PluginSidebarMoreMenuItem');
    expect(symbols).toContain('EditorProps');
    expect(symbols).toContain('EditorDefault');
  });

  it('extracts the trailing segment of PHP `use` statements', () => {
    const content = [
      '```php',
      'use WP_Block_Type_Registry;',
      'use WP\\Blocks\\WP_Block;',
      'use WP\\Blocks\\WP_Block_Type as BlockType;',
      '```',
    ].join('\n');
    const symbols = extractDocSymbols(content);
    expect(symbols).toContain('WP_Block_Type_Registry');
    expect(symbols).toContain('WP_Block');
    // `as` alias is local naming; the original class is what the index keys on.
    expect(symbols).toContain('WP_Block_Type');
  });

  it('combines all three sources (backticks + H1 + fenced imports) into one set', () => {
    // The canonical SlotFill-style doc shape: H1 with the API name, prose
    // description, JS example with the import. All three converge on the
    // same identifier — dedupe via Set.
    const content = [
      '# PluginSidebar',
      '',
      'This slot allows adding items. Use `registerPlugin` to register.',
      '',
      '```js',
      "import { PluginSidebar } from '@wordpress/editor';",
      "import { registerPlugin } from '@wordpress/plugins';",
      '```',
    ].join('\n');
    const symbols = extractDocSymbols(content);
    expect(symbols).toContain('PluginSidebar');     // H1 + fenced import (deduped)
    expect(symbols).toContain('registerPlugin');     // inline backtick + fenced import (deduped)
    // Set semantics: each appears exactly once.
    expect(symbols.filter(s => s === 'PluginSidebar')).toHaveLength(1);
    expect(symbols.filter(s => s === 'registerPlugin')).toHaveLength(1);
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
