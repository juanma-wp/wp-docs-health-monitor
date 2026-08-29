import { describe, expect, it } from 'vitest';
import { FeedbackFileSchema, IssueFeedbackSchema } from '../schema.js';

const validEntry = {
  slug:        'block-registration',
  fingerprint: 'abcdef0123456789',
  verdict:     'true-positive',
};

describe('FeedbackFileSchema', () => {
  it('parses a minimal valid file and applies defaults', () => {
    const parsed = FeedbackFileSchema.parse({
      site:   'gutenberg-block-editor',
      runId:  '20260428-190955',
      issues: [validEntry],
    });
    expect(parsed.missed).toEqual([]);
    expect(parsed.issues[0].exemplar).toBe(false);
  });

  it('accepts a pending verdict so init skeletons validate', () => {
    expect(() => IssueFeedbackSchema.parse({ ...validEntry, verdict: 'pending' })).not.toThrow();
  });

  it('rejects a malformed runId', () => {
    const result = FeedbackFileSchema.safeParse({
      site:   'x',
      runId:  'not-a-run',
      issues: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a fingerprint that does not match the Issue fingerprint shape', () => {
    const result = IssueFeedbackSchema.safeParse({ ...validEntry, fingerprint: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown verdict', () => {
    const result = IssueFeedbackSchema.safeParse({ ...validEntry, verdict: 'maybe' });
    expect(result.success).toBe(false);
  });
});
