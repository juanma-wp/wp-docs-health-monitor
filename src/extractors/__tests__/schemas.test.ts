import { describe, it, expect } from 'vitest';
import { extractSchemasFromFiles, formatSchemasAsText, isSchemaFile } from '../schemas.js';
import type { CodeFile } from '../../types/mapping.js';
import type { CodeSource } from '../../adapters/code-source/types.js';

function makeCodeSource(files: Record<string, string>): CodeSource {
  return {
    readFile:      async (p: string) => {
      if (!(p in files)) throw new Error(`Not found: ${p}`);
      return files[p]!;
    },
    listDir:       async () => [],
    getCommitSha:  async () => 'sha',
  };
}

describe('isSchemaFile', () => {
  it('matches .json paths regardless of casing', () => {
    expect(isSchemaFile('schemas/json/block.json')).toBe(true);
    expect(isSchemaFile('Foo.JSON')).toBe(true);
  });

  it('does not match TS, JS, PHP, or other extensions', () => {
    expect(isSchemaFile('foo.ts')).toBe(false);
    expect(isSchemaFile('foo.php')).toBe(false);
    expect(isSchemaFile('foo.md')).toBe(false);
    expect(isSchemaFile('Makefile')).toBe(false);
  });
});

describe('extractSchemasFromFiles', () => {
  it('returns content of every JSON file in the mapping', async () => {
    const files: CodeFile[] = [
      { repo: 'gutenberg', path: 'a.json' },
      { repo: 'gutenberg', path: 'b.json' },
    ];
    const sources = {
      gutenberg: makeCodeSource({
        'a.json': '{ "x": 1 }',
        'b.json': '{ "y": 2 }',
      }),
    };
    const schemas = await extractSchemasFromFiles(files, sources);
    expect(schemas).toHaveLength(2);
    expect(schemas[0].path).toBe('a.json');
    expect(schemas[0].content).toBe('{ "x": 1 }');
    expect(schemas[0].truncated).toBe(false);
    expect(schemas[1].path).toBe('b.json');
  });

  it('skips non-JSON files', async () => {
    const files: CodeFile[] = [
      { repo: 'gutenberg', path: 'a.json' },
      { repo: 'gutenberg', path: 'b.ts' },
      { repo: 'gutenberg', path: 'c.php' },
    ];
    const sources = {
      gutenberg: makeCodeSource({
        'a.json': '{}',
        'b.ts':   'export const x = 1;',
        'c.php':  '<?php',
      }),
    };
    const schemas = await extractSchemasFromFiles(files, sources);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].path).toBe('a.json');
  });

  it('truncates content above the cap and flags it', async () => {
    const huge = '{ "x": "' + 'a'.repeat(85_000) + '" }';
    const files: CodeFile[] = [{ repo: 'gutenberg', path: 'big.json' }];
    const sources = { gutenberg: makeCodeSource({ 'big.json': huge }) };
    const schemas = await extractSchemasFromFiles(files, sources);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].truncated).toBe(true);
    expect(schemas[0].content.length).toBe(80_000);
  });

  it('does not truncate content under the cap', async () => {
    const content = '{ "x": "' + 'a'.repeat(50_000) + '" }';
    const files: CodeFile[] = [{ repo: 'gutenberg', path: 'medium.json' }];
    const sources = { gutenberg: makeCodeSource({ 'medium.json': content }) };
    const schemas = await extractSchemasFromFiles(files, sources);
    expect(schemas[0].truncated).toBe(false);
    expect(schemas[0].content).toBe(content);
  });

  it('skips files whose repo has no source', async () => {
    const files: CodeFile[] = [
      { repo: 'unknown',   path: 'a.json' },
      { repo: 'gutenberg', path: 'b.json' },
    ];
    const sources = { gutenberg: makeCodeSource({ 'b.json': '{}' }) };
    const schemas = await extractSchemasFromFiles(files, sources);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].repo).toBe('gutenberg');
  });

  it('skips unreadable files without throwing', async () => {
    const files: CodeFile[] = [
      { repo: 'gutenberg', path: 'missing.json' },
      { repo: 'gutenberg', path: 'present.json' },
    ];
    const sources = { gutenberg: makeCodeSource({ 'present.json': '{}' }) };
    const schemas = await extractSchemasFromFiles(files, sources);
    expect(schemas).toHaveLength(1);
    expect(schemas[0].path).toBe('present.json');
  });
});

describe('formatSchemasAsText', () => {
  it('renders each schema as a fenced JSON block with repo+path header', () => {
    const text = formatSchemasAsText([
      { repo: 'gutenberg', path: 'schemas/json/block.json', content: '{ "x": 1 }', truncated: false },
    ]);
    expect(text).toContain('### [gutenberg] schemas/json/block.json');
    expect(text).toContain('```json\n{ "x": 1 }\n```');
  });

  it('flags truncated schemas in the header', () => {
    const text = formatSchemasAsText([
      { repo: 'gutenberg', path: 'big.json', content: '{}', truncated: true },
    ]);
    expect(text).toContain('### [gutenberg] big.json  (truncated)');
  });

  it('returns empty string for empty input', () => {
    expect(formatSchemasAsText([])).toBe('');
  });

  it('separates multiple schemas with a blank line', () => {
    const text = formatSchemasAsText([
      { repo: 'r', path: 'a.json', content: '{}', truncated: false },
      { repo: 'r', path: 'b.json', content: '{}', truncated: false },
    ]);
    expect(text).toContain('\n\n');
  });
});
