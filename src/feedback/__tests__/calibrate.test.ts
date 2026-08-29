import { describe, expect, it } from 'vitest';

import {
  CALIBRATION_BEGIN,
  CALIBRATION_END,
  findPromotionCandidates,
  renderCalibrationBlock,
  spliceCalibration,
} from '../calibrate.js';
import type { JoinResult, JoinedIssueFeedback } from '../store.js';
import type { Issue } from '../../types/results.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    severity:    'major',
    type:        'default-value',
    evidence:    { docSays: 'Defaults to `block`.', codeSays: "scope || ['block', 'inserter']", codeFile: 'src/selectors.ts', codeRepo: 'gutenberg' },
    suggestion:  'Fix the default.',
    confidence:  0.9,
    fingerprint: '0123456789abcdef',
    ...overrides,
  };
}

function entry(overrides: Partial<JoinedIssueFeedback> = {}): JoinedIssueFeedback {
  return {
    runId:    '20260101-000000',
    slug:     'block-variations',
    verdict:  'false-positive',
    exemplar: false,
    issue:    makeIssue(),
    ...overrides,
  };
}

function joinResult(overrides: Partial<JoinResult> = {}): JoinResult {
  return { joined: [], missed: [], unmatched: [], ...overrides };
}

describe('renderCalibrationBlock', () => {
  it('returns null when there is nothing decisive to teach', () => {
    expect(renderCalibrationBlock(joinResult())).toBeNull();
    expect(renderCalibrationBlock(joinResult({
      joined: [entry({ verdict: 'pending' }), entry({ verdict: 'true-positive', exemplar: false })],
    }))).toBeNull();
  });

  it('renders false positives with evidence quotes and reviewer notes', () => {
    const block = renderCalibrationBlock(joinResult({
      joined: [entry({ notes: 'The fallback CONFIRMS the documented default.' })],
    }));
    expect(block).toContain('Reviewer-rejected findings');
    expect(block).toContain('block-variations');
    expect(block).toContain('Defaults to `block`.');
    expect(block).toContain('The fallback CONFIRMS the documented default.');
    expect(block).toContain('gutenberg:src/selectors.ts');
  });

  it('includes true positives only when marked exemplar', () => {
    const block = renderCalibrationBlock(joinResult({
      joined: [
        entry({ verdict: 'true-positive', exemplar: true, slug: 'exemplary-doc' }),
        entry({ verdict: 'true-positive', exemplar: false, slug: 'ordinary-doc' }),
        entry({ verdict: 'false-positive' }),
      ],
    }));
    expect(block).toContain('exemplary-doc');
    expect(block).not.toContain('ordinary-doc');
  });

  it('renders missed drift with location when provided', () => {
    const block = renderCalibrationBlock(joinResult({
      missed: [{
        runId: '20260101-000000',
        slug: 'block-transforms',
        description: 'isMatch receives an array of blocks for multi-block transforms.',
        codeFile: 'src/factory.js',
        codeRepo: 'gutenberg',
      }],
    }));
    expect(block).toContain('Known misses');
    expect(block).toContain('block-transforms');
    expect(block).toContain('`gutenberg:src/factory.js`');
  });

  it('caps each section newest-run-first', () => {
    const joined = [
      entry({ runId: '20260101-000000', slug: 'old-doc' }),
      entry({ runId: '20260202-000000', slug: 'new-doc' }),
    ];
    const block = renderCalibrationBlock(joinResult({ joined }), { maxPerSection: 1 });
    expect(block).toContain('new-doc');
    expect(block).not.toContain('old-doc');
  });

  it('truncates long evidence quotes', () => {
    const long = 'x'.repeat(500);
    const block = renderCalibrationBlock(joinResult({
      joined: [entry({ issue: makeIssue({ evidence: { docSays: long, codeSays: 'c', codeFile: 'f', codeRepo: 'r' } }) })],
    }));
    expect(block).not.toContain(long);
    expect(block).toContain('…');
  });
});

describe('spliceCalibration', () => {
  const block = '### Learned calibration from review feedback\n\n- example';

  it('appends a managed region to a prompt without markers, preserving content', () => {
    const existing = '# Hand-written rules\n\nKeep me.\n';
    const updated = spliceCalibration(existing, block);
    expect(updated).toContain('Keep me.');
    expect(updated).toContain(CALIBRATION_BEGIN);
    expect(updated).toContain(CALIBRATION_END);
    expect(updated.indexOf('Keep me.')).toBeLessThan(updated.indexOf(CALIBRATION_BEGIN));
  });

  it('is idempotent and replaces only the region between markers', () => {
    const existing = '# Hand-written rules\n\nKeep me.\n';
    const once = spliceCalibration(existing, block);
    const twice = spliceCalibration(once, block);
    expect(twice).toBe(once);

    const updated = spliceCalibration(once, '### Learned calibration from review feedback\n\n- new example');
    expect(updated).toContain('- new example');
    expect(updated).not.toContain('- example\n');
    expect(updated).toContain('Keep me.');
    expect(updated.match(new RegExp(CALIBRATION_BEGIN.slice(0, 30), 'g'))).toHaveLength(1);
  });

  it('preserves hand-written content AFTER the markers', () => {
    const existing = `before\n\n${CALIBRATION_BEGIN}\n\nold\n\n${CALIBRATION_END}\n\nafter\n`;
    const updated = spliceCalibration(existing, block);
    expect(updated).toContain('before');
    expect(updated).toContain('after');
    expect(updated).not.toContain('\n\nold\n\n');
  });

  it('throws on unbalanced markers instead of corrupting the prompt', () => {
    expect(() => spliceCalibration(`x\n${CALIBRATION_BEGIN}\ny`, block)).toThrow(/unbalanced/);
  });
});

describe('findPromotionCandidates', () => {
  it('reports FP classes recurring across at least two sites', () => {
    const candidates = findPromotionCandidates({
      'site-a': [entry(), entry({ verdict: 'true-positive' })],
      'site-b': [entry(), entry()],
      'site-c': [entry({ issue: makeIssue({ type: 'broken-example' }) })],
    });
    expect(candidates).toEqual([
      { issueType: 'default-value', sites: ['site-a', 'site-b'], fpCount: 3 },
    ]);
  });

  it('returns [] when no class spans two sites', () => {
    expect(findPromotionCandidates({ 'site-a': [entry()] })).toEqual([]);
  });
});
