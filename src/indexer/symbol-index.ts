import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import pLimit from 'p-limit';
import { extractSymbolsFromSource } from '../extractors/typescript.js';
import { extractPhpSymbolsFromSource } from '../extractors/php.js';
import { extractJsonSchemaSymbolsFromSource } from '../extractors/json-schema.js';
import { extractHooksFromSource } from '../extractors/hooks.js';
import type { CodeSource } from '../adapters/code-source/types.js';

export type SymbolIndex = {
  repoId: string;
  commitSha: string;
  builtAt: string;
  // all files found in the repo (unfiltered by extension)
  files: string[];
  // exported symbol name → file paths that define it
  symbols: Record<string, string[]>;
  // hook name → file paths that fire it
  hooks: Record<string, string[]>;
  // Inverse-document-frequency for each symbol/hook name across the indexed
  // file set. Higher = the name is more selective. Computed once at build
  // time and consulted by scoreFilesAcrossRepos so generic symbols (`name`,
  // `style`, `icon`) contribute less to relevance than rare ones.
  symbolIdf: Record<string, number>;
  hookIdf: Record<string, number>;
  // Total number of files actually indexed (used in IDF and not always equal
  // to `files.length` — `files` includes everything listed in the repo,
  // including `.json` files that are not in `schemas/`).
  indexedFileCount: number;
};

export type ScoredFile = {
  repo: string;
  path: string;
  score: number;
  matchedSymbols: string[];
};

// Cache schema version. Bump when the on-disk SymbolIndex shape changes so
// older caches are treated as misses rather than crashing the loader.
const CACHE_VERSION = 2;

const INDEXABLE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'php', 'json']);

// Build artifacts and generated output are not authoritative sources.
// node_modules/.git/vendor are already excluded by GitCloneSource.listDir.
const SKIP_PATTERNS = [
  /(^|\/)build\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)__tests__\//,
  /(^|\/)[^/]+\.test\.[jt]sx?$/,
  /(^|\/)[^/]+\.spec\.[jt]sx?$/,
];

// JSON files are noisy by default (package.json, tsconfig.json, lockfiles,
// fixtures) — only index those under a schemas/ directory, where they hold
// authoritative property/definition names worth surfacing.
function shouldExtractJson(path: string): boolean {
  return /(^|\/)schemas\/.*\.json$/.test(path);
}

function shouldSkip(path: string): boolean {
  if (SKIP_PATTERNS.some(p => p.test(path))) return true;
  if (path.endsWith('.json') && !shouldExtractJson(path)) return true;
  return false;
}

