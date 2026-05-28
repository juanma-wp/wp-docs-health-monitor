import { afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { RunResults } from '../types/results.js';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../');
const mockResultsPath = join(projectRoot, 'examples', 'mock-results.json');
const tsxCliPath = join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const rebuildScriptPath = join(projectRoot, 'scripts', 'rebuild.ts');

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
});

async function loadMockResults(): Promise<RunResults> {
  const raw = JSON.parse(await readFile(mockResultsPath, 'utf-8'));
  return raw as RunResults;
}

async function writeConfig(root: string, slug: string, name: string): Promise<void> {
  await mkdir(join(root, 'config'), { recursive: true });
  const config = {
    project: { name },
    docSource: {
      type: 'manifest-url',
      manifestUrl: 'https://example.com/manifest.json',
      parentSlug: '*',
    },
    codeSources: {
      example: { type: 'git-clone', repoUrl: 'https://github.com/example/repo.git' },
    },
    mappingPath: 'mappings/test.json',
    outputDir: 'out',
    validator: { type: 'claude' },
  };
  await writeFile(join(root, 'config', `${slug}.json`), JSON.stringify(config, null, 2), 'utf-8');
}

async function writeResults(root: string, slug: string, results: RunResults): Promise<void> {
  const runDir = join(root, 'out', slug, 'data', 'runs', results.runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'results.json'), JSON.stringify(results, null, 2), 'utf-8');
}

describe('rebuild script', () => {
  it('adds meta-index link on per-doc pages when rebuilding multiple sites', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wp-docs-rebuild-'));
    tempDirs.push(tempDir);

    const results = await loadMockResults();
    expect(results.docs.length).toBeGreaterThan(0);
    const docSlug = results.docs[0].slug;

    await writeConfig(tempDir, 'site-a', 'Site A');
    await writeConfig(tempDir, 'site-b', 'Site B');
    await writeResults(tempDir, 'site-a', results);
    await writeResults(tempDir, 'site-b', results);

    await execFileAsync(process.execPath, [tsxCliPath, rebuildScriptPath], { cwd: tempDir });

    const perDocPath = join(
      tempDir,
      'out',
      'site-a',
      'runs',
      results.runId,
      'doc',
      `${docSlug}.html`,
    );
    const content = await readFile(perDocPath, 'utf-8');
    expect(content).toContain('All sites');
    expect(content).toContain('../../../../index.html');
  });
});
