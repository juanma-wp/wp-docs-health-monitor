import { z } from 'zod';

export const IssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  type: z.enum([
    'type-signature',
    'default-value',
    'deprecated-api',
    'broken-example',
    'nonexistent-name',
    'required-optional-mismatch',
  ]),
  evidence: z.object({
    docSays:  z.string(),
    codeSays: z.string(),
    codeFile: z.string(),  // repo-relative path
    codeRepo: z.string(),  // repo ID — must match a key in config.codeSources
  }),
  suggestion:  z.string(),
  confidence:  z.number().min(0).max(1),
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
});
export type Issue = z.infer<typeof IssueSchema>;

export const DocResultSchema = z.object({
  slug:        z.string(),
  title:       z.string(),
  parent:      z.string().nullable(),  // parent slug from manifest — used by dashboard tree view
  sourceUrl:   z.string().url(),
  healthScore: z.number().min(0).max(100),
  status:      z.enum(['healthy', 'needs-attention', 'critical']),
  issues:      z.array(IssueSchema),
  positives:   z.array(z.string()).max(3),
  relatedCode: z.array(z.object({
    repo:               z.string(),
    file:               z.string(),
    tier:               z.enum(['primary', 'secondary', 'context']),
    includedInAnalysis: z.boolean(),
  })),
  diagnostics: z.array(z.string()),
  commitSha:   z.string(),
  analyzedAt:  z.string().datetime(),
});
export type DocResult = z.infer<typeof DocResultSchema>;

export const RunUsageSchema = z.object({
  pass1Model:       z.string(),
  pass2Model:       z.string(),
  inputTokens:      z.number().int(),
  outputTokens:     z.number().int(),
  cacheReadTokens:  z.number().int(),
  cacheWriteTokens: z.number().int(),
  estimatedCostUsd: z.number(),
});
export type RunUsage = z.infer<typeof RunUsageSchema>;

export const RunResultsSchema = z.object({
  runId:         z.string().regex(/^\d{8}-\d{6}$/),  // YYYYMMDD-HHmmss
  timestamp:     z.string().datetime(),
  overallHealth: z.number().min(0).max(100),
  totals: z.object({
    docs:           z.number().int(),
    healthy:        z.number().int(),
    needsAttention: z.number().int(),
    critical:       z.number().int(),
    issues: z.object({
      total:    z.number().int(),
      critical: z.number().int(),
      major:    z.number().int(),
      minor:    z.number().int(),
    }),
  }),
  usage: RunUsageSchema.optional(),
  docs: z.array(DocResultSchema),
});
export type RunResults = z.infer<typeof RunResultsSchema>;
