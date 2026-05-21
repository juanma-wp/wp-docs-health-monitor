/**
 * auto-map.ts — mapping bootstrap using symbol index + tree heuristics +
 * (optional) AI re-ranker.
 *
 * Usage:
 *   npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write] [--no-rerank] [--explain]
 *   npx tsx scripts/auto-map.ts --all  [--config <path>] [--no-rerank] [--force]
 *
 * Single-slug mode: maps one slug to a CodeTiers entry. Refuses ignored slugs
 * (those matched by `config.docSource.ignore`) with a clear error — the
 * validator would never consult such an entry at runtime, so creating one is
 * dead weight.
 *
 * Batch mode (`--all`): iterates every in-scope, non-ignored manifest entry
 * (same `parent === parentSlug` filter and `isIgnored` predicate the adapter
 * uses at runtime), maps each to a CodeTiers entry, and writes them all to
 * `config.mappingPath`. Resumable by default — slugs already keyed in the
 * mapping file are skipped (use `--force` to re-map regardless).
 *
 * Flags:
 *   --config <path>      Config file (default: config/gutenberg-block-api.json)
 *   --write              Write the canonical mapping AND the audit file (when re-rank ran)
 *   --no-rerank          Skip the AI re-ranker (lexical-only output, no audit)
 *   --explain            Print rationale per kept file and reason per dropped file to stdout
 *   --all                Batch mode (implicit --write)
 *   --force              In --all mode, re-map every slug even if already in the mapping file
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config/loader.js';
import { createCodeSources } from '../src/adapters/index.js';
import {
  ManifestEntrySchema,
  type ManifestEntry,
  type CodeTiers,
} from '../src/types/mapping.js';
import { extractDocSymbols } from '../src/adapters/validator/context-assembler.js';
import {
  buildSymbolIndex,
  scoreFilesAcrossRepos,
  type SymbolIndex,
} from '../src/indexer/symbol-index.js';
import { Reranker } from '../src/auto-map/rerank.js';
import { RerankCache } from '../src/auto-map/rerank-cache.js';
import { buildTiersForSlug, auditPathFor } from '../src/auto-map/orchestrator.js';
import { AuditWriter } from '../src/auto-map/audit-writer.js';
import { parseArgs } from '../src/auto-map/parse-args.js';
import {
  buildSlugToParent,
  checkIgnored,
  formatIgnoreRefusal,
} from '../src/auto-map/ignore-filter.js';
import { planBatch, type BatchPlanItem } from '../src/auto-map/batch.js';
import type { Config } from '../src/config/schema.js';

export { parseArgs };

async function fetchManifestEntries(config: Config): Promise<ManifestEntry[]> {
  const manifestRes = await fetch(config.docSource.manifestUrl);
  if (!manifestRes.ok) {
    console.error(`Failed to fetch manifest: HTTP ${manifestRes.status}`);
    process.exit(1);
  }
  const rawEntries = (await manifestRes.json()) as unknown[];
  return rawEntries.flatMap((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const entry = raw as Record<string, unknown>;
    if (typeof entry.markdown_source === 'string') {
      entry.markdown_source = new URL(
        entry.markdown_source,
        config.docSource.manifestUrl,
      ).href;
    }
    const parsed = ManifestEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

async function buildIndexes(config: Config): Promise<{
  indexes:        Record<string, SymbolIndex>;
  allFilesByRepo: Record<string, string[]>;
}> {
  const codeSources = createCodeSources(config);
  const indexes: Record<string, SymbolIndex> = {};
  const allFilesByRepo: Record<string, string[]> = {};

  for (const [repoId, cs] of Object.entries(codeSources)) {
    process.stderr.write(`Building symbol index for "${repoId}"... `);
    let lastPct = -1;

    indexes[repoId] = await buildSymbolIndex(repoId, cs, {
      onProgress(done, total) {
        const pct = Math.floor((done / total) * 100);
        if (pct >= lastPct + 10) {
          process.stderr.write(`${pct}%... `);
          lastPct = pct;
        }
      },
    });

    process.stderr.write('done\n');
    allFilesByRepo[repoId] = indexes[repoId].files;
  }
  return { indexes, allFilesByRepo };
}

function readExistingMapping(mappingPath: string): Record<string, unknown> {
  if (!existsSync(mappingPath)) return {};
  const parsed = JSON.parse(readFileSync(mappingPath, 'utf-8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function writeMappingEntry(mappingPath: string, slug: string, tiers: CodeTiers): void {
  const existing = readExistingMapping(mappingPath);
  const merged: Record<string, unknown> = { ...existing, [slug]: tiers };
  writeFileSync(mappingPath, JSON.stringify(merged, null, 2) + '\n');
}

type ProcessSlugOptions = {
  entry:          ManifestEntry;
  indexes:        Record<string, SymbolIndex>;
  allFilesByRepo: Record<string, string[]>;
  reranker:       Reranker | null;
  cache:          RerankCache | null;
  write:          boolean;
  explain:        boolean;
  mappingPath:    string;
  auditWriter:    AuditWriter;
  emitJson:       boolean;  // single-slug mode prints the JSON to stdout; batch mode does not
};

async function processSlug(opts: ProcessSlugOptions): Promise<void> {
  const { entry, indexes, allFilesByRepo, reranker, cache, write, explain, mappingPath, auditWriter, emitJson } = opts;

  // 1. Fetch doc content and extract referenced symbols
  const docRes = await fetch(entry.markdown_source);
  if (!docRes.ok) {
    console.error(`Failed to fetch doc for "${entry.slug}": HTTP ${docRes.status}`);
    return;
  }
  const docContent = await docRes.text();
  const docSymbols = extractDocSymbols(docContent);

  console.error(
    `Found ${docSymbols.length} symbols in doc: ${docSymbols.slice(0, 10).join(', ')}${docSymbols.length > 10 ? '...' : ''}`,
  );

  // 2. Score all files by how many doc symbols they define or fire
  const scored = scoreFilesAcrossRepos(docSymbols, indexes);

  console.error('\nTop matches by symbol coverage (IDF-weighted, file-weighted):');
  scored.slice(0, 10).forEach(f =>
    console.error(
      `  [${f.repo}] ${f.path}  score=${f.score.toFixed(2)}  (${f.matchedSymbols.slice(0, 5).join(', ')})`,
    ),
  );

  // 3. Build tiers (with optional re-rank).
  const { tiers, rerankResult } = await buildTiersForSlug({
    docContent,
    slug:    entry.slug,
    scored,
    allFilesByRepo,
    reranker,
    cache,
  });

  // 4. Output as JSON (single-slug mode; batch mode suppresses stdout JSON
  // because the operator wants the mapping file, not 150 JSON blobs on stdout)
  if (emitJson) {
    const output = { [entry.slug]: tiers };
    console.log(JSON.stringify(output, null, 2));
  }

  // 5. --explain
  if (explain) {
    if (rerankResult) {
      console.log('\n' + auditWriter.formatExplain(rerankResult));
    } else {
      console.error(
        '\n--explain: no rationale to print (re-rank was skipped or failed).',
      );
    }
  }

  // 6. Write mapping + audit
  if (write) {
    writeMappingEntry(mappingPath, entry.slug, tiers);
    console.error(`Wrote mapping for "${entry.slug}" to ${mappingPath}`);

    if (rerankResult) {
      const auditPath = auditPathFor(mappingPath);
      auditWriter.writeAudit(auditPath, entry.slug, rerankResult);
      console.error(`Wrote audit for "${entry.slug}" to ${auditPath}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const config = await loadConfig(args.configPath);

  // 1. Fetch manifest once (shared by single-slug and batch).
  const resolvedEntries = await fetchManifestEntries(config);
  const slugToParent = buildSlugToParent(resolvedEntries);

  // 2. Set up reranker + cache (shared across iterations in batch mode).
  //
  // Default: AI re-ranker re-orders candidates by semantic judgment and
  // drops coincidental matches (single-token English-word collisions,
  // cross-schema property collisions). On API error / malformed output
  // / missing API key, the Reranker emits a stderr warning and the
  // orchestrator falls back to lexical-only output.
  let reranker: Reranker | null = null;
  if (args.rerank) {
    try {
      reranker = new Reranker(config.validator.rerankModel ?? config.validator.pass1Model, new Anthropic());
    } catch (err) {
      console.error(`AI re-rank failed: ${err instanceof Error ? err.message : String(err)}`);
      reranker = null;
    }
  }
  const cache = reranker ? new RerankCache() : null;
  const auditWriter = new AuditWriter();

  if (args.all) {
    await runBatch({ args, config, resolvedEntries, reranker, cache, auditWriter });
  } else {
    await runSingleSlug({
      args,
      config,
      resolvedEntries,
      slugToParent,
      reranker,
      cache,
      auditWriter,
    });
  }
}

async function runSingleSlug(opts: {
  args:             ReturnType<typeof parseArgs>;
  config:           Config;
  resolvedEntries:  ManifestEntry[];
  slugToParent:     Map<string, string | null>;
  reranker:         Reranker | null;
  cache:            RerankCache | null;
  auditWriter:      AuditWriter;
}): Promise<void> {
  const { args, config, resolvedEntries, slugToParent, reranker, cache, auditWriter } = opts;

  // Refuse ignored slugs early — the validator would never consult the entry
  // we'd generate, so emitting one silently masks the operator's `ignore`
  // declaration.
  const ignoreMatch = checkIgnored(args.slug, slugToParent, config.docSource.ignore);
  if (ignoreMatch.matched) {
    console.error(formatIgnoreRefusal(args.slug, args.configPath, ignoreMatch));
    process.exit(1);
  }

  const entry = resolvedEntries.find(e => e.slug === args.slug);
  if (!entry) {
    console.error(
      `Slug "${args.slug}" not found. Available: ${resolvedEntries.map(e => e.slug).join(', ')}`,
    );
    process.exit(1);
  }

  const { indexes, allFilesByRepo } = await buildIndexes(config);

  await processSlug({
    entry,
    indexes,
    allFilesByRepo,
    reranker,
    cache,
    write:       args.write,
    explain:     args.explain,
    mappingPath: config.mappingPath,
    auditWriter,
    emitJson:    true,
  });

  if (!args.write) {
    console.error(
      `\nReview the above and merge into ${config.mappingPath}, or re-run with --write`,
    );
  }
}

async function runBatch(opts: {
  args:            ReturnType<typeof parseArgs>;
  config:          Config;
  resolvedEntries: ManifestEntry[];
  reranker:        Reranker | null;
  cache:           RerankCache | null;
  auditWriter:     AuditWriter;
}): Promise<void> {
  const { args, config, resolvedEntries, reranker, cache, auditWriter } = opts;

  const existing = readExistingMapping(config.mappingPath);
  const existingSlugs = new Set(Object.keys(existing));

  const plan: BatchPlanItem[] = planBatch({
    entries:       resolvedEntries,
    parentSlug:    config.docSource.parentSlug,
    ignore:        config.docSource.ignore,
    existingSlugs,
    force:         args.force,
  });
  const total = plan.length;

  if (total === 0) {
    console.error('No in-scope, non-ignored manifest entries to map.');
    return;
  }

  console.error(`Found ${total} in-scope, non-ignored slug(s) to process.`);

  // Build symbol indexes once — buildSymbolIndex caches by commit SHA, so
  // multi-slug iteration reuses the index across calls.
  const { indexes, allFilesByRepo } = await buildIndexes(config);

  const byMappingSlug = new Map(resolvedEntries.map(e => [e.slug, e]));

  let i = 0;
  for (const item of plan) {
    i++;
    if (item.action === 'skip-already-mapped') {
      process.stderr.write(
        `[${i}/${total}] skipping "${item.slug}" (already mapped; use --force to re-map)\n`,
      );
      continue;
    }
    process.stderr.write(`[${i}/${total}] mapping "${item.slug}"...\n`);

    const entry = byMappingSlug.get(item.slug);
    if (!entry) {
      // Should not happen — planBatch derives from resolvedEntries.
      console.error(`  internal error: slug "${item.slug}" not found in manifest`);
      continue;
    }

    await processSlug({
      entry,
      indexes,
      allFilesByRepo,
      reranker,
      cache,
      write:       true,  // --all implies --write
      explain:     args.explain,
      mappingPath: config.mappingPath,
      auditWriter,
      emitJson:    false,
    });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
