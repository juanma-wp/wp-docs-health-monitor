import { describe, it, expect } from 'vitest';
import {
  buildSymbolIndex,
  scoreFilesAcrossRepos,
  findFilesByTreeHeuristic,
  type SymbolIndex,
} from '../symbol-index.js';
import type { CodeSource } from '../../adapters/code-source/types.js';

// --- helpers ---

function makeSource(files: Record<string, string>): CodeSource {
  return {
    readFile: async (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error(`mock: file not found: ${path}`);
      return content;
    },
    listDir: async () => Object.keys(files),
    getCommitSha: async () => 'test-sha-001',
  };
}

function makeIndex(
  repoId: string,
  symbols: Record<string, string[]>,
  hooks: Record<string, string[]> = {},
  files: string[] = [],
): SymbolIndex {
  return { repoId, commitSha: 'sha', builtAt: '2025-01-01T00:00:00Z', files, symbols, hooks };
}

// --- buildSymbolIndex ---

describe('buildSymbolIndex', () => {
  it('extracts exported TypeScript symbols', async () => {
    const source = makeSource({
      'src/registration.ts': 'export function registerBlockType(name: string) {}',
      'src/utils.ts': 'function internalHelper() {}',  // not exported
    });

    const index = await buildSymbolIndex('test-repo', source, { cacheDir: null });

    expect(index.symbols['registerBlockType']).toEqual(['src/registration.ts']);
    expect(index.symbols['internalHelper']).toBeUndefined();
  });

  it('extracts WordPress hooks', async () => {
    const source = makeSource({
      'src/hooks.ts': "applyFilters('blocks.registerBlockType', settings, name);",
    });

    const index = await buildSymbolIndex('test-repo', source, { cacheDir: null });

    expect(index.hooks['blocks.registerBlockType']).toEqual(['src/hooks.ts']);
  });

  it('extracts PHP symbols', async () => {
    const source = makeSource({
      'src/blocks.php': '<?php function register_block_type($name, $args = []) {}',
    });

    const index = await buildSymbolIndex('test-repo', source, { cacheDir: null });

    expect(index.symbols['register_block_type']).toEqual(['src/blocks.php']);
  });

  it('skips build/dist/coverage paths', async () => {
    const source = makeSource({
      'build/index.js': 'export function generated() {}',
      'dist/bundle.js': 'export function bundled() {}',
      'coverage/lcov.ts': 'export function covered() {}',
      'src/real.ts': 'export function real() {}',
    });

    const index = await buildSymbolIndex('test-repo', source, { cacheDir: null });

    expect(index.symbols['generated']).toBeUndefined();
    expect(index.symbols['bundled']).toBeUndefined();
    expect(index.symbols['covered']).toBeUndefined();
    expect(index.symbols['real']).toEqual(['src/real.ts']);
  });

  it('skips non-indexable file extensions', async () => {
    const source = makeSource({
      'README.md': 'Some docs',
      'config.json': '{}',
      'src/main.ts': 'export const x = 1;',
    });

    const index = await buildSymbolIndex('test-repo', source, { cacheDir: null });

    expect(Object.keys(index.symbols)).toEqual(['x']);
  });

  it('populates metadata fields', async () => {
    const source = makeSource({ 'src/a.ts': 'export const a = 1;' });
    const index = await buildSymbolIndex('my-repo', source, { cacheDir: null });

    expect(index.repoId).toBe('my-repo');
    expect(index.commitSha).toBe('test-sha-001');
    expect(typeof index.builtAt).toBe('string');
  });

  it('populates files with the full repo file list', async () => {
    const source = makeSource({
      'src/a.ts': 'export const a = 1;',
      'README.md': '# Docs',
    });
    const index = await buildSymbolIndex('my-repo', source, { cacheDir: null });

    expect(index.files).toContain('src/a.ts');
    expect(index.files).toContain('README.md');
  });

  it('skips __tests__ directory paths', async () => {
    const source = makeSource({
      'src/__tests__/registration.test.ts': 'export function registerBlockType() {}',
      'src/registration.ts': 'export function registerBlockType() {}',
    });

    const index = await buildSymbolIndex('test-repo', source, { cacheDir: null });

    // The test file symbol should not appear; only the production file
    const paths = index.symbols['registerBlockType'] ?? [];
    expect(paths).not.toContain('src/__tests__/registration.test.ts');
    expect(paths).toContain('src/registration.ts');
  });

  it('skips *.test.ts and *.spec.ts files', async () => {
    const source = makeSource({
      'src/utils.test.ts': 'export function helperFn() {}',
      'src/utils.spec.ts': 'export function helperFn() {}',
      'src/utils.ts': 'export function helperFn() {}',
    });

    const index = await buildSymbolIndex('test-repo', source, { cacheDir: null });

    const paths = index.symbols['helperFn'] ?? [];
    expect(paths).not.toContain('src/utils.test.ts');
    expect(paths).not.toContain('src/utils.spec.ts');
    expect(paths).toContain('src/utils.ts');
  });

  it('uses disk cache on second call with same sha', async () => {
    const { mkdtempSync } = await import('fs');
    const { tmpdir } = await import('os');
    const cacheDir = mkdtempSync(`${tmpdir()}/symbol-index-test-`);

    const source = makeSource({ 'src/a.ts': 'export function alpha() {}' });

    const first  = await buildSymbolIndex('cached-repo', source, { cacheDir });
    const second = await buildSymbolIndex('cached-repo', source, { cacheDir });

    // Both runs must produce the same result
    expect(second.symbols).toEqual(first.symbols);
    expect(second.builtAt).toBe(first.builtAt); // identical timestamp proves cache was used
  });

  it('treats a cache file missing required fields as a miss', async () => {
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const cacheDir = mkdtempSync(`${tmpdir()}/symbol-index-test-stale-`);

    // Write a stale cache file that lacks the `files` field (simulates old format)
    const staleCache = { repoId: 'stale-repo', commitSha: 'test-sha-001', builtAt: '2024-01-01T00:00:00Z', symbols: {}, hooks: {} };
    writeFileSync(join(cacheDir, 'stale-repo-test-sha-001.json'), JSON.stringify(staleCache));

    const source = makeSource({ 'src/a.ts': 'export function alpha() {}' });
    const index = await buildSymbolIndex('stale-repo', source, { cacheDir });

    // Should have rebuilt (not used stale cache) so files field is present
    expect(index.files).toContain('src/a.ts');
    expect(index.symbols['alpha']).toEqual(['src/a.ts']);
  });
});

