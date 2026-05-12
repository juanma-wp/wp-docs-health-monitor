import { describe, it, expect } from 'vitest';

import { planBatch } from '../batch.js';
import { buildSlugToParent, checkIgnored } from '../ignore-filter.js';
import type { ManifestEntry } from '../../types/mapping.js';

// Compact constructor so test bodies focus on slug/parent semantics.
function entries(...rows: Array<[slug: string, parent: string | null]>): ManifestEntry[] {
  return rows.map(([slug, parent]) => ({
    slug,
    title:           slug,
    markdown_source: `https://example.com/${slug}.md`,
    parent,
  }));
}

describe('planBatch — drives `auto-map.ts --all` iteration', () => {
  const MANIFEST = entries(
    ['block-api',        null],
    ['block-attributes', 'block-api'],
    ['block-bindings',   'block-api'],
    ['block-metadata',   'block-api'],
    // Out-of-scope: not under parentSlug
    ['some-other-area',  null],
    ['inner-other',      'some-other-area'],
    // Under parentSlug but explicitly ignored
    ['contributors',     'block-api'],
    // Under a subtree root — both root and descendant should be excluded under subtrees
    ['packages',         'block-api'],
    ['packages-blocks',  'packages'],
  );

  it('iterates only in-scope (parent === parentSlug), non-ignored entries — preserves manifest order', () => {
    const plan = planBatch({
      entries:    MANIFEST,
      parentSlug: 'block-api',
      ignore:     { slugs: ['contributors'], subtrees: ['packages'] },
      existingSlugs: new Set(),
      force:      false,
    });
    // Out-of-scope `some-other-area` and `inner-other` excluded.
    // Ignored `contributors`, `packages`, and the descendant `packages-blocks` excluded.
    expect(plan.map(p => p.slug)).toEqual([
      'block-attributes',
      'block-bindings',
      'block-metadata',
    ]);
    // `packages-blocks` has parent `packages` (not `block-api`) so it was never
    // in scope anyway — but pin the principle: ignore.subtrees excludes the
    // root AND the descendant chain even when a descendant *would* otherwise
    // be eligible.
    const planNoIgnore = planBatch({
      entries:    MANIFEST,
      parentSlug: 'packages',
      ignore:     { subtrees: ['packages'] },
      existingSlugs: new Set(),
      force:      false,
    });
    expect(planNoIgnore.map(p => p.slug)).toEqual([]); // packages-blocks excluded
  });

  it('skips slugs already in the mapping file by default', () => {
    const plan = planBatch({
      entries:    MANIFEST,
      parentSlug: 'block-api',
      ignore:     { slugs: ['contributors'], subtrees: ['packages'] },
      existingSlugs: new Set(['block-attributes']),
      force:      false,
    });
    const byAction = (a: string) => plan.filter(p => p.action === a).map(p => p.slug);
    expect(byAction('map')).toEqual(['block-bindings', 'block-metadata']);
    expect(byAction('skip-already-mapped')).toEqual(['block-attributes']);
  });

  it('with --force re-maps every in-scope, non-ignored slug regardless of existing entries', () => {
    const plan = planBatch({
      entries:    MANIFEST,
      parentSlug: 'block-api',
      ignore:     { slugs: ['contributors'], subtrees: ['packages'] },
      existingSlugs: new Set(['block-attributes', 'block-bindings', 'block-metadata']),
      force:      true,
    });
    // Every plan item is `map` — none skipped.
    expect(plan.every(p => p.action === 'map')).toBe(true);
    expect(plan.map(p => p.slug)).toEqual([
      'block-attributes',
      'block-bindings',
      'block-metadata',
    ]);
  });

  it('plan length reflects total in-scope non-ignored slugs (the `[N/total]` denominator)', () => {
    // PRD: progress counter [N/total] reflects total in-scope, non-ignored slugs
    // (not raw manifest length). plan.length is what the script uses.
    const plan = planBatch({
      entries:    MANIFEST,
      parentSlug: 'block-api',
      ignore:     { slugs: ['contributors'], subtrees: ['packages'] },
      existingSlugs: new Set(['block-attributes']),
      force:      false,
    });
    // total = 3 (in-scope non-ignored), NOT 9 (raw manifest), NOT 4 (raw in-scope before ignore).
    expect(plan.length).toBe(3);
    expect(plan.length).not.toBe(MANIFEST.length);
  });

  it('contrast: same ignored slug → batch silently filters, single-slug would refuse', () => {
    // PRD #94 specifically calls for a test pinning this asymmetry so a future
    // refactor cannot accidentally collapse the two paths into one behavior.
    // - Batch mode: ignored slugs vanish from the plan with no error (the
    //   operator wants to iterate everything that's still in scope; the
    //   ignored entries are simply not in scope).
    // - Single-slug mode: ignored slug → checkIgnored returns matched=true,
    //   which the script translates into an exit-1 refusal so the operator
    //   notices they asked for something out of scope.
    const planResult = planBatch({
      entries:       MANIFEST,
      parentSlug:    'block-api',
      ignore:        { slugs: ['contributors'] },
      existingSlugs: new Set(),
      force:         false,
    });
    expect(planResult.map(p => p.slug)).not.toContain('contributors'); // silent in batch

    const slugToParent = buildSlugToParent(MANIFEST);
    const singleSlugCheck = checkIgnored('contributors', slugToParent, { slugs: ['contributors'] });
    expect(singleSlugCheck).toEqual({                                  // refusal in single-slug
      matched:   true,
      rule:      'slugs',
      matchedAt: 'contributors',
    });
  });

  it('omitted ignore yields all in-scope entries (predicate is opt-in)', () => {
    const plan = planBatch({
      entries:    MANIFEST,
      parentSlug: 'block-api',
      existingSlugs: new Set(),
      force:      false,
    });
    // Every direct child of block-api is mapped — contributors and packages too.
    expect(plan.map(p => p.slug)).toEqual([
      'block-attributes',
      'block-bindings',
      'block-metadata',
      'contributors',
      'packages',
    ]);
  });
});
