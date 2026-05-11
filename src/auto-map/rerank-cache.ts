/**
 * Content-addressed disk cache for the AI re-ranker.
 *
 * Cache key is `sha256(docContent + sortedCandidates + model)`, truncated to
 * 16 hex chars for filename hygiene. Re-running auto-map on the same corpus
 * with the same doc, the same candidate list (regardless of input order), and
 * the same model is bit-identical and free.
 *
 * Disk layout mirrors `tmp/symbol-index-cache/`: one JSON file per key under
 * the configured cache directory (default `tmp/auto-map-rerank-cache/`). Each
 * file carries a `version` field; when this module's `RERANK_CACHE_VERSION`
 * changes, older entries are treated as misses rather than crashing the
 * loader. Malformed or schema-mismatched files are also treated as misses.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  RerankResultSchema,
  type Candidate,
  type RerankResult,
} from './rerank.js';

// Bump when the on-disk envelope or the RerankResult shape changes.
// v2: dropped files carry `rationale` (was `reason`) — matches the model's
// reliable output and removes the kept/dropped field-name split that caused
// every fresh run to fail schema validation.
export const RERANK_CACHE_VERSION = 2;

export type RerankCacheKeyInput = {
  docContent: string;
  candidates: Candidate[];
  model:      string;
};

function defaultCacheDir(): string {
  return join(process.cwd(), 'tmp', 'auto-map-rerank-cache');
}

// Canonical candidate order: score desc, then `repo:path` lex asc. Matches
// the canonicalOrder() used inside the Reranker prompt — same input, same
// hash, regardless of upstream iteration order.
function canonicalCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return `${a.repo}:${a.path}`.localeCompare(`${b.repo}:${b.path}`);
  });
}

export class RerankCache {
  private readonly cacheDir: string;

  constructor(cacheDir: string = defaultCacheDir()) {
    this.cacheDir = cacheDir;
  }

  keyFor(input: RerankCacheKeyInput): string {
    const ordered = canonicalCandidates(input.candidates).map(c => ({
      repo:           c.repo,
      path:           c.path,
      score:          c.score,
      matchedSymbols: c.matchedSymbols,
    }));
    const payload = JSON.stringify({
      doc:        input.docContent,
      candidates: ordered,
      model:      input.model,
    });
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  get(key: string): RerankResult | null {
    const path = this.pathFor(key);
    if (!existsSync(path)) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const envelope = raw as { version?: unknown; result?: unknown };
    if (envelope.version !== RERANK_CACHE_VERSION) return null;
    const parsed = RerankResultSchema.safeParse(envelope.result);
    return parsed.success ? parsed.data : null;
  }

  put(key: string, result: RerankResult): void {
    mkdirSync(this.cacheDir, { recursive: true });
    const envelope = { version: RERANK_CACHE_VERSION, result };
    writeFileSync(this.pathFor(key), JSON.stringify(envelope));
  }

  private pathFor(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }
}
