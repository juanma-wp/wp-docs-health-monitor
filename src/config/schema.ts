import { z } from 'zod';

export const ConfigSchema = z.object({
  project: z.object({
    name: z.string(),
  }),
  docSource: z.object({
    type:          z.literal('manifest-url'),
    manifestUrl:   z.string().url(),
    parentSlug:    z.string(),
    sourceUrlBase: z.string().url().optional(), // e.g. "https://developer.wordpress.org/block-editor/"
                                                // if absent, falls back to GitHub UI URL
  }),
  codeSources: z.record(
    z.string(),
    z.object({
      type:    z.literal('git-clone'),
      repoUrl: z.string().url(),
      ref:     z.string().default('trunk'),
    })
  ),
  mappingPath: z.string(),
  outputDir:   z.string(),
  validator: z.object({
    type:                   z.literal('claude'),
    provider:               z.enum(['anthropic', 'openrouter']).default('anthropic'),
    apiKeyEnvVar:           z.string().optional(),
    baseUrl:                z.string().url().optional(),
    pass1Model:             z.string().default('claude-sonnet-4-6'),
    pass2Model:             z.string().default('claude-sonnet-4-6'),
    // Model used by scripts/auto-map.ts for the canonical-mapping re-rank step.
    // Optional: when unset, the auto-mapper falls back to pass1Model. Split out
    // because mapping is run rarely but is structurally critical (one wrong
    // primary file pollutes every validation run for that slug), so it's
    // worth using a stronger model here than for routine validation passes.
    rerankModel:            z.string().optional(),
    systemPromptExtension:  z.string().optional(), // path to a .md file with site-specific prompt rules
    // Determinism + recall controls. See issue #56.
    //   `temperature: 0` makes Pass 1 / Pass 2 reproducible run-to-run.
    //   `samples > 1` runs Pass 1 N times and unions candidates by
    //   fingerprint before Pass 2 — trades cost for recall.
    temperature:            z.number().finite().default(0),
    samples:                z.number().int().min(1).default(1),
  }),
  // Token pricing in USD per million tokens. Defaults match Sonnet 4.6 rates.
  // Check https://www.anthropic.com/pricing for current values and update as needed.
  pricing: z.object({
    inputPerMtok:      z.number().default(3.00),
    outputPerMtok:     z.number().default(15.00),
    cacheWritePerMtok: z.number().default(3.75),
    cacheReadPerMtok:  z.number().default(0.30),
  }).default({}),
});
export type Config = z.infer<typeof ConfigSchema>;
