import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { resolve, join, basename, dirname } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { RunResultsSchema, type RunResults } from '../src/types/results.js';
import { generate } from '../src/dashboard/generate.js';
import { renderLanding, type LandingEntry } from '../src/dashboard/landing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = join(projectRoot, 'dist');

function usage(): never {
  process.stderr.write(
    [
      'Usage: npm run publish:surge -- <run-path> [<run-path>...]',
      '',
      'Each <run-path> is a directory containing a results.json. For example:',
      '  npm run publish:surge -- out-block-editor/data/runs/20260522-150000 \\',
      '                           out-theme/data/runs/20260522-160000',
      '',
      'Environment:',
      '  SURGE_DOMAIN  Surge.sh domain to publish to (default: wp-docs-health-juanma.surge.sh)',
      '  SKIP_SURGE    If set, build dist/ but do not invoke surge (for local smoke testing).',
      '',
    ].join('\n'),
  );
  process.exit(2);
}

function listAvailableRuns(): string[] {
  const out: string[] = [];
  const entries = readdirSync(projectRoot, { withFileTypes: true });
  for (const dir of entries) {
    if (!dir.isDirectory()) continue;
    if (!/^out(-[a-z0-9-]+)?$/.test(dir.name)) continue;
    const runsBase = join(projectRoot, dir.name, 'data', 'runs');
    if (!existsSync(runsBase)) continue;
    for (const run of readdirSync(runsBase, { withFileTypes: true })) {
      if (run.isDirectory()) {
        out.push(join(dir.name, 'data', 'runs', run.name));
      }
    }
  }
  return out.sort();
}

async function loadRun(runPath: string): Promise<{ results: RunResults; siteLabel: string }> {
  const resolved = resolve(runPath);
  const resultsPath = join(resolved, 'results.json');
  if (!existsSync(resultsPath)) {
    const available = listAvailableRuns();
    process.stderr.write(`Error: results.json not found at ${resultsPath}\n\n`);
    if (available.length > 0) {
      process.stderr.write('Available runs under this project:\n');
      for (const p of available) process.stderr.write(`  ${p}\n`);
    }
    process.exit(1);
  }
  const raw = JSON.parse(await readFile(resultsPath, 'utf-8'));
  const parsed = RunResultsSchema.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write(`Invalid results.json at ${resultsPath}:\n${parsed.error.toString()}\n`);
    process.exit(1);
  }
  // Derive a site label from the parent "out-X" directory: out-block-editor → "block-editor"
  // resolved = .../out-block-editor/data/runs/<runId> → walk up 3 dirs to get the site folder
  const siteDirName = basename(dirname(dirname(dirname(resolved))));
  const siteLabel = siteDirName.startsWith('out-') ? siteDirName.slice(4) : siteDirName;
  return { results: parsed.data, siteLabel };
}

async function main(): Promise<void> {
  const runPaths = process.argv.slice(2);
  if (runPaths.length === 0) usage();

  const domain = process.env.SURGE_DOMAIN ?? 'wp-docs-health-juanma.surge.sh';
  const skipSurge = Boolean(process.env.SKIP_SURGE);

  await rm(distDir, { recursive: true, force: true });
  await mkdir(join(distDir, 'runs'), { recursive: true });

  const entries: LandingEntry[] = [];
  const seenRunIds = new Set<string>();

  for (const p of runPaths) {
    const { results, siteLabel } = await loadRun(p);
    if (seenRunIds.has(results.runId)) {
      process.stderr.write(`Error: duplicate runId "${results.runId}" — two runs share the same timestamp.\n`);
      process.exit(1);
    }
    seenRunIds.add(results.runId);

    const runDist = join(distDir, 'runs', results.runId);
    await generate(results, runDist);

    entries.push({
      runId: results.runId,
      timestamp: results.timestamp,
      overallHealth: results.overallHealth,
      commitSha: results.docs[0]?.commitSha,
      totals: results.totals,
      estimatedCostUsd: results.usage?.estimatedCostUsd,
      siteLabel,
      href: `runs/${results.runId}/index.html`,
    });
    process.stdout.write(`  built dist/runs/${results.runId}/  (${siteLabel}, health ${results.overallHealth})\n`);
  }

  const landingHtml = renderLanding(entries, {
    title: 'WordPress Docs Health Monitor',
    subtitle: 'Published runs',
  });
  await writeFile(join(distDir, 'index.html'), landingHtml, 'utf-8');
  process.stdout.write(`  built dist/index.html (${entries.length} run${entries.length === 1 ? '' : 's'})\n`);

  if (skipSurge) {
    process.stdout.write(`\nSKIP_SURGE set — dist/ built but not published. Smoke test with:\n  npx serve dist\n`);
    return;
  }

  process.stdout.write(`\nPublishing to https://${domain}/ ...\n`);
  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    const child = spawn('npx', ['surge', distDir, domain], { stdio: 'inherit' });
    child.on('error', rejectSpawn);
    child.on('exit', code => {
      if (code === 0) resolveSpawn();
      else rejectSpawn(new Error(`surge exited with code ${code}`));
    });
  });
}

main().catch(err => {
  process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
  process.exit(1);
});
