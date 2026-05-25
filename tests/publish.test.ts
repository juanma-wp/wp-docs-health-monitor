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

async function writeOut(repoDir: string, runId: string, history: RunHistoryEntry[], resultBody: object, htmlLabel: string): Promise<void> {
  const outDir = join(repoDir, 'out');
  await mkdir(join(outDir, 'data', 'runs', runId), { recursive: true });
  await writeFile(join(outDir, 'index.html'), `<html><body>${htmlLabel}</body></html>`);
  await writeFile(join(outDir, 'data', 'history.json'), JSON.stringify(history, null, 2) + '\n');
  await writeFile(join(outDir, 'data', 'runs', runId, 'results.json'), JSON.stringify(resultBody, null, 2) + '\n');
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

    await writeOut(
      repoDir,
      '20240415-120000',
      [{ runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 }],
      { runId: '20240415-120000', payload: 'first' },
      'first publish',
    );
    await writeFile(join(repoDir, 'README.md'), '# dirty repo\n');

    await expect(runPublish(repoDir)).rejects.toMatchObject({
      stderr: expect.stringContaining('Error: Git working tree is dirty. Commit or stash changes before publishing.'),
    });
  });

  it('publishes twice without clobbering the first run data', async () => {
    const { repoDir, remoteDir } = await createRepoFixture();

    await writeOut(
      repoDir,
      '20240415-120000',
      [{ runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 }],
      { runId: '20240415-120000', payload: 'first' },
      'first publish',
    );

    await runPublish(repoDir);

    expect(listRemoteFiles(remoteDir)).toEqual(expect.arrayContaining([
      '.nojekyll',
      'data/history.json',
      'data/runs/20240415-120000/results.json',
      'index.html',
    ]));

    const firstHistory = JSON.parse(readRemoteFile(remoteDir, 'data/history.json'));
    expect(firstHistory).toEqual([
      { runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 },
    ]);
    expect(JSON.parse(readRemoteFile(remoteDir, 'data/runs/20240415-120000/results.json'))).toEqual({
      runId: '20240415-120000',
      payload: 'first',
    });

    await rm(join(repoDir, 'out'), { recursive: true, force: true });
    expect(existsSync(join(repoDir, 'tmp', 'gh-pages'))).toBe(false);

    await writeOut(
      repoDir,
      '20240416-120000',
      [{ runId: '20240416-120000', timestamp: '2024-04-16T12:00:00.000Z', overallHealth: 80 }],
      { runId: '20240416-120000', payload: 'second' },
      'second publish',
    );

    await runPublish(repoDir);

    const history = JSON.parse(readRemoteFile(remoteDir, 'data/history.json'));
    expect(history).toEqual([
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
    expect(readRemoteFile(remoteDir, 'index.html')).toContain('second publish');
    expect(existsSync(join(repoDir, 'tmp', 'gh-pages'))).toBe(false);
  });

  it('fails with a readable error when history.json is invalid', async () => {
    const { repoDir } = await createRepoFixture();

    const outDir = join(repoDir, 'out');
    await mkdir(join(outDir, 'data', 'runs', '20240415-120000'), { recursive: true });
    await writeFile(join(outDir, 'index.html'), '<html></html>');
    await writeFile(join(outDir, 'data', 'history.json'), '{invalid json');
    await writeFile(join(outDir, 'data', 'runs', '20240415-120000', 'results.json'), '{}');

    await expect(runPublish(repoDir)).rejects.toMatchObject({
      stderr: expect.stringContaining('Error: out/data/history.json is not valid JSON'),
    });
  });
});
