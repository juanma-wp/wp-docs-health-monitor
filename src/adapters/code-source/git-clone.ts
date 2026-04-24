import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { simpleGit } from 'simple-git';

import type { CodeSource } from './types.js';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'vendor']);

export class GitCloneSource implements CodeSource {
  private readonly repoUrl: string;
  private readonly ref: string;
  private readonly cacheDir: string;
  private readyPromise: Promise<void> | null = null;
  private commitSha: string | null = null;

  constructor(repoUrl: string, ref: string, cacheDir: string) {
    this.repoUrl = repoUrl;
    this.ref = ref;
    this.cacheDir = cacheDir;
  }

  private ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.init();
    }
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    const gitDir = join(this.cacheDir, '.git');
    if (!existsSync(gitDir)) {
      const git = simpleGit();
      await git.clone(this.repoUrl, this.cacheDir, [
        '--depth', '1',
        '--branch', this.ref,
      ]);
    }
    const git = simpleGit(this.cacheDir);
    this.commitSha = (await git.revparse(['HEAD'])).trim();
  }

  async readFile(path: string, startLine?: number, endLine?: number): Promise<string> {
    await this.ensureReady();
    const fullPath = join(this.cacheDir, path);
    const raw = readFileSync(fullPath, 'utf-8');
    if (startLine !== undefined && endLine !== undefined) {
      const lines = raw.split('\n');
      return lines.slice(startLine - 1, endLine).join('\n');
    }
    return raw;
  }

  async listDir(path: string): Promise<string[]> {
    await this.ensureReady();
    const fullPath = join(this.cacheDir, path);
    const results: string[] = [];
    this.walk(fullPath, results);
    return results;
  }

  private walk(dir: string, results: string[]): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        this.walk(fullPath, results);
      } else {
        results.push(relative(this.cacheDir, fullPath));
      }
    }
  }

  async getCommitSha(): Promise<string> {
    await this.ensureReady();
    return this.commitSha ?? '';
  }
}
