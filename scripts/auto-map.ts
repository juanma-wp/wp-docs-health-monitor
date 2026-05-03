/**
 * auto-map.ts — AI-free mapping bootstrap using symbol index + tree heuristics
 *
 * Usage:
 *   npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write]
 *
 * Builds a symbol index of all configured repos (cached by commit SHA),
 * cross-references the symbols named in the doc, and proposes a CodeTiers
 * mapping ranked by symbol coverage.
 *
 * Unlike bootstrap-mapping.ts, requires no ANTHROPIC_API_KEY.
 *
 * Flags:
 *   --config <path>   Config file (default: config/gutenberg-block-api.json)
 *   --write           Write result directly into the project mapping file
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from '../src/config/loader.js';
import { createCodeSources } from '../src/adapters/index.js';
import { ManifestEntrySchema, CodeTiersSchema, MappingSchema } from '../src/types/mapping.js';
import { extractDocSymbols } from '../src/adapters/validator/context-assembler.js';
import {
  buildSymbolIndex,
  scoreFilesAcrossRepos,
  findFilesByTreeHeuristic,
  type SymbolIndex,
} from '../src/indexer/symbol-index.js';

function parseArgs(argv: string[]): { slug: string; configPath: string; write: boolean } {
  const args = argv.slice(2);
  let slug = '';
  let configPath = resolve('config/gutenberg-block-api.json');
  let write = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--write') {
      write = true;
    } else if (!slug && !args[i].startsWith('--')) {
      slug = args[i];
    }
  }

  if (!slug) {
    console.error('Usage: npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write]');
    process.exit(1);
  }

  return { slug, configPath, write };
}

async function main() {
  const { slug, configPath, write } = parseArgs(process.argv);
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

  console.error('\nTop matches by symbol coverage:');
  scored.slice(0, 10).forEach(f =>
    console.error(
      `  [${f.repo}] ${f.path}  score=${f.score}  (${f.matchedSymbols.slice(0, 5).join(', ')})`,
    ),
  );

  // 5. Assemble tiers
  //    primary   — top symbol-matched files (max 3)
  //    secondary — next best symbol-matched files (max 5)
  //    context   — structurally related files via slug keyword matching (max 8)
  const selected = new Set<string>();

  function pickNext(n: number) {
    return scored
      .filter(f => !selected.has(`${f.repo}:${f.path}`))
      .slice(0, n)
      .map(f => {
        selected.add(`${f.repo}:${f.path}`);
        return { repo: f.repo, path: f.path };
      });
  }

  const primary = pickNext(3);
  const secondary = pickNext(5);

  const contextCandidates = findFilesByTreeHeuristic(slug, allFilesByRepo, selected);
  const context = contextCandidates.slice(0, 8).map(f => {
    selected.add(`${f.repo}:${f.path}`);
    return { repo: f.repo, path: f.path };
  });

  const tiers = CodeTiersSchema.parse({ primary, secondary, context });

  // 6. Output as JSON
  const output = { [slug]: tiers };
  console.log(JSON.stringify(output, null, 2));

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
