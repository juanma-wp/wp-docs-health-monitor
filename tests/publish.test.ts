import { afterAll, describe, expect, it } from 'vitest';
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../');
const tempDirs: string[] = [];

type RunHistoryEntry = {
  runId: string;
  timestamp: string;
  overallHealth: number;
};

type WriteOutOptions = {
  history: RunHistoryEntry[];
  resultBodies: Record<string, object>;
  htmlLabel: string;
  runDashboards?: Record<string, string>;
};

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

async function createRepoFixture(): Promise<{ repoDir: string; remoteDir: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), 'publish-script-test-'));
  tempDirs.push(tempDir);

  const remoteDir = join(tempDir, 'origin.git');
  const repoDir = join(tempDir, 'repo');
  const scriptsDir = join(repoDir, 'scripts');

  git(tempDir, ['init', '--bare', remoteDir]);
  git(tempDir, ['init', '-b', 'main', repoDir]);

  git(repoDir, ['config', 'user.name', 'Test User']);
  git(repoDir, ['config', 'user.email', 'test@example.com']);

  await mkdir(scriptsDir, { recursive: true });
  await cp(join(projectRoot, 'scripts/publish.sh'), join(scriptsDir, 'publish.sh'), { force: true });
  await cp(join(projectRoot, 'scripts/merge-history.mjs'), join(scriptsDir, 'merge-history.mjs'), { force: true });
  await chmod(join(scriptsDir, 'publish.sh'), 0o755);

  await writeFile(join(repoDir, '.gitignore'), 'out/\ntmp/\n');
  await writeFile(join(repoDir, 'README.md'), '# temp repo\n');

  git(repoDir, ['add', '.']);
  git(repoDir, ['commit', '-m', 'Initial commit']);
  git(repoDir, ['remote', 'add', 'origin', remoteDir]);
  git(repoDir, ['push', '-u', 'origin', 'main']);

  return { repoDir, remoteDir };
}

async function writeOut(repoDir: string, options: WriteOutOptions): Promise<void> {
  const outDir = join(repoDir, 'out');
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, 'data'), { recursive: true });
  await writeFile(join(outDir, 'index.html'), `<html><body>${options.htmlLabel}</body></html>`);
  await writeFile(join(outDir, 'data', 'history.json'), JSON.stringify(options.history, null, 2) + '\n');

  for (const [runId, resultBody] of Object.entries(options.resultBodies)) {
    await mkdir(join(outDir, 'data', 'runs', runId), { recursive: true });
    await writeFile(join(outDir, 'data', 'runs', runId, 'results.json'), JSON.stringify(resultBody, null, 2) + '\n');
  }

  for (const [runId, html] of Object.entries(options.runDashboards ?? {})) {
    await mkdir(join(outDir, 'runs', runId), { recursive: true });
    await writeFile(join(outDir, 'runs', runId, 'index.html'), html);
  }
}

async function runPublish(repoDir: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('bash', ['scripts/publish.sh'], {
    cwd: repoDir,
  });
}

function readRemoteFile(remoteDir: string, path: string): string {
  return execFileSync('git', ['--git-dir', remoteDir, 'show', `gh-pages:${path}`], { encoding: 'utf-8' });
}

function listRemoteFiles(remoteDir: string): string[] {
  return execFileSync('git', ['--git-dir', remoteDir, 'ls-tree', '-r', '--name-only', 'gh-pages'], { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);
}

afterAll(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
});

