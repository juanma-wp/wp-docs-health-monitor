#!/usr/bin/env node

import { program } from 'commander';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { basename, relative, resolve, join } from 'path';
import { SiteIdentitySchema, type SiteIdentity } from './types/site.js';
import { SiteRegistrySchema, type SiteRegistry } from './types/meta.js';
import { renderMetaIndex } from './dashboard/meta.js';
import type { DashboardHistoryEntry } from './dashboard/templates/shared.js';

program
  .name('wp-docs-health-monitor-index')
  .description('Aggregate multiple per-site dashboards into a single cross-site index')
  .option('--site <dir...>', 'Per-site dashboard output directories; repeatable')
  .option('--output <dir>', 'Where to write the meta-index (index.html + sites.json)')
  .parse(process.argv);

const opts = program.opts<{
  site?: string[];
  output?: string;
}>();

async function readSiteIdentity(siteDir: string): Promise<SiteIdentity | null> {
  const path = join(siteDir, 'data', 'site.json');
  try {
    const raw = JSON.parse(await readFile(path, 'utf-8'));
    const parsed = SiteIdentitySchema.safeParse(raw);
    if (!parsed.success) {
      process.stderr.write(`Warning: invalid data/site.json at "${siteDir}" — falling back to dir basename.\n`);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

async function readHistory(siteDir: string): Promise<DashboardHistoryEntry[] | undefined> {
  const path = join(siteDir, 'data', 'history.json');
  try {
    const raw = JSON.parse(await readFile(path, 'utf-8'));
    if (!Array.isArray(raw)) {
      process.stderr.write(`Warning: data/history.json at "${siteDir}" is not an array.\n`);
      return undefined;
    }
    return raw as DashboardHistoryEntry[];
  } catch (err) {
    process.stderr.write(`Warning: could not read data/history.json at "${siteDir}": ${(err as Error).message}\n`);
    return undefined;
  }
}

async function main(): Promise<void> {
  if (!opts.site || opts.site.length === 0) {
    process.stderr.write('Error: at least one --site <dir> is required.\n');
    process.exit(1);
  }
  if (!opts.output) {
    process.stderr.write('Error: --output is required.\n');
    process.exit(1);
  }

  const outputDir = resolve(opts.output);
  const siteDirs  = opts.site.map(d => resolve(d));

  const entries: SiteRegistry['sites'] = [];
  const histories = new Map<string, DashboardHistoryEntry[] | undefined>();

  for (const siteDir of siteDirs) {
    const identity = await readSiteIdentity(siteDir);
    const id   = identity?.id   ?? basename(siteDir);
    const name = identity?.name ?? basename(siteDir);
    const dir  = relative(outputDir, siteDir) || '.';

    entries.push({ id, name, dir });
    histories.set(id, await readHistory(siteDir));
  }

  const registry: SiteRegistry = {
    generatedAt: new Date().toISOString(),
    sites: entries,
  };

  // Validate the registry we're about to write — catches accidental shape drift.
  SiteRegistrySchema.parse(registry);

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'sites.json'), JSON.stringify(registry, null, 2), 'utf-8');
  await writeFile(join(outputDir, 'index.html'), renderMetaIndex(registry, histories), 'utf-8');

  process.stdout.write(`Meta-index written to ${join(outputDir, 'index.html')}\n`);
}

main().catch(err => {
  process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
  process.exit(1);
});
