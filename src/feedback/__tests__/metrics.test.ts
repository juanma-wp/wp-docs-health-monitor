import { describe, expect, it } from 'vitest';

import { computeMetrics } from '../metrics.js';
import type { JoinedIssueFeedback } from '../store.js';
import type { Issue } from '../../types/results.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    severity:    'major',
    type:        'default-value',
    evidence:    { docSays: 'doc', codeSays: 'code', codeFile: 'src/a.ts', codeRepo: 'repo' },
    suggestion:  'Fix the default.',
    confidence:  0.9,
    fingerprint: '0123456789abcdef',
    ...overrides,
  };
}

function entry(overrides: Partial<JoinedIssueFeedback> = {}): JoinedIssueFeedback {
  return {
    runId:    '20260101-000000',
    slug:     'doc-a',
    verdict:  'true-positive',
    exemplar: false,
    issue:    makeIssue(),
    ...overrides,
  };
}

describe('computeMetrics', () => {
  it('computes precision as TP / (TP + FP), excluding duplicates, editorial and pending', () => {
    const metrics = computeMetrics('site', [
      entry({ verdict: 'true-positive' }),
      entry({ verdict: 'true-positive' }),
      entry({ verdict: 'false-positive' }),
      entry({ verdict: 'duplicate' }),
      entry({ verdict: 'needs-editorial-judgement' }),
      entry({ verdict: 'pending' }),
    ]);
    expect(metrics.cumulative.precision).toBeCloseTo(2 / 3);
    expect(metrics.cumulative.counts).toEqual({
      truePositive: 2,
      falsePositive: 1,
      duplicate: 1,
      needsEditorialJudgement: 1,
      pending: 1,
    });
  });

  it('returns null precision when nothing decisive was reviewed', () => {
    const metrics = computeMetrics('site', [entry({ verdict: 'pending' })]);
    expect(metrics.cumulative.precision).toBeNull();
    expect(metrics.runs[0].precision).toBeNull();
  });

  it('splits per-run metrics sorted by runId ascending', () => {
    const metrics = computeMetrics('site', [
      entry({ runId: '20260202-000000', verdict: 'false-positive' }),
      entry({ runId: '20260101-000000', verdict: 'true-positive' }),
    ]);
    expect(metrics.runs.map(r => r.runId)).toEqual(['20260101-000000', '20260202-000000']);
    expect(metrics.runs[0].precision).toBe(1);
    expect(metrics.runs[1].precision).toBe(0);
  });

  it('breaks down decisive verdicts by issue type and severity', () => {
    const metrics = computeMetrics('site', [
      entry({ verdict: 'true-positive', issue: makeIssue({ type: 'broken-example', severity: 'critical' }) }),
      entry({ verdict: 'false-positive', issue: makeIssue({ type: 'broken-example', severity: 'minor' }) }),
      entry({ verdict: 'duplicate', issue: makeIssue({ type: 'type-signature' }) }),
    ]);
    expect(metrics.cumulative.byType).toEqual({
      'broken-example': { truePositive: 1, falsePositive: 1 },
    });
    expect(metrics.cumulative.bySeverity).toEqual({
      critical: { truePositive: 1, falsePositive: 0 },
      minor:    { truePositive: 0, falsePositive: 1 },
    });
  });
});
