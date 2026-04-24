import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { GitCloneSource } from '../git-clone.js';

const tmpDir = resolve(process.cwd(), 'tmp', 'test-local-repo');
const README_CONTENT = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n';

// Create a local git repo for testing — no network needed
beforeAll(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  mkdirSync(tmpDir, { recursive: true });

  // Init repo
  execSync('git init', { cwd: tmpDir });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir });
  execSync('git config user.name "Test"', { cwd: tmpDir });

  // Create files
  writeFileSync(resolve(tmpDir, 'README.md'), README_CONTENT);
  mkdirSync(resolve(tmpDir, 'src'), { recursive: true });
  writeFileSync(resolve(tmpDir, 'src', 'index.ts'), 'export {};');
  mkdirSync(resolve(tmpDir, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(resolve(tmpDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};');

  execSync('git add .', { cwd: tmpDir });
  execSync('git commit -m "initial"', { cwd: tmpDir });
});

afterAll(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// readFile
// ---------------------------------------------------------------------------

describe('GitCloneSource — readFile', () => {
  it('returns correct full content for README.md', async () => {
    const source = new GitCloneSource('unused', 'unused', tmpDir);
    const content = await source.readFile('README.md');
    expect(content).toBe(README_CONTENT);
  });

  it('returns only the first two lines when startLine=1, endLine=2', async () => {
    const source = new GitCloneSource('unused', 'unused', tmpDir);
    const content = await source.readFile('README.md', 1, 2);
    expect(content).toBe('Line 1\nLine 2');
  });
});

// ---------------------------------------------------------------------------
// listDir
// ---------------------------------------------------------------------------

describe('GitCloneSource — listDir', () => {
  it('returns all files excluding .git/ and node_modules/', async () => {
    const source = new GitCloneSource('unused', 'unused', tmpDir);
    const files = await source.listDir('.');
    expect(files).toContain('README.md');
    expect(files).toContain('src/index.ts');
    // node_modules should be excluded
    const hasNodeModules = files.some(f => f.startsWith('node_modules'));
    expect(hasNodeModules).toBe(false);
    // .git should be excluded (it's in EXCLUDED_DIRS)
    const hasGit = files.some(f => f.startsWith('.git'));
    expect(hasGit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getCommitSha
// ---------------------------------------------------------------------------

describe('GitCloneSource — getCommitSha', () => {
  it('returns a 40-character hex string', async () => {
    const source = new GitCloneSource('unused', 'unused', tmpDir);
    const sha = await source.getCommitSha();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});

// ---------------------------------------------------------------------------
// Second instantiation skips clone
// ---------------------------------------------------------------------------

describe('GitCloneSource — caching', () => {
  it('second instantiation with same cacheDir skips clone (.git dir already exists)', async () => {
    // The directory already has .git from beforeAll setup
    const source1 = new GitCloneSource('unused-url', 'unused-ref', tmpDir);
    const sha1 = await source1.getCommitSha();

    // Create a second instance pointing to the same cacheDir
    const source2 = new GitCloneSource('unused-url-2', 'unused-ref-2', tmpDir);
    const sha2 = await source2.getCommitSha();

    // Both should return the same SHA (from the same cached repo)
    expect(sha1).toBe(sha2);
    // .git should still exist
    expect(existsSync(resolve(tmpDir, '.git'))).toBe(true);
  });
});
