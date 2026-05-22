#!/usr/bin/env node


import { program } from 'commander';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { loadConfig } from './config/loader.js';
import { runPipeline } from './pipeline.js';
import { RunResultsSchema, type RunResults } from './types/results.js';
import { generate } from './dashboard/generate.js';
import type { DashboardHistoryEntry } from './dashboard/templates/shared.js';

program
  .name('wp-docs-health-monitor')
  .description('Analyze WordPress documentation health against source code')
  .option('--config <path>', 'Path to config JSON file')
  .option('--output <dir>', 'Output directory for the dashboard')
  .option('--results <path>', 'Load RunResults from a JSON file instead of running the pipeline')
  .option('--dry-run', 'Print what would be analyzed without running the pipeline')
  .option('--slug <slug...>', 'Only validate the given doc slug(s); repeatable')
  .parse(process.argv);

const opts = program.opts<{
  config?: string;
  output?: string;
  results?: string;
  dryRun?: boolean;
  slug?: string[];
}>();

async function main(): Promise<void> {
  let results: RunResults;

  if (opts.results) {
    // Load results from file — no pipeline needed
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(resolve(opts.results), 'utf-8'));
    } catch (err) {
      process.stderr.write(`Error reading results file "${opts.results}": ${(err as Error).message}\n`);
      process.exit(1);
    }
    const parsed = RunResultsSchema.safeParse(raw);
    if (!parsed.success) {
      process.stderr.write(`Invalid results file "${opts.results}":\n${parsed.error.toString()}\n`);
      process.exit(1);
    }
    results = parsed.data;
  } else {
    if (!opts.config) {
      process.stderr.write('Error: --config is required when --results is not provided.\n');
      process.exit(1);
    }

    let config;
    try {
      config = await loadConfig(resolve(opts.config));
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`);
      process.exit(1);
    }

    if (opts.dryRun) {
      process.stdout.write(
        `Dry run: config loaded. Project: ${config.project.name}. Mapping: ${config.mappingPath}. Run without --dry-run to analyze docs.\n`,
      );
      process.exit(0);
    }

    results = await runPipeline(config, { slugs: opts.slug });
  }

  // Determine output directory
  if (!opts.output) {
    process.stderr.write('Error: --output is required.\n');
    process.exit(1);
  }
  const outputDir = resolve(opts.output);
  const currentHistoryEntry: DashboardHistoryEntry = {
    runId: results.runId,
    timestamp: results.timestamp,
    overallHealth: results.overallHealth,
    docCount: results.totals.docs,
    criticalIssues: results.totals.issues.critical,
    majorIssues: results.totals.issues.major,
    commitSha: results.docs[0]?.commitSha ?? '',
  };

  // Explicit guard: runId must match the expected format (digits + hyphen only, no path separators)
  if (!/^\d{8}-\d{6}$/.test(results.runId)) {
    process.stderr.write(`Error: runId "${results.runId}" contains unexpected characters.\n`);
    process.exit(1);
  }
  const runDir = join(outputDir, 'data', 'runs', results.runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'results.json'), JSON.stringify(results, null, 2), 'utf-8');

  // Update history.json
  const historyPath = join(outputDir, 'data', 'history.json');
  let history: DashboardHistoryEntry[] = [];
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(await readFile(historyPath, 'utf-8'));
    } catch {
      // start fresh if corrupted
      history = [];
    }
  }
  history = history.filter(entry => entry.runId !== results.runId);
  history.push(currentHistoryEntry);
  await mkdir(join(outputDir, 'data'), { recursive: true });
  await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');

  // Generate latest dashboard
  await generate(results, outputDir, { history, latestRunId: results.runId, mode: 'latest' });

  // Regenerate archived dashboards for all stored runs so every report can navigate the same history.
  for (const entry of history) {
    const archivedResultsPath = join(outputDir, 'data', 'runs', entry.runId, 'results.json');

    let archivedRaw: unknown;
    try {
      archivedRaw = JSON.parse(await readFile(archivedResultsPath, 'utf-8'));
    } catch (err) {
      process.stderr.write(`Warning: could not read archived results for "${entry.runId}": ${(err as Error).message}\n`);
      continue;
    }

    const archivedResults = RunResultsSchema.safeParse(archivedRaw);
    if (!archivedResults.success) {
      process.stderr.write(`Warning: archived results for "${entry.runId}" are invalid and were skipped.\n`);
      continue;
    }

    await generate(archivedResults.data, join(outputDir, 'runs', entry.runId), {
      history,
      latestRunId: results.runId,
      mode: 'run',
    });
  }

  process.stdout.write(`Dashboard written to ${join(outputDir, 'index.html')}\n`);
}

main().catch(err => {
  process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
  process.exit(1);
});
