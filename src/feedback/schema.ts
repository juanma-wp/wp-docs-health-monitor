import { z } from 'zod';

// ---------------------------------------------------------------------------
// Feedback contracts — the structured form of a human review of a run's
// findings. `docs/_qa-runs/*/human-verification.md` is the freeform ancestor
// of this format; structuring it is what lets the loop close automatically
// (verdicts → metrics → regenerated site-extension calibration block).
//
// Lives outside `src/types/` on purpose: those contracts are locked and
// feedback is not part of the RunResults surface — it is an overlay keyed
// by (runId, slug, fingerprint).
// ---------------------------------------------------------------------------

export const RUN_ID_PATTERN = /^\d{8}-\d{6}$/;

// `pending` exists so `feedback init` can emit a valid skeleton before the
// reviewer has looked at anything. Pending entries are ignored by metrics
// and calibration.
export const FeedbackVerdictSchema = z.enum([
  'pending',
  'true-positive',
  'false-positive',
  'duplicate',
  'needs-editorial-judgement',
]);
export type FeedbackVerdict = z.infer<typeof FeedbackVerdictSchema>;

export const IssueFeedbackSchema = z.object({
  slug:        z.string().min(1),
  // Matches Issue.fingerprint in the referenced run's results.json.
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  verdict:     FeedbackVerdictSchema,
  // Free-text reviewer rationale. For false positives this text becomes the
  // "why this is not drift" prose in the regenerated calibration block, so
  // write it as an instruction to a future validator, not as a diary entry.
  notes:       z.string().optional(),
  // True positives are only surfaced in the calibration block when marked
  // exemplar — otherwise the TP list would grow without bound and drown the
  // FP guidance that actually changes behaviour.
  exemplar:    z.boolean().default(false),
});
export type IssueFeedback = z.infer<typeof IssueFeedbackSchema>;

// A drift issue the reviewer found that the run did NOT report (recall loss).
export const MissedIssueSchema = z.object({
  slug:        z.string().min(1),
  description: z.string().min(1),
  docSays:     z.string().optional(),
  codeSays:    z.string().optional(),
  codeFile:    z.string().optional(),
  codeRepo:    z.string().optional(),
});
export type MissedIssue = z.infer<typeof MissedIssueSchema>;

export const FeedbackFileSchema = z.object({
  site:       z.string().min(1),
  runId:      z.string().regex(RUN_ID_PATTERN),
  reviewer:   z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  issues:     z.array(IssueFeedbackSchema).default([]),
  missed:     z.array(MissedIssueSchema).default([]),
});
export type FeedbackFile = z.infer<typeof FeedbackFileSchema>;
