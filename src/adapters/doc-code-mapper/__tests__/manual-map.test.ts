import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { ZodError } from 'zod';
import { ManualMapDocCodeMapper, MappingError, ConfigError } from '../manual-map.js';
import type { CodeSource } from '../../code-source/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../../../tests/fixtures');

// Minimal stub CodeSource for testing
const mockCodeSources: Record<string, CodeSource> = {
  gutenberg: {
    readFile: async () => '',
    listDir: async () => [],
    getCommitSha: async () => 'abc',
  },
};

// ---------------------------------------------------------------------------
// Known slug
// ---------------------------------------------------------------------------

describe('ManualMapDocCodeMapper — getCodeTiers', () => {
  it('returns correct CodeTiers for a known slug', () => {
    const mapper = new ManualMapDocCodeMapper(
      resolve(fixturesDir, 'mini-mapping.json'),
      mockCodeSources
    );
    const tiers = mapper.getCodeTiers('block-attributes');
    expect(tiers.primary).toHaveLength(1);
    expect(tiers.primary[0].repo).toBe('gutenberg');
    expect(tiers.primary[0].path).toBe('packages/blocks/src/api/parser/get-block-attributes.js');
  });
});

// ---------------------------------------------------------------------------
// Unknown slug
// ---------------------------------------------------------------------------

describe('ManualMapDocCodeMapper — unknown slug', () => {
  it('throws MappingError on unknown slug — message lists available slugs', () => {
    const mapper = new ManualMapDocCodeMapper(
      resolve(fixturesDir, 'mini-mapping.json'),
      mockCodeSources
    );
    expect(() => mapper.getCodeTiers('nonexistent-slug')).toThrow(MappingError);
    try {
      mapper.getCodeTiers('nonexistent-slug');
    } catch (e) {
      expect(e).toBeInstanceOf(MappingError);
      const msg = (e as MappingError).message;
      expect(msg).toContain('nonexistent-slug');
      expect(msg).toContain('block-attributes');
      expect(msg).toContain('block-registration');
    }
  });
});

// ---------------------------------------------------------------------------
// Unknown repo at construction time
// ---------------------------------------------------------------------------

describe('ManualMapDocCodeMapper — construction validation', () => {
  it('throws ConfigError at construction when mapping references unknown repo', () => {
    const badSources: Record<string, CodeSource> = {
      // Only "gutenberg" — "wordpress-core" is unknown
      gutenberg: mockCodeSources.gutenberg,
    };

    // Write a temp mapping with an unknown repo reference
    const tmpDir = resolve(fixturesDir, '../tmp');
    mkdirSync(tmpDir, { recursive: true });
    const tmpPath = resolve(tmpDir, 'bad-repo-mapping.json');
    writeFileSync(tmpPath, JSON.stringify({
      'block-metadata': {
        primary: [{ repo: 'wordpress-core', path: 'src/foo.php' }],
        secondary: [],
        context: [],
      },
    }));

    expect(() => new ManualMapDocCodeMapper(tmpPath, badSources)).toThrow(ConfigError);
    try {
      new ManualMapDocCodeMapper(tmpPath, badSources);
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as ConfigError).message;
      expect(msg).toContain('wordpress-core');
      expect(msg).toContain('block-metadata');
    }
  });

  it('throws ZodError at construction when mapping file JSON is structurally invalid', () => {
    const tmpDir = resolve(fixturesDir, '../tmp');
    mkdirSync(tmpDir, { recursive: true });
    const tmpPath = resolve(tmpDir, 'invalid-schema-mapping.json');
    writeFileSync(tmpPath, JSON.stringify({
      'block-metadata': {
        // Missing required 'secondary' and 'context', and primary has wrong shape
        primary: [{ wrong_field: 'value' }],
      },
    }));

    expect(() => new ManualMapDocCodeMapper(tmpPath, mockCodeSources)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// _reviews passthrough — adapter parses files containing review metadata
// without affecting the CodeTiers shape returned to the validator.
// ---------------------------------------------------------------------------

describe('ManualMapDocCodeMapper — _reviews passthrough', () => {
  const tmpDir = resolve(fixturesDir, '../tmp');

  it('parses a mapping containing _reviews without throwing; getCodeTiers returns unchanged primary/secondary/context', () => {
    mkdirSync(tmpDir, { recursive: true });
    const tmpPath = resolve(tmpDir, 'with-reviews-mapping.json');
    writeFileSync(tmpPath, JSON.stringify({
      'reviewed-slug': {
        primary:   [{ repo: 'gutenberg', path: 'src/reviewed.ts' }],
        secondary: [{ repo: 'gutenberg', path: 'src/secondary.ts' }],
        context:   [],
        _reviews:  [{ by: 'jdoe', date: '2026-05-09', notes: 'verified' }],
      },
      'unreviewed-slug': {
        primary:   [{ repo: 'gutenberg', path: 'src/unreviewed.ts' }],
        secondary: [],
        context:   [],
      },
    }));

    const mapper = new ManualMapDocCodeMapper(tmpPath, mockCodeSources);

    const reviewed = mapper.getCodeTiers('reviewed-slug');
    expect(reviewed.primary).toEqual([{ repo: 'gutenberg', path: 'src/reviewed.ts' }]);
    expect(reviewed.secondary).toEqual([{ repo: 'gutenberg', path: 'src/secondary.ts' }]);
    expect(reviewed.context).toEqual([]);

    const unreviewed = mapper.getCodeTiers('unreviewed-slug');
    expect(unreviewed.primary).toEqual([{ repo: 'gutenberg', path: 'src/unreviewed.ts' }]);
    expect(unreviewed.secondary).toEqual([]);
    expect(unreviewed.context).toEqual([]);
  });
});
