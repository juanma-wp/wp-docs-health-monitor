import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { GitCloneCodeSource } from '../git-clone.js';

let repoDir: string;
let cacheDir: string;

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'test-repo-'));
  cacheDir = mkdtempSync(join(tmpdir(), 'test-cache-'));

  // Initialize a git repo
  execSync('git init', { cwd: repoDir });
  execSync('git config user.email "test@test.com"', { cwd: repoDir });
  execSync('git config user.name "Test"', { cwd: repoDir });

  // Create some files
  writeFileSync(join(repoDir, 'README.md'), 'line1\nline2\nline3\n');
  mkdirSync(join(repoDir, 'src'));
  writeFileSync(join(repoDir, 'src', 'index.js'), 'console.log("hello");\n');
  mkdirSync(join(repoDir, 'node_modules'));
  writeFileSync(join(repoDir, 'node_modules', 'package.json'), '{}');

  execSync('git add .', { cwd: repoDir });
  execSync('git commit -m "initial commit"', { cwd: repoDir });

  // Clone the repo into cacheDir
  execSync(`git clone "${repoDir}" "${cacheDir}"`);
});

afterAll(() => {
  try { rmSync(repoDir, { recursive: true }); } catch {}
  try { rmSync(cacheDir, { recursive: true }); } catch {}
});

describe('GitCloneCodeSource', () => {
  it('readFile returns correct full content', async () => {
    const source = new GitCloneCodeSource(repoDir, 'master', cacheDir);
    await source.init();
    const content = await source.readFile('README.md');
    expect(content).toContain('line1');
    expect(content).toContain('line2');
    expect(content).toContain('line3');
  });

  it('readFile with startLine and endLine returns only specified lines', async () => {
    const source = new GitCloneCodeSource(repoDir, 'master', cacheDir);
    await source.init();
    const content = await source.readFile('README.md', 1, 2);
    expect(content).toBe('line1\nline2');
  });

  it('listDir returns all files excluding .git/', async () => {
    const source = new GitCloneCodeSource(repoDir, 'master', cacheDir);
    await source.init();
    const files = await source.listDir('.');
    expect(files).toContain('README.md');
    expect(files).toContain('src/index.js');
    expect(files.some((f) => f.includes('.git'))).toBe(false);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });

  it('getCommitSha returns a 40-character hex string', async () => {
    const source = new GitCloneCodeSource(repoDir, 'master', cacheDir);
    await source.init();
    const sha = await source.getCommitSha();
    expect(sha.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('second instantiation with same cacheDir skips clone', async () => {
    // First instance initializes
    const source1 = new GitCloneCodeSource(repoDir, 'master', cacheDir);
    await source1.init();

    const sha1 = await source1.getCommitSha();

    // Second instance with same cacheDir should skip clone
    const source2 = new GitCloneCodeSource(repoDir, 'master', cacheDir);
    await source2.init();
    const sha2 = await source2.getCommitSha();

    expect(sha1.trim()).toBe(sha2.trim());
  });
});
