import { z } from 'zod';

export const IssueSeveritySchema = z.enum(['critical', 'major', 'minor']);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const IssueEvidenceSchema = z.object({
  docSays: z.string(),
  codeSays: z.string(),
  codeFile: z.string(),
  codeRepo: z.string(),
});

export const IssueSchema = z.object({
  severity: IssueSeveritySchema,
  type: z.string(),
  evidence: IssueEvidenceSchema,
  suggestion: z.string(),
  confidence: z.number().min(0).max(1),
  fingerprint: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const RelatedCodeSchema = z.object({
  repo: z.string(),
  file: z.string(),
  tier: z.enum(['primary', 'secondary', 'context']),
  includedInAnalysis: z.boolean(),
});
export type RelatedCode = z.infer<typeof RelatedCodeSchema>;

export const DocStatusSchema = z.enum(['healthy', 'needs-attention', 'critical']);
export type DocStatus = z.infer<typeof DocStatusSchema>;

export const DocResultSchema = z.object({
  slug: z.string(),
  title: z.string(),
  parent: z.string().nullable().optional(),
  sourceUrl: z.string(),
  healthScore: z.number().min(0).max(100),
  status: DocStatusSchema,
  issues: z.array(IssueSchema),
  positives: z.array(z.string()),
  relatedCode: z.array(RelatedCodeSchema),
  diagnostics: z.array(z.string()),
  commitSha: z.string(),
  analyzedAt: z.string(),
});
export type DocResult = z.infer<typeof DocResultSchema>;

export const RunResultsSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  overallHealth: z.number().min(0).max(100),
  totals: z.object({
    docs: z.number(),
    healthy: z.number(),
    needsAttention: z.number(),
    critical: z.number(),
    issues: z.object({
      total: z.number(),
      critical: z.number(),
      major: z.number(),
      minor: z.number(),
    }),
  }),
  docs: z.array(DocResultSchema),
});
export type RunResults = z.infer<typeof RunResultsSchema>;

export const CodeFileSchema = z.object({
  repo: z.string(),
  path: z.string(),
});
export type CodeFile = z.infer<typeof CodeFileSchema>;

export const CodeTiersSchema = z.object({
  primary: z.array(CodeFileSchema).max(3),
  secondary: z.array(CodeFileSchema).max(5),
  context: z.array(CodeFileSchema).max(8),
});
export type CodeTiers = z.infer<typeof CodeTiersSchema>;

export const ManifestEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  markdown_source: z.string(),
  parent: z.string().nullable().optional(),
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

export const MappingSchema = z.record(z.string(), CodeTiersSchema);
export type Mapping = z.infer<typeof MappingSchema>;
