import { z } from 'zod';

export const ManifestEntrySchema = z.object({
  slug:            z.string(),
  title:           z.string(),
  markdown_source: z.string().url(),       // always absolute URL — adapter resolves before validating
  parent:          z.string().nullable(),  // null for top-level handbook entries
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

export const CodeFileSchema = z.object({
  repo: z.string(),  // must match a key in config.codeSources — validated at pipeline startup
  path: z.string(),  // repo-relative file path
});
export type CodeFile = z.infer<typeof CodeFileSchema>;

export const CodeTiersSchema = z.object({
  primary:   z.array(CodeFileSchema).max(3),
  secondary: z.array(CodeFileSchema).max(5),
  context:   z.array(CodeFileSchema).max(8),
});
export type CodeTiers = z.infer<typeof CodeTiersSchema>;

export const MappingSchema = z.record(z.string(), CodeTiersSchema);
export type Mapping = z.infer<typeof MappingSchema>;
