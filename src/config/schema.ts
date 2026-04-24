import { z } from 'zod';

export const DocSourceConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('manifest-url'),
    manifestUrl: z.string().url(),
    parentSlug: z.string(),
    sourceUrlBase: z.string().url().optional(),
  }),
]);
export type DocSourceConfig = z.infer<typeof DocSourceConfigSchema>;

export const CodeSourceConfigSchema = z.object({
  id: z.string(),
  type: z.literal('git-clone'),
  url: z.string().url(),
  ref: z.string(),
});
export type CodeSourceConfig = z.infer<typeof CodeSourceConfigSchema>;

export const DocCodeMapperConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('manual-map'),
    mappingPath: z.string(),
  }),
]);
export type DocCodeMapperConfig = z.infer<typeof DocCodeMapperConfigSchema>;

export const ValidatorConfigSchema = z.object({
  type: z.string(),
  model: z.string(),
});
export type ValidatorConfig = z.infer<typeof ValidatorConfigSchema>;

export const ConfigSchema = z.object({
  project: z.string(),
  docSource: DocSourceConfigSchema,
  codeSources: z.array(CodeSourceConfigSchema),
  docCodeMapper: DocCodeMapperConfigSchema,
  validator: ValidatorConfigSchema,
  outputDir: z.string().optional(),
});
export type Config = z.infer<typeof ConfigSchema>;
