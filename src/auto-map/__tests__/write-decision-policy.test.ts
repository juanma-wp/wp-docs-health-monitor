import { describe, it, expect } from 'vitest';

import { decide } from '../write-decision-policy.js';
import type { CodeTiers } from '../../types/mapping.js';

const SLUG = 'block-metadata';

const CANDIDATE: CodeTiers = {
  primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js' }],
  secondary: [],
  context:   [],
};

const REVIEWED_ENTRY = {
  primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js' }],
  secondary: [],
  context:   [],
  _reviews: [
    { by: 'juanmaguitar', date: '2026-04-15', notes: 'curated' },
  ],
};

const ENTRY_WITHOUT_REVIEWS = {
  primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js' }],
  secondary: [],
  context:   [],
};

describe('WriteDecisionPolicy.decide — write-mapping branches', () => {
  it('returns write-mapping when slug has no prior entry', () => {
    const action = decide({
      slug: SLUG,
      existing: undefined,
      candidate: CANDIDATE,
      forceRegenerate: false,
    });
    expect(action).toEqual({ kind: 'write-mapping', tiers: CANDIDATE });
  });

  it('returns write-mapping when prior entry has no _reviews field', () => {
    const action = decide({
      slug: SLUG,
      existing: ENTRY_WITHOUT_REVIEWS,
      candidate: CANDIDATE,
      forceRegenerate: false,
    });
    expect(action).toEqual({ kind: 'write-mapping', tiers: CANDIDATE });
  });

  it('returns write-mapping (not force-regenerate) when forceRegenerate is true but no _reviews exists', () => {
    // _reviews is the precondition for force-regenerate; without it, the flag is a no-op.
    const action = decide({
      slug: SLUG,
      existing: ENTRY_WITHOUT_REVIEWS,
      candidate: CANDIDATE,
      forceRegenerate: true,
    });
    expect(action).toEqual({ kind: 'write-mapping', tiers: CANDIDATE });
  });
});

describe('WriteDecisionPolicy.decide — write-suggestion branch', () => {
  it('returns write-suggestion when prior entry has valid _reviews and forceRegenerate=false', () => {
    const action = decide({
      slug: SLUG,
      existing: REVIEWED_ENTRY,
      candidate: CANDIDATE,
      forceRegenerate: false,
    });
    expect(action.kind).toBe('write-suggestion');
    if (action.kind === 'write-suggestion') {
      expect(action.tiers).toEqual(CANDIDATE);
      expect(action.latestReview).toEqual({ by: 'juanmaguitar', date: '2026-04-15', notes: 'curated' });
    }
  });

  it('derives latestReview as max(date), order-independent (reviews in chronological order)', () => {
    const entry = {
      ...ENTRY_WITHOUT_REVIEWS,
      _reviews: [
        { by: 'alice', date: '2026-01-10' },
        { by: 'bob',   date: '2026-03-22' },
        { by: 'carol', date: '2026-02-05' },
      ],
    };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(action.kind).toBe('write-suggestion');
    if (action.kind === 'write-suggestion') {
      expect(action.latestReview).toEqual({ by: 'bob', date: '2026-03-22' });
    }
  });

  it('derives latestReview as max(date), order-independent (reviews in reverse-chronological order)', () => {
    const entry = {
      ...ENTRY_WITHOUT_REVIEWS,
      _reviews: [
        { by: 'bob',   date: '2026-03-22' },
        { by: 'carol', date: '2026-02-05' },
        { by: 'alice', date: '2026-01-10' },
      ],
    };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(action.kind).toBe('write-suggestion');
    if (action.kind === 'write-suggestion') {
      expect(action.latestReview).toEqual({ by: 'bob', date: '2026-03-22' });
    }
  });

  it('latestReview is stable when two entries share the same date (deterministic tie-break)', () => {
    const entry = {
      ...ENTRY_WITHOUT_REVIEWS,
      _reviews: [
        { by: 'alice', date: '2026-03-22' },
        { by: 'bob',   date: '2026-03-22' },
      ],
    };
    const a = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    const b = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(a).toEqual(b);
  });
});

describe('WriteDecisionPolicy.decide — force-regenerate branch', () => {
  it('returns force-regenerate when prior entry has valid _reviews and forceRegenerate=true', () => {
    const action = decide({
      slug: SLUG,
      existing: REVIEWED_ENTRY,
      candidate: CANDIDATE,
      forceRegenerate: true,
    });
    expect(action).toEqual({ kind: 'force-regenerate', tiers: CANDIDATE });
  });
});

describe('WriteDecisionPolicy.decide — abort branch (malformed _reviews)', () => {
  it('aborts when _reviews is an empty array', () => {
    const entry = { ...ENTRY_WITHOUT_REVIEWS, _reviews: [] };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(action.kind).toBe('abort');
    if (action.kind === 'abort') {
      expect(action.reason).toContain(SLUG);
      expect(action.reason).toContain('_reviews');
      expect(action.reason).toMatch(/empty/i);
    }
  });

  it('aborts when a _reviews entry is missing the "by" field', () => {
    const entry = {
      ...ENTRY_WITHOUT_REVIEWS,
      _reviews: [{ date: '2026-04-15' }],
    };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(action.kind).toBe('abort');
    if (action.kind === 'abort') {
      expect(action.reason).toContain(SLUG);
      expect(action.reason).toContain('by');
    }
  });

  it('aborts when a _reviews entry has an empty "by"', () => {
    const entry = {
      ...ENTRY_WITHOUT_REVIEWS,
      _reviews: [{ by: '', date: '2026-04-15' }],
    };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(action.kind).toBe('abort');
    if (action.kind === 'abort') {
      expect(action.reason).toContain(SLUG);
      expect(action.reason).toContain('by');
    }
  });

  it('aborts when a _reviews entry has a non-ISO "date"', () => {
    const entry = {
      ...ENTRY_WITHOUT_REVIEWS,
      _reviews: [{ by: 'juanmaguitar', date: 'April 15, 2026' }],
    };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(action.kind).toBe('abort');
    if (action.kind === 'abort') {
      expect(action.reason).toContain(SLUG);
      expect(action.reason).toContain('date');
    }
  });

  it('aborts even when forceRegenerate=true (malformed reviews block both code paths)', () => {
    const entry = { ...ENTRY_WITHOUT_REVIEWS, _reviews: [] };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: true });
    expect(action.kind).toBe('abort');
  });

  it('aborts when _reviews is present but not an array', () => {
    const entry = { ...ENTRY_WITHOUT_REVIEWS, _reviews: { by: 'x', date: '2026-04-15' } };
    const action = decide({ slug: SLUG, existing: entry, candidate: CANDIDATE, forceRegenerate: false });
    expect(action.kind).toBe('abort');
    if (action.kind === 'abort') {
      expect(action.reason).toContain('_reviews');
    }
  });
});

describe('WriteDecisionPolicy.decide — purity', () => {
  it('does not mutate inputs', () => {
    const entry = JSON.parse(JSON.stringify(REVIEWED_ENTRY));
    const candidate = JSON.parse(JSON.stringify(CANDIDATE)) as CodeTiers;
    const before = JSON.stringify({ entry, candidate });
    decide({ slug: SLUG, existing: entry, candidate, forceRegenerate: false });
    expect(JSON.stringify({ entry, candidate })).toBe(before);
  });
});
