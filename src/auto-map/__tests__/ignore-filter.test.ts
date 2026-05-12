import { describe, it, expect } from 'vitest';

import {
  buildSlugToParent,
  checkIgnored,
  formatIgnoreRefusal,
  isIgnored,
} from '../ignore-filter.js';
import type { ManifestEntry } from '../../types/mapping.js';

// Mirrors the shape (slug → parent) the adapter constructs, so the predicate
// here is tested against the same data the adapter sees at runtime.
function entries(...rows: Array<[slug: string, parent: string | null]>): ManifestEntry[] {
  return rows.map(([slug, parent]) => ({
    slug,
    title:           slug,
    markdown_source: `https://example.com/${slug}.md`,
    parent,
  }));
}

describe('isIgnored', () => {
  it('returns false when no ignore config is provided (predicate is opt-in)', () => {
    const m = buildSlugToParent(entries(['block-api', null], ['block-attributes', 'block-api']));
    expect(isIgnored('block-attributes', m)).toBe(false);
  });

  it('returns false when ignore is provided but empty', () => {
    const m = buildSlugToParent(entries(['block-api', null], ['block-attributes', 'block-api']));
    expect(isIgnored('block-attributes', m, { slugs: [], subtrees: [] })).toBe(false);
  });

  it('matches a slug listed in ignore.slugs (and only that slug, not descendants)', () => {
    const m = buildSlugToParent(entries(
      ['reference-guides', null],
      ['packages',         'reference-guides'],
      ['packages-blocks',  'packages'],   // descendant of packages
    ));
    // packages itself: matched
    expect(isIgnored('packages', m, { slugs: ['packages'] })).toBe(true);
    // descendant: NOT matched under `slugs` (only `subtrees` is transitive)
    expect(isIgnored('packages-blocks', m, { slugs: ['packages'] })).toBe(false);
  });

  it('matches the named root AND all transitive descendants under ignore.subtrees', () => {
    const m = buildSlugToParent(entries(
      ['reference-guides', null],
      ['packages',         'reference-guides'],
      ['packages-blocks',  'packages'],
      ['packages-blocks-api-registration', 'packages-blocks'],
      ['unrelated',        'reference-guides'],
    ));
    expect(isIgnored('packages',                          m, { subtrees: ['packages'] })).toBe(true);
    expect(isIgnored('packages-blocks',                   m, { subtrees: ['packages'] })).toBe(true);
    expect(isIgnored('packages-blocks-api-registration',  m, { subtrees: ['packages'] })).toBe(true);
    expect(isIgnored('reference-guides',                  m, { subtrees: ['packages'] })).toBe(false);
    expect(isIgnored('unrelated',                         m, { subtrees: ['packages'] })).toBe(false);
  });

  it('terminates on a cycle in the parent map (cycle guard)', () => {
    // a → b → c → a (synthetic; should never occur in real manifests).
    const m = new Map<string, string | null>([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    // None of a/b/c are ignore roots — predicate must return false, not loop forever.
    expect(isIgnored('a', m, { subtrees: ['z'] })).toBe(false);
    expect(isIgnored('b', m, { subtrees: ['z'] })).toBe(false);
    // But a root anywhere in the cycle is still detected.
    expect(isIgnored('a', m, { subtrees: ['c'] })).toBe(true);
  });

  it('walks ancestors only via the parent map; orphan slugs (unknown parent) are not ignored unless directly matched', () => {
    const m = buildSlugToParent(entries(['orphan', null]));
    expect(isIgnored('orphan',   m, { subtrees: ['ghost-root'] })).toBe(false);
    expect(isIgnored('orphan',   m, { slugs:    ['orphan']     })).toBe(true);
  });
});

describe('checkIgnored — reports which rule matched (used by the refusal message)', () => {
  it('reports the matched slug-list rule', () => {
    const m = buildSlugToParent(entries(['x', null]));
    expect(checkIgnored('x', m, { slugs: ['x'] })).toEqual({
      matched:   true,
      rule:      'slugs',
      matchedAt: 'x',
    });
  });

  it('reports the matched subtree root (not the slug being checked)', () => {
    const m = buildSlugToParent(entries(
      ['root',  null],
      ['child', 'root'],
      ['grand', 'child'],
    ));
    expect(checkIgnored('grand', m, { subtrees: ['root'] })).toEqual({
      matched:   true,
      rule:      'subtrees',
      matchedAt: 'root',
    });
  });

  it('returns matched=false when no rule fires', () => {
    const m = buildSlugToParent(entries(['x', null]));
    expect(checkIgnored('x', m, { slugs: ['y'], subtrees: ['z'] })).toEqual({ matched: false });
  });
});

describe('formatIgnoreRefusal — human-readable error for single-slug mode', () => {
  it('names the rule and the matched slug/subtree', () => {
    const out = formatIgnoreRefusal('packages-blocks', '/cfg/site.json', {
      matched:   true,
      rule:      'subtrees',
      matchedAt: 'packages',
    });
    expect(out).toContain('packages-blocks');
    expect(out).toContain('ignore.subtrees');
    expect(out).toContain('"packages"');
    expect(out).toContain('/cfg/site.json');
    expect(out).toMatch(/Refusing to generate a mapping/i);
  });

  it('distinguishes the slugs rule from the subtrees rule in the message', () => {
    const slugRule    = formatIgnoreRefusal('x', '/cfg.json', { matched: true, rule: 'slugs',    matchedAt: 'x' });
    const subtreeRule = formatIgnoreRefusal('x', '/cfg.json', { matched: true, rule: 'subtrees', matchedAt: 'x' });
    expect(slugRule).toContain('ignore.slugs');
    expect(slugRule).not.toContain('ignore.subtrees:');
    expect(subtreeRule).toContain('ignore.subtrees');
    expect(subtreeRule).not.toContain('ignore.slugs:');
  });
});
