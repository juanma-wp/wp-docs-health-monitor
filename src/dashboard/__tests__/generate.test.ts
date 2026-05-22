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

describe('generate()', () => {
  it('creates expected HTML files', async () => {
    const results = await loadMockResults();
    await generateDashboard(results);

    const expectedFiles = [
      'index.html',
      'doc/block-metadata.html',
      'doc/block-registration.html',
      'doc/block-attributes.html',
      'doc/block-supports.html',
      'folder/block-api.html',
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(outDir, file)), `Expected ${file} to exist`).toBe(true);
    }
  });

  it('index.html contains block-metadata and overall health score', async () => {
    const results = await loadMockResults();
    await generateDashboard(results);
    const content = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(content).toContain('block-metadata');
    expect(content).toContain(String(results.overallHealth));
  });

  it('doc/block-metadata.html contains "healthy" and not "critical" as a status', async () => {
    const results = await loadMockResults();
    await generateDashboard(results);
    const content = await readFile(join(outDir, 'doc/block-metadata.html'), 'utf-8');
    expect(content).toContain('healthy');
    // block-metadata has no critical issues; status badge should not say critical
    expect(content).not.toMatch(/text-red-800[^<]*>critical/);
  });

  it('doc/block-attributes.html contains "critical" and at least one issue docSays text', async () => {
    const results = await loadMockResults();
    await generateDashboard(results);
    const content = await readFile(join(outDir, 'doc/block-attributes.html'), 'utf-8');
    expect(content).toContain('critical');
    const attrDoc = results.docs.find(d => d.slug === 'block-attributes');
    expect(attrDoc).toBeDefined();
    // The docSays text should appear (HTML-escaped) in the output
    // Use a segment from the text that contains no characters affected by HTML escaping
    expect(content).toContain('to store attribute values in post meta');
  });

  it('all generated files include the Tailwind CDN script', async () => {
    const results = await loadMockResults();
    await generateDashboard(results);
    const files = [
      'index.html',
      'doc/block-metadata.html',
      'doc/block-attributes.html',
      'folder/block-api.html',
    ];
    for (const file of files) {
      const content = await readFile(join(outDir, file), 'utf-8');
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