// Path-based weight applied per match in scoreFilesAcrossRepos. Schemas and
// dedicated TypeScript surface-contract files are the most authoritative for
// docs-vs-code drift checks; story/icon/fixture files match a lot of generic
// symbols (`name`, `style`, `icon`) without being authoritative for any doc
// claim, so they are heavily demoted.
//
// Multiplicative weighting (rather than dropping these files from the index
// entirely) keeps the index complete: a story file may still be useful as
// corroboration for a niche claim, just not as a primary mapping target.
export function getFileWeight(path: string): number {
  // Schema files are boosted because schema-anchored docs treat them as the
  // canonical contract — but only modestly. A larger boost (5×) was tried and
  // caused unrelated schemas (theme.json, wp-env.json) to dominate primary
  // tiers for docs they had nothing to do with: any two schemas in the same
  // corpus share generic property names (`name`, `style`, `url`, `link`),
  // and a heavy boost amplified that coincidence past real implementation
  // matches. 2× keeps schemas competitive without crowding out implementation.
  if (/(^|\/)schemas\/.*\.json$/.test(path))               return 2.0;
  if (/\.d\.ts$/.test(path))                               return 2.0;
  if (/(^|\/)types\.ts$/.test(path))                       return 2.0;
  if (/\.story\.[jt]sx?$/.test(path))                      return 0.1;
  if (/(^|\/)stories\//.test(path))                        return 0.1;
  if (/(^|\/)icons?\//.test(path))                         return 0.1;
  if (/(^|\/)icon\.[jt]sx?$/.test(path))                   return 0.1;
  if (/(^|\/)(fixtures|__fixtures__)\//.test(path))        return 0.1;
  if (/(^|\/)examples?\//.test(path))                      return 0.5;
  return 1.0;
}

function computeIdf(
  occurrences: Record<string, string[]>,
  totalFiles: number,
): Record<string, number> {
  const idf: Record<string, number> = {};
  for (const [name, files] of Object.entries(occurrences)) {
    // +1 in numerator and denominator to keep IDF well-behaved when a symbol
    // occurs in every file. Clamp at 0 in case of inconsistent inputs (a
    // symbol referencing more files than indexedFileCount, e.g. when a test
    // helper builds an index with a low explicit total). The exact additive
    // smoothing matters less than its monotonicity: rarer = higher score.
    idf[name] = Math.max(0, Math.log((totalFiles + 1) / (files.length + 1)));
  }
  return idf;
}

function cachePath(cacheDir: string, repoId: string, sha: string): string {
  return join(cacheDir, `${repoId}-${sha}-v${CACHE_VERSION}.json`);
}

function loadCached(cacheDir: string, repoId: string, sha: string): SymbolIndex | null {
  const p = cachePath(cacheDir, repoId, sha);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<SymbolIndex>;
    // Treat caches written by older versions (missing fields) as a miss.
    if (
      !raw.symbols ||
      !raw.hooks ||
      !raw.files ||
      !raw.symbolIdf ||
      !raw.hookIdf ||
      typeof raw.indexedFileCount !== 'number'
    ) {
      return null;
    }
    return raw as SymbolIndex;
  } catch {
    return null;
  }
}

function saveCache(cacheDir: string, index: SymbolIndex): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath(cacheDir, index.repoId, index.commitSha), JSON.stringify(index));
}

function defaultCacheDir(): string {
  return join(process.cwd(), 'tmp', 'symbol-index-cache');
}

export type BuildOptions = {
  // Pass null to disable disk caching (useful in tests).
  cacheDir?: string | null;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
};

export async function buildSymbolIndex(
  repoId: string,
  codeSource: CodeSource,
  options: BuildOptions = {},
): Promise<SymbolIndex> {
  const { cacheDir = defaultCacheDir(), concurrency = 8, onProgress } = options;

  const commitSha = await codeSource.getCommitSha();

  if (cacheDir) {
    const cached = loadCached(cacheDir, repoId, commitSha);
    if (cached) return cached;
  }

  const allFiles = await codeSource.listDir('.');
  const indexable = allFiles.filter(f => {
    const ext = f.split('.').pop()?.toLowerCase() ?? '';
    return INDEXABLE_EXTS.has(ext) && !shouldSkip(f);
  });

  const symbols: Record<string, string[]> = {};
  const hooks: Record<string, string[]> = {};
  const limit = pLimit(concurrency);
  let processed = 0;

  await Promise.all(
    indexable.map(filePath =>
      limit(async () => {
        try {
          const content = await codeSource.readFile(filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

          let fileSymbols;
          if (ext === 'json') {
            fileSymbols = extractJsonSchemaSymbolsFromSource(content, filePath);
          } else if (ext === 'php') {
            fileSymbols = extractPhpSymbolsFromSource(content, filePath);
          } else {
            fileSymbols = extractSymbolsFromSource(content, filePath);
          }

          for (const sym of fileSymbols) {
            (symbols[sym.name] ??= []).push(filePath);
          }

          // Hook firing sites only exist in code, not in JSON schemas.
          if (ext !== 'json') {
            for (const hook of extractHooksFromSource(content, filePath)) {
              (hooks[hook.name] ??= []).push(filePath);
            }
          }
        } catch {
          // unreadable files are skipped silently
        }

        processed++;
        onProgress?.(processed, indexable.length);
      }),
    ),
  );

  const indexedFileCount = indexable.length;
  const symbolIdf = computeIdf(symbols, indexedFileCount);
  const hookIdf = computeIdf(hooks, indexedFileCount);

  const index: SymbolIndex = {
    repoId,
    commitSha,
    builtAt: new Date().toISOString(),
    files: allFiles,
    symbols,
    hooks,
    symbolIdf,
    hookIdf,
    indexedFileCount,
  };

  if (cacheDir) saveCache(cacheDir, index);
  return index;
}

// Score each file across all repos by the IDF-weighted, file-weight-adjusted
// match count of doc symbols it defines or fires. Returns a list sorted
// descending by score.
//
// score(file) = sum_over_matched_symbols( fileWeight(file) * idf(symbol) )
//
// fileWeight demotes story/icon/fixture noise and boosts schema and surface-
// contract files; idf demotes generic symbol matches (`name`, `style`) so a
// schema property mentioned once in the corpus outweighs a generic word
// mentioned in hundreds of files.
export function scoreFilesAcrossRepos(
  docSymbols: string[],
  indexes: Record<string, SymbolIndex>,
): ScoredFile[] {
  const scores = new Map<string, ScoredFile>();

  function addMatch(
    repoId: string,
    filePath: string,
    sym: string,
    weight: number,
    idf: number,
  ): void {
    const key = `${repoId}:${filePath}`;
    const entry = scores.get(key) ?? {
      repo: repoId,
      path: filePath,
      score: 0,
      matchedSymbols: [],
    };
    entry.score += weight * idf;
    entry.matchedSymbols.push(sym);
    scores.set(key, entry);
  }

  for (const [repoId, index] of Object.entries(indexes)) {
    for (const sym of docSymbols) {
      const symbolFiles = index.symbols[sym] ?? [];
      const hookFiles = index.hooks[sym] ?? [];
      const symIdf = index.symbolIdf[sym] ?? 0;
      const hkIdf = index.hookIdf[sym] ?? 0;

      for (const filePath of symbolFiles) {
        addMatch(repoId, filePath, sym, getFileWeight(filePath), symIdf);
      }
      for (const filePath of hookFiles) {
        addMatch(repoId, filePath, sym, getFileWeight(filePath), hkIdf);
      }
    }
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}

// Words so common in this domain that they add no selectivity to path matching.
const COMMON_SLUG_WORDS = new Set([
  'block', 'blocks', 'with', 'from', 'that', 'this', 'into', 'over',
  'about', 'after', 'before', 'using', 'your', 'their', 'when', 'each',
]);

// Find files whose path contains keywords derived from the doc slug.
// Used to populate the context tier with structurally related files that
// the symbol index may not surface (e.g. no exported symbol by that name).
// Results are sorted shallow-first (fewer path segments = more authoritative).
export function findFilesByTreeHeuristic(
  slug: string,
  allFilesByRepo: Record<string, string[]>,
  exclude: Set<string>,
): Array<{ repo: string; path: string }> {
  const keywords = slug
    .split(/[-_/\s]/)
    .filter(k => k.length >= 5 && !COMMON_SLUG_WORDS.has(k));

  if (keywords.length === 0) return [];

  const results: Array<{ repo: string; path: string }> = [];

  for (const [repoId, files] of Object.entries(allFilesByRepo)) {
    for (const filePath of files) {
      if (exclude.has(`${repoId}:${filePath}`)) continue;

      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      if (!INDEXABLE_EXTS.has(ext) || shouldSkip(filePath)) continue;

      const lower = filePath.toLowerCase();
      if (keywords.some(k => lower.includes(k.toLowerCase()))) {
        results.push({ repo: repoId, path: filePath });
      }
    }
  }

  return results.sort((a, b) => {
    const depthDiff = a.path.split('/').length - b.path.split('/').length;
    return depthDiff !== 0 ? depthDiff : a.path.localeCompare(b.path);
  });
}
