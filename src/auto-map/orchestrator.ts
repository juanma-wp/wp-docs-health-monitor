/**
 * Orchestrator wiring for `scripts/auto-map.ts`.
 *
 * Composes: scored-files → (optional re-rank) → CodeTiers. Pulled out of the
 * script so it can be exercised by a unit test without setting up the
 * full clone/fetch pipeline.
 *
 * The lexical-only branch is byte-identical to the pre-rerank `auto-map.ts`
 * tier-assembly logic (same `pickNext` + `findFilesByTreeHeuristic` mechanics,
 * same primary schema cap of 1).
 */
import { CodeTiersSchema, type CodeTiers, type CodeFile } from '../types/mapping.js';
import { findFilesByTreeHeuristic, type ScoredFile } from '../indexer/symbol-index.js';
import type { Reranker, RerankResult } from './rerank.js';
import type { RerankCache } from './rerank-cache.js';

export type BuildTiersInput = {
  docContent:     string;
  slug:           string;
  scored:         ScoredFile[];
  allFilesByRepo: Record<string, string[]>;
  // null = --no-rerank (skip the AI step entirely; lexical-only tiers).
  // present = rerank is on; falls back to lexical-only on null result.
  reranker:       Reranker | null;
  // Optional content-addressed cache. When supplied alongside a reranker,
  // the orchestrator wraps lookup → call-on-miss → store around the LLM call:
  // a hit skips the LLM entirely. `null` / `undefined` disables caching.
  cache?:         RerankCache | null;
};

export async function buildTiersForSlug(input: BuildTiersInput): Promise<CodeTiers> {
  if (input.reranker) {
    const result = await rerankWithCache(input.reranker, input.cache ?? null, input);
    if (result) return rerankToCodeTiers(result);
    // null = sentinel; the Reranker has already emitted a stderr warning.
    // Fall through to the lexical-only path.
  }
  return lexicalTiers(input.scored, input.allFilesByRepo, input.slug);
}

// Cache key is derived from docContent + canonically-sorted candidates +
// model. Slug is intentionally NOT in the key — the doc content already
// encodes it, and including it would split the cache for renamed slugs that
// kept identical doc bodies.
async function rerankWithCache(
  reranker: Reranker,
  cache:    RerankCache | null,
  input:    BuildTiersInput,
): Promise<RerankResult | null> {
  const key = cache?.keyFor({
    docContent: input.docContent,
    candidates: input.scored,
    model:      reranker.model,
  });
  if (cache && key) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const result = await reranker.rerank({
    doc:        input.docContent,
    slug:       input.slug,
    candidates: input.scored,
  });
  if (result && cache && key) cache.put(key, result);
  return result;
}

// Project the rerank result down to the locked CodeTiers shape (repo + path).
// Rationale, confidence, and dropped lists are slice-C concerns (audit file).
function rerankToCodeTiers(result: RerankResult): CodeTiers {
  const project = (xs: { repo: string; path: string }[]): CodeFile[] =>
    xs.map(({ repo, path }) => ({ repo, path }));
  return CodeTiersSchema.parse({
    primary:   project(result.primary),
    secondary: project(result.secondary),
    context:   project(result.context),
  });
}

// Pre-rerank assembly logic — preserved verbatim so `--no-rerank` is
// bit-identical to historical auto-map output.
function lexicalTiers(
  scored: ScoredFile[],
  allFilesByRepo: Record<string, string[]>,
  slug: string,
): CodeTiers {
  const selected = new Set<string>();
  const isSchemaPath = (path: string): boolean => /(^|\/)schemas\/.*\.json$/.test(path);

  function pickNext(n: number, maxSchemas: number = Infinity): CodeFile[] {
    const result: CodeFile[] = [];
    let schemaCount = 0;
    for (const f of scored) {
      if (result.length >= n) break;
      const key = `${f.repo}:${f.path}`;
      if (selected.has(key)) continue;
      if (isSchemaPath(f.path) && schemaCount >= maxSchemas) continue;
      selected.add(key);
      if (isSchemaPath(f.path)) schemaCount++;
      result.push({ repo: f.repo, path: f.path });
    }
    return result;
  }

  const primary   = pickNext(3, 1);
  const secondary = pickNext(5);

  const contextCandidates = findFilesByTreeHeuristic(slug, allFilesByRepo, selected);
  const context = contextCandidates.slice(0, 8).map(f => {
    selected.add(`${f.repo}:${f.path}`);
    return { repo: f.repo, path: f.path };
  });

  return CodeTiersSchema.parse({ primary, secondary, context });
}