describe('scripts/publish.sh', () => {
  it('fails with a readable error when out/ is missing', async () => {
    const { repoDir } = await createRepoFixture();

    await expect(runPublish(repoDir)).rejects.toMatchObject({
      stderr: expect.stringContaining('Error: out/ directory does not exist. Run npm run analyze first.'),
    });
  });

  it('fails with a readable error when the working tree is dirty', async () => {
    const { repoDir } = await createRepoFixture();

    await writeOut(repoDir, {
      history: [{ runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 }],
      resultBodies: {
        '20240415-120000': { runId: '20240415-120000', payload: 'first' },
      },
      htmlLabel: 'first publish',
    });
    await writeFile(join(repoDir, 'README.md'), '# dirty repo\n');

    await expect(runPublish(repoDir)).rejects.toMatchObject({
      stderr: expect.stringContaining('Error: Git working tree is dirty. Commit or stash changes before publishing.'),
    });
  });

  it('publishes every unpublished local run and preserves archived dashboards across later publishes', async () => {
    const { repoDir, remoteDir } = await createRepoFixture();

    await writeOut(repoDir, {
      history: [
        { runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 },
        { runId: '20240416-120000', timestamp: '2024-04-16T12:00:00.000Z', overallHealth: 80 },
      ],
      resultBodies: {
        '20240415-120000': { runId: '20240415-120000', payload: 'first' },
        '20240416-120000': { runId: '20240416-120000', payload: 'second' },
      },
      htmlLabel: 'second publish',
      runDashboards: {
        '20240415-120000': '<html><body>run one dashboard</body></html>',
        '20240416-120000': '<html><body>run two dashboard</body></html>',
      },
    });

    await runPublish(repoDir);

    expect(listRemoteFiles(remoteDir)).toEqual(expect.arrayContaining([
      '.nojekyll',
      'data/history.json',
      'data/runs/20240415-120000/results.json',
      'data/runs/20240416-120000/results.json',
      'index.html',
      'runs/20240415-120000/index.html',
      'runs/20240416-120000/index.html',
    ]));

    const firstHistory = JSON.parse(readRemoteFile(remoteDir, 'data/history.json'));
    expect(firstHistory).toEqual([
      { runId: '20240416-120000', timestamp: '2024-04-16T12:00:00.000Z', overallHealth: 80 },
      { runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 },
    ]);
    expect(JSON.parse(readRemoteFile(remoteDir, 'data/runs/20240415-120000/results.json'))).toEqual({
      runId: '20240415-120000',
      payload: 'first',
    });
    expect(JSON.parse(readRemoteFile(remoteDir, 'data/runs/20240416-120000/results.json'))).toEqual({
      runId: '20240416-120000',
      payload: 'second',
    });
    expect(readRemoteFile(remoteDir, 'runs/20240415-120000/index.html')).toContain('run one dashboard');
    expect(readRemoteFile(remoteDir, 'runs/20240416-120000/index.html')).toContain('run two dashboard');

    await rm(join(repoDir, 'out'), { recursive: true, force: true });
    expect(existsSync(join(repoDir, 'tmp', 'gh-pages'))).toBe(false);

    await writeOut(repoDir, {
      history: [{ runId: '20240417-120000', timestamp: '2024-04-17T12:00:00.000Z', overallHealth: 90 }],
      resultBodies: {
        '20240417-120000': { runId: '20240417-120000', payload: 'third' },
      },
      htmlLabel: 'third publish',
      runDashboards: {
        '20240417-120000': '<html><body>run three dashboard</body></html>',
      },
    });

    await runPublish(repoDir);

    const history = JSON.parse(readRemoteFile(remoteDir, 'data/history.json'));
    expect(history).toEqual([
      { runId: '20240417-120000', timestamp: '2024-04-17T12:00:00.000Z', overallHealth: 90 },
      { runId: '20240416-120000', timestamp: '2024-04-16T12:00:00.000Z', overallHealth: 80 },
      { runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 },
    ]);

    expect(JSON.parse(readRemoteFile(remoteDir, 'data/runs/20240415-120000/results.json'))).toEqual({
      runId: '20240415-120000',
      payload: 'first',
    });
    expect(JSON.parse(readRemoteFile(remoteDir, 'data/runs/20240416-120000/results.json'))).toEqual({
      runId: '20240416-120000',
      payload: 'second',
    });
    expect(JSON.parse(readRemoteFile(remoteDir, 'data/runs/20240417-120000/results.json'))).toEqual({
      runId: '20240417-120000',
      payload: 'third',
    });
    expect(readRemoteFile(remoteDir, 'runs/20240415-120000/index.html')).toContain('run one dashboard');
    expect(readRemoteFile(remoteDir, 'runs/20240416-120000/index.html')).toContain('run two dashboard');
    expect(readRemoteFile(remoteDir, 'runs/20240417-120000/index.html')).toContain('run three dashboard');
    expect(readRemoteFile(remoteDir, 'index.html')).toContain('third publish');
    expect(existsSync(join(repoDir, 'tmp', 'gh-pages'))).toBe(false);
  });

  it('fails with a readable error when history.json is invalid', async () => {
    const { repoDir } = await createRepoFixture();

    const outDir = join(repoDir, 'out');
    await mkdir(join(outDir, 'data', 'runs', '20240415-120000'), { recursive: true });
    await writeFile(join(outDir, 'index.html'), '<html></html>');
    // This intentionally trips publish.sh's pre-merge JSON parsing path.
    await writeFile(join(outDir, 'data', 'history.json'), '{invalid json');
    await writeFile(join(outDir, 'data', 'runs', '20240415-120000', 'results.json'), '{}');

    await expect(runPublish(repoDir)).rejects.toMatchObject({
      stderr: expect.stringContaining('is not valid JSON'),
    });
  });
});
