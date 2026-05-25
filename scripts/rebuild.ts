// Rebuild every per-site dashboard + the cross-site meta-index from
// committed results.json files. Idempotent. Used by CI before deploying to
// GitHub Pages, and runnable locally to regenerate HTML at any time.
//
// Inputs (all committed):
//   out/<site-slug>/data/runs/<runId>/results.json   one per validator run
//   config/<site-slug>.json                          per-site config (project.name)
//
// Outputs (all derived; gitignored):
//   out/<site-slug>/index.html                       latest run dashboard
//   out/<site-slug>/runs/<runId>/index.html          archived run dashboards
//   out/<site-slug>/runs/<runId>/{doc,folder}/*.html doc + folder detail pages
//   out/<site-slug>/data/history.json                derived run-list
//   out/<site-slug>/data/site.json                   identity (id + name + lastUpdated)
//   out/sites.json                                   meta-index registry
//   out/index.html                                   meta-index landing page
//
// Usage:
//   npx tsx scripts/rebuild.ts

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadConfig } from '../src/config/loader.js';
import { RunResultsSchema, type RunResults } from '../src/types/results.js';
import { generate } from '../src/dashboard/generate.js';
import { renderMetaIndex } from '../src/dashboard/meta.js';
import { SiteRegistrySchema, type SiteRegistry } from '../src/types/meta.js';
import { SiteIdentitySchema, type SiteIdentity } from '../src/types/site.js';
import type { DashboardHistoryEntry } from '../src/dashboard/templates/shared.js';

const OUT_ROOT   = 'out';
const CONFIG_DIR = 'config';

function entryFromResults(r: RunResults): DashboardHistoryEntry {
  return {
    runId:          r.runId,
    timestamp:      r.timestamp,
    overallHealth:  r.overallHealth,
    docCount:       r.totals.docs,
    criticalIssues: r.totals.issues.critical,
    majorIssues:    r.totals.issues.major,
    minorIssues:    r.totals.issues.minor,
    commitSha:      r.docs[0]?.commitSha ?? '',
  };
}

type RebuiltSite = { id: string; name: string; dir: string };

async function rebuildSite(configPath: string): Promise<RebuiltSite | null> {
  const id      = basename(configPath, '.json');
  const siteDir = join(OUT_ROOT, id);
  const runsDir = join(siteDir, 'data', 'runs');

  if (!existsSync(runsDir)) {
    console.log(`  skip ${id}: no ${runsDir}`);
    return null;
  }

  const config = await loadConfig(configPath);

  const runIds = readdirSync(runsDir).filter(n => /^\d{8}-\d{6}$/.test(n));
  const allResults: RunResults[] = [];
  for (const runId of runIds) {
    const path = join(runsDir, runId, 'results.json');
    if (!existsSync(path)) continue;
    const parsed = RunResultsSchema.safeParse(JSON.parse(readFileSync(path, 'utf-8')));
    if (!parsed.success) {
      console.warn(`  warn ${id}/${runId}: invalid results.json — skipping`);
      continue;
    }
    allResults.push(parsed.data);
  }

  if (allResults.length === 0) {
    console.log(`  skip ${id}: no valid results`);
    return null;
  }

  // Sort ascending by timestamp so the latest is at the end.
  allResults.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest  = allResults[allResults.length - 1];
  const history = allResults.map(entryFromResults);

  mkdirSync(join(siteDir, 'data'), { recursive: true });

  writeFileSync(
    join(siteDir, 'data', 'history.json'),
    JSON.stringify(history, null, 2),
    'utf-8',
  );

  const siteIdentity: SiteIdentity = {
    id,
    name:        config.project.name,
    lastUpdated: latest.timestamp,
  };
  SiteIdentitySchema.parse(siteIdentity);
  writeFileSync(
    join(siteDir, 'data', 'site.json'),
    JSON.stringify(siteIdentity, null, 2),
    'utf-8',
  );

  // Latest dashboard at <site>/index.html — its per-doc/folder links point
  // into runs/<latestId>/ where those files actually live.
  await generate(latest, siteDir, {
    history,
    latestRunId: latest.runId,
    mode:        'latest',
    siteName:    config.project.name,
  });

  // Archived run dashboards (one per history entry). The mode='run' generate
  // call writes runs/<id>/index.html plus runs/<id>/doc + runs/<id>/folder.
  for (const r of allResults) {
    await generate(r, join(siteDir, 'runs', r.runId), {
      history,
      latestRunId: latest.runId,
      mode:        'run',
      siteName:    config.project.name,
    });
  }

  console.log(`  ok   ${id}: ${allResults.length} run(s), latest ${latest.runId}`);
  return { id, name: config.project.name, dir: id };
}

function loadHistory(siteId: string): DashboardHistoryEntry[] | undefined {
  const path = join(OUT_ROOT, siteId, 'data', 'history.json');
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf-8')) as DashboardHistoryEntry[];
}

async function main(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    throw new Error(`No ${CONFIG_DIR}/ directory found`);
  }
  const configs = readdirSync(CONFIG_DIR)
    .filter(f => f.endsWith('.json') && !f.endsWith('.dev.json'))
    .map(f => join(CONFIG_DIR, f));

  console.log(`Rebuilding ${configs.length} site dashboard(s)...`);

  const sites: RebuiltSite[] = [];
  for (const configPath of configs) {
    const site = await rebuildSite(configPath);
    if (site) sites.push(site);
  }

  if (sites.length === 0) {
    console.log('No sites rebuilt; skipping meta-index.');
    return;
  }

  // Cross-site meta-index.
  const registry: SiteRegistry = {
    generatedAt: new Date().toISOString(),
    sites:       sites.map(s => ({ id: s.id, name: s.name, dir: s.dir })),
  };
  SiteRegistrySchema.parse(registry);

  const histories = new Map<string, DashboardHistoryEntry[] | undefined>();
  for (const s of sites) histories.set(s.id, loadHistory(s.id));

  mkdirSync(OUT_ROOT, { recursive: true });
  writeFileSync(join(OUT_ROOT, 'sites.json'), JSON.stringify(registry, null, 2), 'utf-8');
  writeFileSync(join(OUT_ROOT, 'index.html'), renderMetaIndex(registry, histories), 'utf-8');

  console.log(`Meta-index written to ${join(OUT_ROOT, 'index.html')}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
