import { describe, it, expect } from 'vitest';
import { scoreDoc } from './health-scorer.js';
import type { Issue } from './types/results.js';

function makeIssue(severity: 'critical' | 'major' | 'minor'): Issue {
  return {
    severity,
    type:       'type-signature',
    evidence: {
      docSays:  'foo',
      codeSays: 'bar',
      codeFile: 'src/index.ts',
      codeRepo: 'gutenberg',
    },
    suggestion:  'Update the `foo` parameter to `bar` in `registerBlockType()`',
    confidence:  0.9,
    fingerprint: 'a1b2c3d4e5f6a7b8',
  };
}

describe('scoreDoc', () => {
  it('returns healthScore: 100, status: "healthy" for an empty issue list', () => {
    const result = scoreDoc([]);
    expect(result.healthScore).toBe(100);
    expect(result.status).toBe('healthy');
  });

  it('returns healthScore: 85, status: "healthy" for 1 critical issue (100 - 15 = 85)', () => {
    const result = scoreDoc([makeIssue('critical')]);
    expect(result.healthScore).toBe(85);
    expect(result.status).toBe('healthy');
  });

  it('returns healthScore: 70, status: "needs-attention" for 2 critical issues (100 - 30 = 70)', () => {
    const result = scoreDoc([makeIssue('critical'), makeIssue('critical')]);
    expect(result.healthScore).toBe(70);
    expect(result.status).toBe('needs-attention');
  });

  it('returns healthScore: 25, status: "critical" for 5 critical issues (100 - 75 = 25)', () => {
    const result = scoreDoc([
      makeIssue('critical'),
      makeIssue('critical'),
      makeIssue('critical'),
      makeIssue('critical'),
      makeIssue('critical'),
    ]);
    expect(result.healthScore).toBe(25);
    expect(result.status).toBe('critical');
  });

  it('clamps healthScore to 0 — never negative', () => {
    // 7 critical issues would give 100 - 105 = -5 without clamping
    const issues = Array.from({ length: 7 }, () => makeIssue('critical'));
    const result = scoreDoc(issues);
    expect(result.healthScore).toBe(0);
    expect(result.status).toBe('critical');
  });

  it('subtracts 7 per major issue', () => {
    const result = scoreDoc([makeIssue('major'), makeIssue('major')]);
    expect(result.healthScore).toBe(86);
    expect(result.status).toBe('healthy');
  });

  it('subtracts 2 per minor issue', () => {
    const result = scoreDoc([makeIssue('minor'), makeIssue('minor'), makeIssue('minor')]);
    expect(result.healthScore).toBe(94);
    expect(result.status).toBe('healthy');
  });

  it('mixes severities correctly', () => {
    // 1 critical (15) + 1 major (7) + 1 minor (2) = 24 deducted → healthScore: 76
    const result = scoreDoc([makeIssue('critical'), makeIssue('major'), makeIssue('minor')]);
    expect(result.healthScore).toBe(76);
    expect(result.status).toBe('needs-attention');
  });
});
