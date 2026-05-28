// Drop docs from existing results.json files that should be ignored per the
// current config, then recompute totals + overallHealth and rebuild dashboards.
// Useful when the config's ignore.slugs/ignore.subtrees has grown after some
// runs already landed in the dashboard.
//
// Usage:
//   npx tsx scripts/scrub-ignored-docs.ts <site-dir> <config-path>
// Example:
//   npx tsx scripts/scrub-ignored-docs.ts out/gutenberg-block-editor config/gutenberg-block-editor.json

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from '../src/config/loader.js';
import { RunResultsSchema, type RunResults, type DocResult } from '../src/types/results.js';
import { generate } from '../src/dashboard/generate.js';
import type { DashboardHistoryEntry } from '../src/dashboard/templates/shared.js';

function buildSlugToParent(docs: DocResult[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const d of docs) map.set(d.slug, d.parent ?? null);
  return map;
}

function isUnderSubtree(slug: string, subtrees: Set<string>, slugToParent: Map<string, string | null>): boolean {
  let cursor: string | null = slug;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (subtrees.has(cursor)) return true;
    seen.add(cursor);
    cursor = slugToParent.get(cursor) ?? null;
  }
  return false;
}

function recomputeTotals(docs: DocResult[]): RunResults['totals'] {
  const allIssues = docs.flatMap(d => d.issues);
  return {
    docs:           docs.length,
    healthy:        docs.filter(d => d.status === 'healthy').length,
    needsAttention: docs.filter(d => d.status === 'needs-attention').length,
    critical:       docs.filter(d => d.status === 'critical').length,
    notMapped:      docs.filter(d => d.status === 'not-mapped').length,
    analysisFailed: docs.filter(d => d.status === 'analysis-failed').length,
    issues: {
      total:    allIssues.length,
      critical: allIssues.filter(i => i.severity === 'critical').length,
      major:    allIssues.filter(i => i.severity === 'major').length,
      minor:    allIssues.filter(i => i.severity === 'minor').length,
    },
  };
}

function recomputeOverallHealth(docs: DocResult[]): number {
  const scoring = docs.filter(d => d.status !== 'not-mapped' && d.status !== 'analysis-failed');
  if (scoring.length === 0) return 100;
  const sum = scoring.reduce((acc, d) => acc + (d.healthScore ?? 0), 0);
  return Math.round(sum / scoring.length);
}

function entryFromResults(r: RunResults): DashboardHistoryEntry {
  return {
    runId: r.runId,
    timestamp: r.timestamp,
    overallHealth: r.overallHealth,
    docCount: r.totals.docs,
    criticalIssues: r.totals.issues.critical,
    majorIssues: r.totals.issues.major,
    minorIssues: r.totals.issues.minor,
    commitSha: r.docs[0]?.commitSha ?? '',
  };
}

async function main(): Promise<void> {
  const [, , siteArg, configArg] = process.argv;
  if (!siteArg || !configArg) {
    console.error('Usage: tsx scripts/scrub-ignored-docs.ts <site-dir> <config-path>');
    process.exit(1);
  }
  const siteDir = resolve(siteArg);
  const config = await loadConfig(resolve(configArg));
  const ignoreSlugs    = new Set(config.docSource.ignore?.slugs ?? []);
  const ignoreSubtrees = new Set(config.docSource.ignore?.subtrees ?? []);

  const runsRoot = join(siteDir, 'data', 'runs');
  if (!existsSync(runsRoot)) {
    console.error(`No data/runs found at ${runsRoot}`);
    process.exit(1);
  }

  const runIds = readdirSync(runsRoot).filter(name => /^\d{8}-\d{6}$/.test(name));
  const scrubbedRuns: RunResults[] = [];
  let totalRemoved = 0;

  for (const runId of runIds) {
    const path = join(runsRoot, runId, 'results.json');
    if (!existsSync(path)) continue;

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const parsed = RunResultsSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`Skipping ${runId}: invalid results.json (${parsed.error.message})`);
      continue;
    }
    const before = parsed.data;
    const slugToParent = buildSlugToParent(before.docs);
    const keptDocs = before.docs.filter(
      d => !ignoreSlugs.has(d.slug) && !isUnderSubtree(d.slug, ignoreSubtrees, slugToParent),
    );
    const removedCount = before.docs.length - keptDocs.length;

    if (removedCount === 0) {
      scrubbedRuns.push(before);
      continue;
    }

    const removedSlugs = before.docs
      .filter(d => !keptDocs.includes(d))
      .map(d => d.slug);

    const after: RunResults = {
      ...before,
      docs: keptDocs,
      totals: recomputeTotals(keptDocs),
      overallHealth: recomputeOverallHealth(keptDocs),
    };

    // Validate the rebuilt object against the schema before writing.
    RunResultsSchema.parse(after);

    writeFileSync(path, JSON.stringify(after, null, 2) + '\n', 'utf-8');
    console.log(`${runId}: removed ${removedCount} doc(s): ${removedSlugs.join(', ')}`);
    scrubbedRuns.push(after);
    totalRemoved += removedCount;
  }

  if (totalRemoved === 0) {
    console.log('Nothing to scrub.');
    return;
  }

  // Rebuild history.json from the scrubbed results.
  const history: DashboardHistoryEntry[] = scrubbedRuns
    .map(entryFromResults)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const histPath = join(siteDir, 'data', 'history.json');
  writeFileSync(histPath, JSON.stringify(history, null, 2) + '\n', 'utf-8');

  const latest = history[history.length - 1];
  const latestResults = scrubbedRuns.find(r => r.runId === latest.runId);
  if (!latestResults) throw new Error('Latest results not found after scrub');

  // Rebuild dashboards.
  const metaIndexAvailable = existsSync(join(siteDir, '..', 'index.html'));
  await generate(latestResults, siteDir, {
    history,
    latestRunId: latest.runId,
    mode: 'latest',
    siteName: config.project.name,
    metaIndexAvailable,
  });
  for (const r of scrubbedRuns) {
    await generate(r, join(siteDir, 'runs', r.runId), {
      history,
      latestRunId: latest.runId,
      mode: 'run',
      siteName: config.project.name,
      metaIndexAvailable,
    });
  }

  console.log(`Scrubbed ${totalRemoved} doc(s) across ${runIds.length} run(s). Dashboards rebuilt.`);
}

main().catch(err => { console.error(err); process.exit(1); });
