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
    expect(parsed.validator.provider).toBe('anthropic');
    expect(parsed.validator.temperature).toBe(0);
    expect(parsed.validator.samples).toBe(1);
  });

  it('accepts openrouter provider with custom key env var and base URL', () => {
    const parsed = ConfigSchema.parse({
      ...baseRaw,
      validator: {
        ...baseRaw.validator,
        provider: 'openrouter',
        apiKeyEnvVar: 'MY_OPENROUTER_KEY',
        baseUrl: 'https://openrouter.ai/api/v1/anthropic',
      },
    });
    expect(parsed.validator.provider).toBe('openrouter');
    expect(parsed.validator.apiKeyEnvVar).toBe('MY_OPENROUTER_KEY');
    expect(parsed.validator.baseUrl).toBe('https://openrouter.ai/api/v1/anthropic');
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
