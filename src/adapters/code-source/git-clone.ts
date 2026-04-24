import { readFile as fsReadFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { simpleGit } from 'simple-git';
import type { CodeSource } from './types.js';

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'vendor']);

async function listFilesRecursive(dir: string, baseDir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(fullPath, baseDir);
      results.push(...nested);
    } else {
      results.push(relative(baseDir, fullPath));
    }
  }
  return results;
}

export class GitCloneCodeSource implements CodeSource {
  private cacheDir: string;
  private repoUrl: string;
  private ref: string;
  private commitSha: string | null = null;

  constructor(repoUrl: string, ref: string, cacheDir: string) {
    this.repoUrl = repoUrl;
    this.ref = ref;
    this.cacheDir = cacheDir;
  }

  async init(): Promise<void> {
    const gitDir = join(this.cacheDir, '.git');
    if (!existsSync(gitDir)) {
      const git = simpleGit();
      await git.clone(this.repoUrl, this.cacheDir, ['--depth', '1', '--branch', this.ref]);
    }
    const git = simpleGit(this.cacheDir);
    this.commitSha = await git.revparse(['HEAD']);
  }

  async readFile(path: string, startLine?: number, endLine?: number): Promise<string> {
    const fullPath = join(this.cacheDir, path);
    const content = await fsReadFile(fullPath, 'utf-8');
    if (startLine !== undefined && endLine !== undefined) {
      const lines = content.split('\n');
      return lines.slice(startLine - 1, endLine).join('\n');
    }
    return content;
  }

  async listDir(path: string): Promise<string[]> {
    const fullPath = join(this.cacheDir, path);
    return listFilesRecursive(fullPath, this.cacheDir);
  }

  async getCommitSha(): Promise<string> {
    if (!this.commitSha) {
      const git = simpleGit(this.cacheDir);
      this.commitSha = await git.revparse(['HEAD']);
    }
    return this.commitSha!.trim();
  }
}
