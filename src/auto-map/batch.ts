/**
 * Batch-mode planning for `auto-map.ts --all`.
 *
 * Pure logic — no I/O, no LLM calls. Given a manifest, the configured
 * parentSlug, the ignore config, and the set of slugs already in the mapping
 * file, returns an ordered plan saying which slugs to map and which to skip.
 *
 * The script consumes the plan to drive iteration, progress output, and the
 * resume-by-default behaviour (skip-already-mapped unless --force).
 */
import type { ManifestEntry } from '../types/mapping.js';
import { buildSlugToParent, isIgnored, type IgnoreConfig } from './ignore-filter.js';

export interface BatchPlanItem {
  slug:   string;
  action: 'map' | 'skip-already-mapped';
}

export interface PlanBatchOptions {
  entries:       ManifestEntry[];
  parentSlug:    string;
  ignore?:       IgnoreConfig;
  existingSlugs: Set<string>;
  force:         boolean;
}

/**
 * Produce an ordered list of slugs to process in `--all` mode.
 *
 * Filtering applied (in order):
 *  1. `parent === parentSlug` (same in-scope predicate the adapter uses).
 *  2. Drop ignored entries via the shared `isIgnored` predicate.
 *
 * The returned length is the denominator of the `[N/total]` progress counter;
 * the counter must NOT use the raw manifest length, otherwise out-of-scope
 * entries inflate the total.
 */
export function planBatch(opts: PlanBatchOptions): BatchPlanItem[] {
  const slugToParent = buildSlugToParent(opts.entries);
  const inScope = opts.entries.filter(e =>
    e.parent === opts.parentSlug && !isIgnored(e.slug, slugToParent, opts.ignore),
  );
  return inScope.map(e => ({
    slug:   e.slug,
    action: !opts.force && opts.existingSlugs.has(e.slug)
      ? 'skip-already-mapped'
      : 'map',
  }));
}
