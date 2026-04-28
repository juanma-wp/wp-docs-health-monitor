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
    pass1Model:             z.string().default('claude-sonnet-4-6'),
    pass2Model:             z.string().default('claude-sonnet-4-6'),
    systemPromptExtension:  z.string().optional(), // path to a .md file with site-specific prompt rules
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
