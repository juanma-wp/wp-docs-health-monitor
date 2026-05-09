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
  // Optional inclusive line range (1-indexed). When present, the Source Code
  // bulk for this file is sliced to [start, end] instead of including the
  // whole file. Symbol/hook/default extractors still parse the full file.
  lines: z.tuple([z.number().int().positive(), z.number().int().positive()])
    .refine(([s, e]) => s <= e, { message: 'lines: start must be <= end' })
    .optional(),
});
export type CodeFile = z.infer<typeof CodeFileSchema>;

export const ReviewEntrySchema = z.object({
  by:    z.string().min(1),
  date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});
export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;

export const CodeTiersSchema = z.object({
  primary:   z.array(CodeFileSchema).max(3),
  secondary: z.array(CodeFileSchema).max(5),
  context:   z.array(CodeFileSchema).max(8),
  _reviews:  z.array(ReviewEntrySchema).min(1).optional(),
});
export type CodeTiers = z.infer<typeof CodeTiersSchema>;

export const MappingSchema = z.record(z.string(), CodeTiersSchema);
export type Mapping = z.infer<typeof MappingSchema>;