// --- scoreFilesAcrossRepos ---

describe('scoreFilesAcrossRepos', () => {
  const indexes = {
    gutenberg: makeIndex('gutenberg', {
      registerBlockType: ['packages/blocks/src/registration.js'],
      BlockAttributes:   ['packages/blocks/src/types.ts'],
      getBlockType: [
        'packages/blocks/src/store/selectors.js',
        'packages/blocks/src/registration.js',
      ],
    }, {
      'blocks.registerBlockType': ['packages/blocks/src/registration.js'],
    }),
  };

  it('scores files by symbol match count', () => {
    const scores = scoreFilesAcrossRepos(['registerBlockType', 'getBlockType'], indexes);

    const top = scores[0];
    expect(top.path).toBe('packages/blocks/src/registration.js');
    // registerBlockType + getBlockType = 2 symbol matches
    expect(top.score).toBe(2);
  });

  it('includes matched symbol names in result', () => {
    const scores = scoreFilesAcrossRepos(['registerBlockType'], indexes);
    const match = scores.find(s => s.path === 'packages/blocks/src/registration.js');
    expect(match?.matchedSymbols).toContain('registerBlockType');
  });

  it('counts hook matches', () => {
    const scores = scoreFilesAcrossRepos(['blocks.registerBlockType'], indexes);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].path).toBe('packages/blocks/src/registration.js');
  });

  it('returns empty array for unknown symbols', () => {
    const scores = scoreFilesAcrossRepos(['completelymissingidentifier'], indexes);
    expect(scores).toEqual([]);
  });

  it('handles multiple repos independently', () => {
    const multiIndexes = {
      ...indexes,
      'wordpress-develop': makeIndex('wordpress-develop', {
        register_block_type: ['src/wp-includes/blocks.php'],
      }),
    };

    const scores = scoreFilesAcrossRepos(
      ['registerBlockType', 'register_block_type'],
      multiIndexes,
    );

    const repos = new Set(scores.map(s => s.repo));
    expect(repos.has('gutenberg')).toBe(true);
    expect(repos.has('wordpress-develop')).toBe(true);
  });

  it('sorts results descending by score', () => {
    const scores = scoreFilesAcrossRepos(
      ['registerBlockType', 'BlockAttributes', 'getBlockType'],
      indexes,
    );

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].score).toBeLessThanOrEqual(scores[i - 1].score);
    }
  });
});

// --- findFilesByTreeHeuristic ---

describe('findFilesByTreeHeuristic', () => {
  const files = {
    gutenberg: [
      'packages/blocks/src/registration.js',
      'packages/blocks/src/attributes.ts',
      'packages/blocks/src/metadata.ts',
      'packages/blocks/src/index.ts',
      'packages/editor/src/components/post-meta/index.js',
    ],
  };

  it('finds files whose path matches a keyword from the slug', () => {
    const results = findFilesByTreeHeuristic('block-attributes', files, new Set());
    const paths = results.map(r => r.path);
    expect(paths).toContain('packages/blocks/src/attributes.ts');
  });

  it('finds files matching multi-keyword slug', () => {
    const results = findFilesByTreeHeuristic('block-metadata', files, new Set());
    const paths = results.map(r => r.path);
    expect(paths).toContain('packages/blocks/src/metadata.ts');
  });

  it('respects the exclude set', () => {
    const exclude = new Set(['gutenberg:packages/blocks/src/attributes.ts']);
    const results = findFilesByTreeHeuristic('block-attributes', files, exclude);
    const paths = results.map(r => r.path);
    expect(paths).not.toContain('packages/blocks/src/attributes.ts');
  });

  it('returns empty array when no keywords meet the length threshold', () => {
    // All parts < 5 chars: "use", "api" → nothing
    const results = findFilesByTreeHeuristic('use-api', files, new Set());
    expect(results).toEqual([]);
  });

  it('sorts shallower paths first', () => {
    const deepFiles = {
      gutenberg: [
        'packages/blocks/src/registration/index.ts',
        'packages/blocks/src/registration.ts',
      ],
    };
    const results = findFilesByTreeHeuristic('block-registration', deepFiles, new Set());
    if (results.length >= 2) {
      expect(results[0].path.split('/').length).toBeLessThanOrEqual(
        results[1].path.split('/').length,
      );
    }
  });

  it('skips build/dist/coverage paths', () => {
    const withBuild = {
      gutenberg: [
        ...files.gutenberg,
        'build/attributes.js',
        'dist/attributes.js',
      ],
    };
    const results = findFilesByTreeHeuristic('block-attributes', withBuild, new Set());
    const paths = results.map(r => r.path);
    expect(paths).not.toContain('build/attributes.js');
    expect(paths).not.toContain('dist/attributes.js');
  });
});
