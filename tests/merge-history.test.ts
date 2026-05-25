import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../');
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
});

describe('scripts/merge-history.mjs', () => {
  it('prepends the newest entry and deduplicates by runId', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'merge-history-test-'));
    tempDirs.push(tempDir);

    const existingPath = join(tempDir, 'existing-history.json');
    const incomingPath = join(tempDir, 'incoming-history.json');

    await writeFile(existingPath, JSON.stringify([
      { runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 },
      { runId: '20240414-120000', timestamp: '2024-04-14T12:00:00.000Z', overallHealth: 70 },
    ], null, 2));
    await writeFile(incomingPath, JSON.stringify([
      { runId: '20240414-120000', timestamp: '2024-04-14T12:00:00.000Z', overallHealth: 70 },
      { runId: '20240416-120000', timestamp: '2024-04-16T12:00:00.000Z', overallHealth: 80 },
    ], null, 2));

    await execFileAsync('node', [join(projectRoot, 'scripts/merge-history.mjs'), existingPath, incomingPath], {
      cwd: projectRoot,
    });

    const merged = JSON.parse(await readFile(existingPath, 'utf-8'));
    expect(merged).toEqual([
      { runId: '20240416-120000', timestamp: '2024-04-16T12:00:00.000Z', overallHealth: 80 },
      { runId: '20240415-120000', timestamp: '2024-04-15T12:00:00.000Z', overallHealth: 65 },
      { runId: '20240414-120000', timestamp: '2024-04-14T12:00:00.000Z', overallHealth: 70 },
    ]);
  });
});
