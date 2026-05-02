import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import pLimit from 'p-limit';
import { extractSymbolsFromSource } from '../extractors/typescript.js';
import { extractPhpSymbolsFromSource } from '../extractors/php.js';
import { extractHooksFromSource } from '../extractors/hooks.js';
import type { CodeSource } from '../adapters/code-source/types.js';

export type SymbolIndex = {
  repoId: string;
  commitSha: string;
  builtAt: string;
  // exported symbol name → file paths that define it
  symbols: Record<string, string[]>;
  // hook name → file paths that fire it
  hooks: Record<string, string[]>;
};

export type ScoredFile = {
  repo: string;
  path: string;
  score: number;
  matchedSymbols: string[];
};

const INDEXABLE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'php']);

// Build artifacts and generated output are not authoritative sources.
// node_modules/.git/vendor are already excluded by GitCloneSource.listDir.
const SKIP_PATTERNS = [/(^|\/)build\//, /(^|\/)dist\//, /(^|\/)coverage\//];

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(path));
}

function cachePath(cacheDir: string, repoId: string, sha: string): string {
  return join(cacheDir, `${repoId}-${sha}.json`);
}

function loadCached(cacheDir: string, repoId: string, sha: string): SymbolIndex | null {
  const p = cachePath(cacheDir, repoId, sha);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SymbolIndex;
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

          const fileSymbols =
            ext === 'php'
              ? extractPhpSymbolsFromSource(content, filePath)
              : extractSymbolsFromSource(content, filePath);

          for (const sym of fileSymbols) {
            (symbols[sym.name] ??= []).push(filePath);
          }

          for (const hook of extractHooksFromSource(content, filePath)) {
            (hooks[hook.name] ??= []).push(filePath);
          }
        } catch {
          // unreadable files are skipped silently
        }

        processed++;
        onProgress?.(processed, indexable.length);
      }),
    ),
  );

  const index: SymbolIndex = {
    repoId,
    commitSha,
    builtAt: new Date().toISOString(),
    symbols,
    hooks,
  };

  if (cacheDir) saveCache(cacheDir, index);
  return index;
}

// Score each file across all repos by the number of doc symbols it defines or fires.
// Returns a list sorted descending by score.
export function scoreFilesAcrossRepos(
  docSymbols: string[],
  indexes: Record<string, SymbolIndex>,
): ScoredFile[] {
  const scores = new Map<string, ScoredFile>();

  for (const [repoId, index] of Object.entries(indexes)) {
    for (const sym of docSymbols) {
      const filePaths = [
        ...(index.symbols[sym] ?? []),
        ...(index.hooks[sym] ?? []),
      ];
      for (const filePath of filePaths) {
        const key = `${repoId}:${filePath}`;
        const entry = scores.get(key) ?? {
          repo: repoId,
          path: filePath,
          score: 0,
          matchedSymbols: [],
        };
        entry.score++;
        entry.matchedSymbols.push(sym);
        scores.set(key, entry);
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
