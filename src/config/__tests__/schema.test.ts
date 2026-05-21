import { describe, it, expect } from 'vitest';

import { ConfigSchema } from '../schema.js';

const baseRaw = {
  project:     { name: 'Test' },
  docSource:   {
    type:        'manifest-url' as const,
    manifestUrl: 'https://example.com/manifest.json',
    parentSlug:  'block-api',
  },
  codeSources: {
    gutenberg: { type: 'git-clone' as const, repoUrl: 'https://github.com/WordPress/gutenberg.git', ref: 'trunk' },
  },
  mappingPath: 'mappings/test.json',
  outputDir:   './out',
  validator:   { type: 'claude' as const, pass1Model: 'm', pass2Model: 'm' },
};

describe('ConfigSchema — validator.temperature / validator.samples (issue #56)', () => {
  it('defaults temperature to 0 and samples to 1 when both are omitted', () => {
    const parsed = ConfigSchema.parse(baseRaw);
    expect(parsed.validator.temperature).toBe(0);
    expect(parsed.validator.samples).toBe(1);
  });

  it('accepts an explicit temperature override', () => {
    const parsed = ConfigSchema.parse({
      ...baseRaw,
      validator: { ...baseRaw.validator, temperature: 0.7 },
    });
    expect(parsed.validator.temperature).toBe(0.7);
  });

  it('accepts an explicit samples override', () => {
    const parsed = ConfigSchema.parse({
      ...baseRaw,
      validator: { ...baseRaw.validator, samples: 3 },
    });
    expect(parsed.validator.samples).toBe(3);
  });

  it('rejects samples < 1', () => {
    const result = ConfigSchema.safeParse({
      ...baseRaw,
      validator: { ...baseRaw.validator, samples: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer samples', () => {
    const result = ConfigSchema.safeParse({
      ...baseRaw,
      validator: { ...baseRaw.validator, samples: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-finite temperature', () => {
    const result = ConfigSchema.safeParse({
      ...baseRaw,
      validator: { ...baseRaw.validator, temperature: Number.POSITIVE_INFINITY },
    });
    expect(result.success).toBe(false);
  });
});

describe('ConfigSchema — docSource.parentSlug', () => {
  it('accepts "*" as the explicit wildcard for all-manifest scope', () => {
    const parsed = ConfigSchema.parse({
      ...baseRaw,
      docSource: { ...baseRaw.docSource, parentSlug: '*' },
    });
    expect(parsed.docSource.parentSlug).toBe('*');
  });

  it('rejects an empty parentSlug with a message naming both valid forms', () => {
    const result = ConfigSchema.safeParse({
      ...baseRaw,
      docSource: { ...baseRaw.docSource, parentSlug: '' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map(i => i.message).join('\n');
      expect(message).toContain('"*"');
      expect(message).toContain('parent slug');
    }
  });

  it('rejects a missing parentSlug field', () => {
    const { parentSlug: _omitted, ...docSourceWithoutParentSlug } = baseRaw.docSource;
    const result = ConfigSchema.safeParse({
      ...baseRaw,
      docSource: docSourceWithoutParentSlug,
    });
    expect(result.success).toBe(false);
  });
});
