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
    type:  z.literal('claude'),
    model: z.string().default('claude-sonnet-4-6'),
  }),
});
export type Config = z.infer<typeof ConfigSchema>;
