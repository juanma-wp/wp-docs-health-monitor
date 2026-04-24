import { describe, it, expect } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { ManualMapDocCodeMapper, ConfigError, MappingError } from '../manual-map.js';
import type { CodeSource } from '../../code-source/types.js';

const FIXTURE_PATH = resolve('tests/fixtures/mini-mapping.json');

function makeCodeSources(ids: string[] = ['gutenberg']): Record<string, CodeSource> {
  const stub: CodeSource = {
    readFile: async () => '',
    listDir: async () => [],
    getCommitSha: async () => 'abc123',
  };
  return Object.fromEntries(ids.map((id) => [id, stub]));
}

describe('ManualMapDocCodeMapper', () => {
  it('returns correct CodeTiers for a known slug', () => {
    const mapper = new ManualMapDocCodeMapper(FIXTURE_PATH, makeCodeSources());
    const tiers = mapper.getCodeTiers('block-attributes');
    expect(tiers.primary).toHaveLength(1);
    expect(tiers.primary[0].path).toBe('packages/blocks/src/api/parser/get-block-attributes.js');
  });

  it('throws MappingError on unknown slug with available slugs listed', () => {
    const mapper = new ManualMapDocCodeMapper(FIXTURE_PATH, makeCodeSources());
    expect(() => mapper.getCodeTiers('unknown-slug')).toThrow(MappingError);
    try {
      mapper.getCodeTiers('unknown-slug');
    } catch (err) {
      expect((err as Error).message).toContain('unknown-slug');
      expect((err as Error).message).toContain('block-attributes');
    }
  });

  it('throws ConfigError at construction when mapping references unknown repo', () => {
    const invalidMapping = {
      'block-attributes': {
        primary: [{ repo: 'wordpress-core', path: 'some/file.php' }],
        secondary: [],
        context: [],
      },
    };
    const tmpPath = resolve('tests/fixtures/invalid-mapping-test.json');
    writeFileSync(tmpPath, JSON.stringify(invalidMapping));
    try {
      expect(() => new ManualMapDocCodeMapper(tmpPath, makeCodeSources())).toThrow(ConfigError);
      try {
        new ManualMapDocCodeMapper(tmpPath, makeCodeSources());
      } catch (err) {
        expect((err as Error).message).toContain('wordpress-core');
        expect((err as Error).message).toContain('gutenberg');
      }
    } finally {
      try { unlinkSync(tmpPath); } catch {}
    }
  });

  it('throws ZodError at construction when mapping JSON is structurally invalid', () => {
    const invalidMapping = {
      'block-attributes': {
        primary: [{ repo: 'gutenberg', path: 'some/file.js', extra: 'invalid' }],
        secondary: 'not-an-array',
        context: [],
      },
    };
    const tmpPath = resolve('tests/fixtures/structurally-invalid-mapping-test.json');
    writeFileSync(tmpPath, JSON.stringify(invalidMapping));
    try {
      expect(() => new ManualMapDocCodeMapper(tmpPath, makeCodeSources())).toThrow();
    } finally {
      try { unlinkSync(tmpPath); } catch {}
    }
  });
});
