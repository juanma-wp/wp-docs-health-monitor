import { describe, it, expect, afterAll } from 'vitest';
import { readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generate, type GenerateDashboardOptions } from '../generate.js';
import type { RunResults } from '../../types/results.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../../');
const mockResultsPath = join(projectRoot, 'examples', 'mock-results.json');

// Use a project-relative output dir instead of /tmp
const outDir = join(projectRoot, `out-test-${Math.random().toString(36).slice(2, 9)}`);

async function loadMockResults(): Promise<RunResults> {
  const raw = JSON.parse(await readFile(mockResultsPath, 'utf-8'));
  return raw as RunResults;
}

async function generateDashboard(results: RunResults, outputPath = outDir, options: GenerateDashboardOptions = {}): Promise<void> {
  await generate(results, outputPath, options);
}

afterAll(async () => {
  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true });
  }
});

// generate() in mode='latest' writes only the root index.html. The per-doc
// and per-folder pages for the latest run come from the archived-run loop
// (cli.ts) which calls generate() with mode='run' for every history entry
// including the latest. Tests replicate that two-step pattern.
async function generateLatestAndArchived(results: RunResults, dir = outDir): Promise<void> {
  await generate(results, dir, { latestRunId: results.runId, mode: 'latest' });
  await generate(results, join(dir, 'runs', results.runId), { latestRunId: results.runId, mode: 'run' });
}

const archivedRunDir = (results: RunResults): string => join(outDir, 'runs', results.runId);

describe('generate()', () => {
  it('creates expected HTML files', async () => {
    const results = await loadMockResults();
    await generateLatestAndArchived(results);

    expect(existsSync(join(outDir, 'index.html')), 'expected root index.html').toBe(true);
    const runDir = archivedRunDir(results);
    const expectedRunFiles = [
      'index.html',
      'doc/block-metadata.html',
      'doc/block-registration.html',
      'doc/block-attributes.html',
      'doc/block-supports.html',
      'folder/block-api.html',
    ];
    for (const file of expectedRunFiles) {
      expect(existsSync(join(runDir, file)), `Expected runs/<id>/${file} to exist`).toBe(true);
    }

    // doc/ and folder/ must NOT exist at site root — the latest's links point
    // into runs/<latestId>/ instead.
    expect(existsSync(join(outDir, 'doc')), 'root-level doc/ should not exist').toBe(false);
    expect(existsSync(join(outDir, 'folder')), 'root-level folder/ should not exist').toBe(false);
  });

  it('index.html contains block-metadata and overall health score', async () => {
    const results = await loadMockResults();
    await generateLatestAndArchived(results);
    const content = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(content).toContain('block-metadata');
    expect(content).toContain(String(results.overallHealth));
  });

  it('root index.html links into runs/<latestId>/doc and folder', async () => {
    const results = await loadMockResults();
    await generateLatestAndArchived(results);
    const content = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(content).toContain(`runs/${results.runId}/doc/`);
    expect(content).toContain(`runs/${results.runId}/folder/`);
  });

  it('per-doc page (under runs/<id>/doc/) contains "healthy" and not "critical" as a status', async () => {
    const results = await loadMockResults();
    await generateLatestAndArchived(results);
    const content = await readFile(join(archivedRunDir(results), 'doc/block-metadata.html'), 'utf-8');
    expect(content).toContain('healthy');
    // block-metadata has no critical issues; status badge should not say critical
    expect(content).not.toMatch(/text-red-800[^<]*>critical/);
  });

  it('per-doc page (under runs/<id>/doc/) contains "critical" and at least one issue docSays text', async () => {
    const results = await loadMockResults();
    await generateLatestAndArchived(results);
    const content = await readFile(join(archivedRunDir(results), 'doc/block-attributes.html'), 'utf-8');
    expect(content).toContain('critical');
    const attrDoc = results.docs.find(d => d.slug === 'block-attributes');
    expect(attrDoc).toBeDefined();
    expect(content).toContain('to store attribute values in post meta');
  });

  it('per-doc page links back to the latest dashboard home', async () => {
    const results = await loadMockResults();
    await generateLatestAndArchived(results);
    const content = await readFile(join(archivedRunDir(results), 'doc/block-metadata.html'), 'utf-8');
    expect(content).toContain('href="../../../index.html"');
    expect(content).toContain('Go to latest dashboard');
  });

  it('all generated files include the Tailwind CDN script', async () => {
    const results = await loadMockResults();
    await generateLatestAndArchived(results);
    const runDir = archivedRunDir(results);
    const files = [
      join(outDir, 'index.html'),
      join(runDir, 'doc/block-metadata.html'),
      join(runDir, 'doc/block-attributes.html'),
      join(runDir, 'folder/block-api.html'),
    ];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      expect(content, `${file} should include Tailwind CDN`).toContain(
        '<script src="https://cdn.tailwindcss.com"></script>',
      );
    }
  });

  it('renders run history links and archived dashboards for previous reports', async () => {
    const results = await loadMockResults();
    const olderResults: RunResults = {
      ...results,
      runId: '20240408-120000',
      timestamp: '2024-04-08T12:00:00.000Z',
    };

    await generateDashboard(results, outDir, {
      history: [
        {
          runId: olderResults.runId,
          timestamp: olderResults.timestamp,
          overallHealth: olderResults.overallHealth,
          docCount: olderResults.totals.docs,
          criticalIssues: olderResults.totals.issues.critical,
          majorIssues: olderResults.totals.issues.major,
          commitSha: olderResults.docs[0]?.commitSha,
        },
      ],
      latestRunId: results.runId,
      mode: 'latest',
    });

    const latestIndex = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(latestIndex).toContain(`runs/${olderResults.runId}/index.html`);

    const archivedOutDir = join(outDir, 'runs', olderResults.runId);
    await generateDashboard(olderResults, archivedOutDir, {
      history: [
        {
          runId: results.runId,
          timestamp: results.timestamp,
          overallHealth: results.overallHealth,
          docCount: results.totals.docs,
          criticalIssues: results.totals.issues.critical,
          majorIssues: results.totals.issues.major,
          commitSha: results.docs[0]?.commitSha,
        },
      ],
      latestRunId: results.runId,
      mode: 'run',
    });

    const archivedIndex = await readFile(join(archivedOutDir, 'index.html'), 'utf-8');
    expect(archivedIndex).toContain('../../index.html');
  });

  it('renders an empty state when a run has no docs', async () => {
    const results = await loadMockResults();
    const emptyResults: RunResults = {
      ...results,
      totals: {
        docs: 0,
        healthy: 0,
        needsAttention: 0,
        critical: 0,
        notMapped: 0,
        analysisFailed: 0,
        issues: {
          total: 0,
          critical: 0,
          major: 0,
          minor: 0,
        },
      },
      docs: [],
    };

    await generateDashboard(emptyResults);

    const content = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(content).toContain('No documents were analyzed in this run.');
  });
});
