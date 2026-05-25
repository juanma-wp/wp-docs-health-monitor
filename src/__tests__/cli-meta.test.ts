import { afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { DashboardHistoryEntry } from '../dashboard/templates/shared.js';
import type { SiteIdentity } from '../types/site.js';
import { SiteRegistrySchema } from '../types/meta.js';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../');
const tsxCliPath = join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const metaCliPath = join(projectRoot, 'src', 'cli-meta.ts');

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
});

async function setupSite(
  root: string,
  dirName: string,
  identity: SiteIdentity | null,
  history: DashboardHistoryEntry[],
): Promise<string> {
  const siteDir = join(root, dirName);
  await mkdir(join(siteDir, 'data'), { recursive: true });
  if (identity) {
    await writeFile(join(siteDir, 'data', 'site.json'), JSON.stringify(identity, null, 2), 'utf-8');
  }
  await writeFile(join(siteDir, 'data', 'history.json'), JSON.stringify(history, null, 2), 'utf-8');
  return siteDir;
}

describe('cli-meta', () => {
  it('renders index.html with both sites, latest run scores, and sites.json registry', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wp-docs-meta-'));
    tempDirs.push(tempDir);

    const siteA = await setupSite(tempDir, 'out-block-editor',
      { id: 'block-editor', name: 'Block Editor Handbook', lastUpdated: '2026-05-22T18:47:02.000Z' },
      [{
        runId: '20260522-184702',
        timestamp: '2026-05-22T18:47:02.000Z',
        overallHealth: 99,
        docCount: 87,
        criticalIssues: 1,
        majorIssues: 12,
        minorIssues: 7,
      }],
    );

    const siteB = await setupSite(tempDir, 'out-theme',
      { id: 'wp-theme-handbook', name: 'Theme Handbook', lastUpdated: '2026-05-22T19:00:04.000Z' },
      [{
        runId: '20260522-190004',
        timestamp: '2026-05-22T19:00:04.000Z',
        overallHealth: 98,
        docCount: 70,
        criticalIssues: 1,
        majorIssues: 16,
        minorIssues: 7,
      }],
    );

    const outputDir = join(tempDir, 'meta-out');

    await execFileAsync(process.execPath, [
      tsxCliPath, metaCliPath,
      '--site', siteA,
      '--site', siteB,
      '--output', outputDir,
    ], { cwd: projectRoot });

    const html = await readFile(join(outputDir, 'index.html'), 'utf-8');
    expect(html).toContain('Block Editor Handbook');
    expect(html).toContain('Theme Handbook');
    expect(html).toContain('20260522-184702');
    expect(html).toContain('20260522-190004');
    expect(html).toContain('87 docs');
    expect(html).toContain('70 docs');

    const registry = SiteRegistrySchema.parse(
      JSON.parse(await readFile(join(outputDir, 'sites.json'), 'utf-8')),
    );
    expect(registry.sites).toHaveLength(2);
    expect(registry.sites.map(s => s.id).sort()).toEqual(['block-editor', 'wp-theme-handbook']);
  });

  it('falls back to dir basename when data/site.json is missing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wp-docs-meta-'));
    tempDirs.push(tempDir);

    const siteDir = await setupSite(tempDir, 'legacy-site', null, [{
      runId: '20260101-000000',
      timestamp: '2026-01-01T00:00:00.000Z',
      overallHealth: 91,
    }]);

    const outputDir = join(tempDir, 'meta-out');
    await execFileAsync(process.execPath, [
      tsxCliPath, metaCliPath,
      '--site', siteDir,
      '--output', outputDir,
    ], { cwd: projectRoot });

    const html = await readFile(join(outputDir, 'index.html'), 'utf-8');
    expect(html).toContain('legacy-site');
    expect(html).toContain('20260101-000000');

    const registry = SiteRegistrySchema.parse(
      JSON.parse(await readFile(join(outputDir, 'sites.json'), 'utf-8')),
    );
    expect(registry.sites[0].id).toBe('legacy-site');
    expect(registry.sites[0].name).toBe('legacy-site');
  });

  it('exits non-zero when --site is missing', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'wp-docs-meta-'));
    tempDirs.push(tempDir);

    await expect(
      execFileAsync(process.execPath, [
        tsxCliPath, metaCliPath,
        '--output', join(tempDir, 'out'),
      ], { cwd: projectRoot }),
    ).rejects.toThrow();
  });
});
