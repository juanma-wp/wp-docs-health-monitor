import { afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { RunResults } from '../types/results.js';
import type { DashboardHistoryEntry } from '../dashboard/templates/shared.js';
import { SiteIdentitySchema } from '../types/site.js';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../');
const mockResultsPath = join(projectRoot, 'examples', 'mock-results.json');
const tsxCliPath = join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliPath = join(projectRoot, 'src', 'cli.ts');

const tempDirs: string[] = [];

async function loadMockResults(): Promise<RunResults> {
  const raw = JSON.parse(await readFile(mockResultsPath, 'utf-8'));
  return raw as RunResults;
}

async function runCli(resultsPath: string, outputDir: string): Promise<void> {
  await execFileAsync(process.execPath, [tsxCliPath, cliPath, '--results', resultsPath, '--output', outputDir], {
    cwd: projectRoot,
  });
}

afterAll(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
});

describe('cli dashboard generation', () => {
  it('refreshes archived dashboards with the latest history after multiple runs', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wp-docs-cli-'));
    tempDirs.push(tempDir);

    const outputDir = join(tempDir, 'site');
    const olderResultsPath = join(tempDir, 'older-results.json');
    const results = await loadMockResults();
    const olderResults: RunResults = {
      ...results,
      runId: '20240408-120000',
      timestamp: '2024-04-08T12:00:00.000Z',
    };

    await writeFile(olderResultsPath, JSON.stringify(olderResults, null, 2), 'utf-8');

    await runCli(olderResultsPath, outputDir);
    await runCli(mockResultsPath, outputDir);

    const archivedIndex = await readFile(join(outputDir, 'runs', olderResults.runId, 'index.html'), 'utf-8');
    expect(archivedIndex).toContain('2 total');
    expect(archivedIndex).toContain(results.runId);
    expect(archivedIndex).toContain('../../index.html');

    const history = JSON.parse(
      await readFile(join(outputDir, 'data', 'history.json'), 'utf-8'),
    ) as DashboardHistoryEntry[];
    const newest = history[history.length - 1];
    expect(newest.minorIssues).toBeTypeOf('number');
  });

  it('derives outputDir as <config.outputDir>/<slug> when --output is omitted', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wp-docs-cli-'));
    tempDirs.push(tempDir);

    const configPath = join(tempDir, 'my-handbook.json');
    const configFixture = {
      project: { name: 'My Handbook' },
      docSource: {
        type: 'manifest-url',
        manifestUrl: 'https://example.com/manifest.json',
        parentSlug: '*',
      },
      codeSources: {
        gutenberg: { type: 'git-clone', repoUrl: 'https://github.com/example/repo.git' },
      },
      mappingPath: 'mappings/test.json',
      outputDir: tempDir,
      validator: { type: 'claude' },
    };
    await writeFile(configPath, JSON.stringify(configFixture, null, 2), 'utf-8');

    await execFileAsync(process.execPath, [
      tsxCliPath, cliPath,
      '--config', configPath,
      '--results', mockResultsPath,
    ], { cwd: projectRoot });

    const derivedDir = join(tempDir, 'my-handbook');
    const siteJson = JSON.parse(
      await readFile(join(derivedDir, 'data', 'site.json'), 'utf-8'),
    );
    expect(siteJson.id).toBe('my-handbook');
    const dashboardHtml = await readFile(join(derivedDir, 'index.html'), 'utf-8');
    expect(dashboardHtml).toBeTruthy();
  });

  it('writes data/site.json from --config when supplied alongside --results', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wp-docs-cli-'));
    tempDirs.push(tempDir);

    const configPath = join(tempDir, 'my-handbook.json');
    const configFixture = {
      project: { name: 'My Handbook' },
      docSource: {
        type: 'manifest-url',
        manifestUrl: 'https://example.com/manifest.json',
        parentSlug: '*',
      },
      codeSources: {
        gutenberg: { type: 'git-clone', repoUrl: 'https://github.com/example/repo.git' },
      },
      mappingPath: 'mappings/test.json',
      outputDir: 'out',
      validator: { type: 'claude' },
    };
    await writeFile(configPath, JSON.stringify(configFixture, null, 2), 'utf-8');

    const outputDir = join(tempDir, 'site');
    await execFileAsync(process.execPath, [
      tsxCliPath, cliPath,
      '--config', configPath,
      '--results', mockResultsPath,
      '--output', outputDir,
    ], { cwd: projectRoot });

    const siteJson = JSON.parse(
      await readFile(join(outputDir, 'data', 'site.json'), 'utf-8'),
    );
    const parsed = SiteIdentitySchema.parse(siteJson);
    expect(parsed.id).toBe('my-handbook');
    expect(parsed.name).toBe('My Handbook');
  });
});
