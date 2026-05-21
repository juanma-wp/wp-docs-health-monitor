/**
 * Manifest-entry ignore predicate.
 *
 * Mirrors `ManifestUrlDocSource.fetchDocs()`'s inline ignore logic so the
 * auto-map bootstrap (`scripts/auto-map.ts`) refuses ignored slugs in
 * single-slug mode and skips them in batch mode — keeping the mapping file
 * aligned with what the validator runtime will actually consult.
 *
 * The adapter retains its own inline copy for now; deduplicating that is a
 * follow-up that crosses the Ralph path-gate allowlist (see issue #94's
 * Out of Scope).
 */
import type { ManifestEntry } from '../types/mapping.js';

export interface IgnoreConfig {
  slugs?:    string[];
  subtrees?: string[];
}

export type IgnoreResult =
  | { matched: true; rule: 'slugs' | 'subtrees'; matchedAt: string }
  | { matched: false };

export function buildSlugToParent(entries: ManifestEntry[]): Map<string, string | null> {
  return new Map(entries.map(e => [e.slug, e.parent]));
}

/**
 * Reports whether a slug should be dropped, and if so, which rule fired and
 * which slug/subtree-root triggered the match.
 *
 * Semantics mirror the adapter exactly:
 *  - Early O(1) exit on `ignoredSlugs.has(slug)`.
 *  - Otherwise walk the ancestor chain starting at the slug itself (so
 *    `subtrees: [X]` drops X too, not only its descendants).
 *  - `seen` set guards against cyclic parent pointers.
 *  - Walk halts on `null` parent (top-level entries).
 */
export function checkIgnored(
  slug: string,
  slugToParent: Map<string, string | null>,
  ignore?: IgnoreConfig,
): IgnoreResult {
  const ignoredSlugs = new Set(ignore?.slugs    ?? []);
  const ignoredRoots = new Set(ignore?.subtrees ?? []);
  if (ignoredSlugs.has(slug)) return { matched: true, rule: 'slugs', matchedAt: slug };
  let cursor: string | null = slug;
  const seen = new Set<string>();
  while (cursor !== null && !seen.has(cursor)) {
    if (ignoredRoots.has(cursor)) {
      return { matched: true, rule: 'subtrees', matchedAt: cursor };
    }
    seen.add(cursor);
    cursor = slugToParent.get(cursor) ?? null;
  }
  return { matched: false };
}

export function isIgnored(
  slug: string,
  slugToParent: Map<string, string | null>,
  ignore?: IgnoreConfig,
): boolean {
  return checkIgnored(slug, slugToParent, ignore).matched;
}

/**
 * Render the user-facing refusal message for `auto-map.ts <slug>` when the
 * requested slug is ignored. Names the matched rule (slugs vs subtrees) and
 * the specific slug/root that triggered it, so the operator knows which
 * entry to edit if the refusal is unintended.
 */
export function formatIgnoreRefusal(
  slug: string,
  configPath: string,
  match: Extract<IgnoreResult, { matched: true }>,
): string {
  const ruleName = match.rule === 'slugs' ? 'ignore.slugs' : 'ignore.subtrees';
  return [
    `Slug "${slug}" is ignored by config (matched ${ruleName}: ["${match.matchedAt}"]).`,
    'The validator will not see this doc. Refusing to generate a mapping.',
    `Remove the slug from ignore.slugs / ignore.subtrees in ${configPath} if this is intentional.`,
  ].join('\n');
}
