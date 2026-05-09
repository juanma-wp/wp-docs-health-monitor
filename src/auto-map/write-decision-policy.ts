/**
 * WriteDecisionPolicy — pure function that decides what `scripts/auto-map.ts`
 * should do for a given slug invocation, given the existing per-slug entry
 * from the mapping file, the freshly-computed candidate `CodeTiers`, and the
 * `--force-regenerate` flag.
 *
 * The decision is a tagged union (`WriteActions`); the script dispatches on
 * `kind`. Keeping the policy I/O-free makes the branching exhaustively
 * unit-testable without touching the filesystem or the AI re-ranker.
 *
 * Branching table (mirrors the issue's spec):
 *
 *   Existing entry                       | forceRegenerate | Action
 *   -------------------------------------|-----------------|----------------------
 *   Slug not in mapping                  | –               | write-mapping
 *   Slug present, no `_reviews` field    | –               | write-mapping
 *   Slug present, valid `_reviews` (≥1)  | false           | write-suggestion
 *   Slug present, valid `_reviews` (≥1)  | true            | force-regenerate
 *   Slug present, malformed `_reviews`   | any             | abort (named field)
 *
 * Malformed = `_reviews` not an array, empty array, entry missing `by`, entry
 * with empty `by`, entry with non-ISO `date` (YYYY-MM-DD).
 */
import type { CodeTiers, ReviewEntry } from '../types/mapping.js';

export type WriteActions =
  | { kind: 'write-mapping';     tiers: CodeTiers }
  | { kind: 'write-suggestion';  tiers: CodeTiers; latestReview: ReviewEntry }
  | { kind: 'force-regenerate';  tiers: CodeTiers }
  | { kind: 'abort';             reason: string };

export interface DecideInput {
  slug:            string;
  // Raw existing per-slug entry from the mapping file, or undefined if the
  // slug is not yet in the file. Typed `unknown` because we need to detect
  // malformed `_reviews` ourselves rather than rejecting it at JSON-load time.
  existing:        unknown;
  candidate:       CodeTiers;
  forceRegenerate: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function decide(input: DecideInput): WriteActions {
  const { slug, existing, candidate, forceRegenerate } = input;

  if (existing === undefined || existing === null || typeof existing !== 'object') {
    return { kind: 'write-mapping', tiers: candidate };
  }

  const entry = existing as Record<string, unknown>;
  if (!('_reviews' in entry)) {
    return { kind: 'write-mapping', tiers: candidate };
  }

  const reviewsRaw = entry._reviews;
  if (!Array.isArray(reviewsRaw)) {
    return abort(slug, '"_reviews" is present but is not an array');
  }
  if (reviewsRaw.length === 0) {
    return abort(slug, '"_reviews" is an empty array');
  }

  const reviews: ReviewEntry[] = [];
  for (let i = 0; i < reviewsRaw.length; i++) {
    const r = reviewsRaw[i];
    if (typeof r !== 'object' || r === null) {
      return abort(slug, `"_reviews"[${i}] is not an object`);
    }
    const re = r as Record<string, unknown>;
    if (typeof re.by !== 'string') {
      return abort(slug, `"_reviews"[${i}] is missing string field "by"`);
    }
    if (re.by.length === 0) {
      return abort(slug, `"_reviews"[${i}].by is empty`);
    }
    if (typeof re.date !== 'string') {
      return abort(slug, `"_reviews"[${i}] is missing string field "date"`);
    }
    if (!ISO_DATE.test(re.date)) {
      return abort(slug, `"_reviews"[${i}].date is not ISO YYYY-MM-DD ("${re.date}")`);
    }
    const review: ReviewEntry = { by: re.by, date: re.date };
    if (typeof re.notes === 'string') review.notes = re.notes;
    reviews.push(review);
  }

  if (forceRegenerate) {
    return { kind: 'force-regenerate', tiers: candidate };
  }

  // Pick max(date) order-independently. ISO YYYY-MM-DD strings sort
  // lexicographically the same way they sort chronologically, so a plain
  // string compare is correct. Ties break on first-seen so the result is
  // deterministic for callers that snapshot it.
  let latestReview = reviews[0];
  for (let i = 1; i < reviews.length; i++) {
    if (reviews[i].date > latestReview.date) latestReview = reviews[i];
  }

  return { kind: 'write-suggestion', tiers: candidate, latestReview };
}

function abort(slug: string, detail: string): WriteActions {
  return { kind: 'abort', reason: `Mapping for "${slug}": ${detail}.` };
}
