/**
 * auto-map.ts — mapping bootstrap using symbol index + tree heuristics +
 * (optional) AI re-ranker.
 *
 * Usage:
 *   npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write] [--no-rerank] [--explain]
 *
 * Builds a symbol index of all configured repos (cached by commit SHA),
 * cross-references the symbols named in the doc, and proposes a CodeTiers
 * mapping ranked by symbol coverage. By default, the lexical top-N is then
 * passed to an AI re-ranker that re-orders the candidates by semantic
 * judgment and drops coincidental matches; `--no-rerank` skips this step
 * and reproduces the pre-rerank lexical-only output.
 *
 * Flags:
 *   --config <path>   Config file (default: config/gutenberg-block-api.json)
 *   --write           Write the canonical mapping AND the audit file (when re-rank ran)
 *   --no-rerank       Skip the AI re-ranker (lexical-only output, no audit)
 *   --explain         Print rationale per kept file and reason per dropped file to stdout
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config/loader.js';
import { createCodeSources } from '../src/adapters/index.js';
import { ManifestEntrySchema, MappingSchema } from '../src/types/mapping.js';
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

function parseArgs(argv: string[]): {
  slug: string;
  configPath: string;
  write: boolean;
  rerank: boolean;
  explain: boolean;
} {
  const args = argv.slice(2);
  let slug = '';
  let configPath = resolve('config/gutenberg-block-api.json');
  let write = false;
  let rerank = true;
  let explain = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--write') {
      write = true;
    } else if (args[i] === '--no-rerank') {
      rerank = false;
    } else if (args[i] === '--explain') {
      explain = true;
    } else if (!slug && !args[i].startsWith('--')) {
      slug = args[i];
    }
  }

  if (!slug) {
    console.error('Usage: npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write] [--no-rerank] [--explain]');
    process.exit(1);
  }

  return { slug, configPath, write, rerank, explain };
}

async function main() {
  const { slug, configPath, write, rerank, explain } = parseArgs(process.argv);
  const config = await loadConfig(configPath);

  // 1. Fetch manifest and locate the entry for this slug
  const manifestRes = await fetch(config.docSource.manifestUrl);
  if (!manifestRes.ok) {
    console.error(`Failed to fetch manifest: HTTP ${manifestRes.status}`);
    process.exit(1);
  }

  const rawEntries = (await manifestRes.json()) as unknown[];
  const resolvedEntries = rawEntries.flatMap((raw: unknown) => {
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

  const entry = resolvedEntries.find(e => e.slug === slug);
  if (!entry) {
    console.error(
      `Slug "${slug}" not found. Available: ${resolvedEntries.map(e => e.slug).join(', ')}`,
    );
    process.exit(1);
  }

  // 2. Fetch doc content and extract referenced symbols
  const docRes = await fetch(entry.markdown_source);
  if (!docRes.ok) {
    console.error(`Failed to fetch doc: HTTP ${docRes.status}`);
    process.exit(1);
  }
  const docContent = await docRes.text();
  const docSymbols = extractDocSymbols(docContent);

  console.error(
    `Found ${docSymbols.length} symbols in doc: ${docSymbols.slice(0, 10).join(', ')}${docSymbols.length > 10 ? '...' : ''}`,
  );

  // 3. Build symbol indexes for all configured repos (cached by commit SHA)
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

  // 4. Score all files by how many doc symbols they define or fire
  const scored = scoreFilesAcrossRepos(docSymbols, indexes);

  console.error('\nTop matches by symbol coverage (IDF-weighted, file-weighted):');
  scored.slice(0, 10).forEach(f =>
    console.error(
      `  [${f.repo}] ${f.path}  score=${f.score.toFixed(2)}  (${f.matchedSymbols.slice(0, 5).join(', ')})`,
    ),
  );

  // 5. Re-rank (optional) and assemble tiers.
  //
  // Default: AI re-ranker re-orders candidates by semantic judgment and
  // drops coincidental matches (single-token English-word collisions,
  // cross-schema property collisions). On API error / malformed output
  // / missing API key, the Reranker emits a stderr warning and the
  // orchestrator falls back to lexical-only output.
  //
  // `--no-rerank` skips the AI step entirely. Output is bit-identical to
  // the pre-rerank lexical-only path.
  let reranker: Reranker | null = null;
  if (rerank) {
    try {
      reranker = new Reranker(config.validator.pass1Model, new Anthropic());
    } catch (err) {
      console.error(`AI re-rank failed: ${err instanceof Error ? err.message : String(err)}`);
      reranker = null;
    }
  }

  // Cache is always on when re-rank is on (no `--no-cache` flag — cost is
  // negligible and identical re-runs should be free + bit-identical).
  const cache = reranker ? new RerankCache() : null;

  const { tiers, rerankResult } = await buildTiersForSlug({
    docContent,
    slug,
    scored,
    allFilesByRepo,
    reranker,
    cache,
  });

  // 6. Output as JSON
  const output = { [slug]: tiers };
  console.log(JSON.stringify(output, null, 2));

  // 7. --explain: render rationale per kept file and reason per dropped file.
  // Has no effect under --no-rerank or when the AI step failed (no audit
  // material). The Reranker has already emitted a stderr warning in those
  // cases.
  const auditWriter = new AuditWriter();
  if (explain) {
    if (rerankResult) {
      console.log('\n' + auditWriter.formatExplain(rerankResult));
    } else {
      console.error(
        '\n--explain: no rationale to print (re-rank was skipped or failed).',
      );
    }
  }

  if (write) {
    let existing: Record<string, unknown> = {};
    if (existsSync(config.mappingPath)) {
      existing = MappingSchema.parse(
        JSON.parse(readFileSync(config.mappingPath, 'utf-8')),
      );
    }
    if (slug in existing) {
      process.stderr.write(
        `\nWarning: mapping for "${slug}" already exists and will be overwritten.\n`,
      );
    }
    const merged = { ...existing, ...output };
    writeFileSync(config.mappingPath, JSON.stringify(merged, null, 2) + '\n');
    console.error(`\nWrote mapping for "${slug}" to ${config.mappingPath}`);

    // Audit is the side channel of the AI re-ranker. It is written iff
    // re-rank ran AND succeeded (rerankResult !== null). --no-rerank leaves
    // any existing audit untouched.
    if (rerankResult) {
      const auditPath = auditPathFor(config.mappingPath);
      auditWriter.writeAudit(auditPath, slug, rerankResult);
      console.error(`Wrote audit for "${slug}" to ${auditPath}`);
    }
  } else {
    console.error(
      `\nReview the above and merge into ${config.mappingPath}, or re-run with --write`,
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
