import { afterAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadRunResults, loadSiteFeedback, joinFeedback } from '../store.js';
import type { FeedbackFile } from '../schema.js';
import type { RunResults } from '../../types/results.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../../');
const mockResultsPath = join(projectRoot, 'examples', 'mock-results.json');

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
});

async function loadMockResults(): Promise<RunResults> {
  return JSON.parse(await readFile(mockResultsPath, 'utf-8')) as RunResults;
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wp-docs-feedback-'));
  tempDirs.push(dir);
  return dir;
}

function feedbackFor(results: RunResults, overrides: Partial<FeedbackFile> = {}): FeedbackFile {
  const docWithIssue = results.docs.find(d => d.issues.length > 0);
  if (!docWithIssue) throw new Error('mock-results.json has no doc with issues');
  return {
    site:   'test-site',
    runId:  results.runId,
    issues: [{
      slug:        docWithIssue.slug,
      fingerprint: docWithIssue.issues[0].fingerprint,
      verdict:     'true-positive',
      exemplar:    false,
    }],
    missed: [],
    ...overrides,
  };
}

describe('loadSiteFeedback', () => {
  it('returns [] when the site directory does not exist', async () => {
    const root = await makeTempDir();
    expect(loadSiteFeedback(root, 'nope')).toEqual([]);
  });

  it('loads valid feedback files and rejects a runId/filename mismatch', async () => {
    const root = await makeTempDir();
    const results = await loadMockResults();
    const siteDir = join(root, 'test-site');
    await mkdir(siteDir, { recursive: true });
    const file = feedbackFor(results);
    await writeFile(join(siteDir, `${results.runId}.json`), JSON.stringify(file), 'utf-8');
    expect(loadSiteFeedback(root, 'test-site')).toHaveLength(1);

    await writeFile(join(siteDir, '20990101-000000.json'), JSON.stringify(file), 'utf-8');
    expect(() => loadSiteFeedback(root, 'test-site')).toThrow(/declares runId/);
  });

  it('throws loudly on an invalid feedback file', async () => {
    const root = await makeTempDir();
    const siteDir = join(root, 'test-site');
    await mkdir(siteDir, { recursive: true });
    await writeFile(join(siteDir, '20260101-000000.json'), JSON.stringify({ site: 'test-site' }), 'utf-8');
    expect(() => loadSiteFeedback(root, 'test-site')).toThrow(/Invalid feedback file/);
  });

  it('ignores files whose name is not a runId (e.g. metrics.json)', async () => {
    const root = await makeTempDir();
    const siteDir = join(root, 'test-site');
    await mkdir(siteDir, { recursive: true });
    await writeFile(join(siteDir, 'metrics.json'), '{}', 'utf-8');
    expect(loadSiteFeedback(root, 'test-site')).toEqual([]);
  });
});

describe('loadRunResults', () => {
  it('returns null for a missing run and parses a committed one', async () => {
    const root = await makeTempDir();
    const results = await loadMockResults();
    expect(loadRunResults(root, 'test-site', results.runId)).toBeNull();

    const runDir = join(root, 'test-site', 'data', 'runs', results.runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'results.json'), JSON.stringify(results), 'utf-8');
    expect(loadRunResults(root, 'test-site', results.runId)?.runId).toBe(results.runId);
  });
});

describe('joinFeedback', () => {
  it('joins verdicts to issues by slug + fingerprint', async () => {
    const results = await loadMockResults();
    const file = feedbackFor(results);
    const { joined, unmatched } = joinFeedback([file], new Map([[results.runId, results]]));
    expect(unmatched).toEqual([]);
    expect(joined).toHaveLength(1);
    expect(joined[0].issue.fingerprint).toBe(file.issues[0].fingerprint);
    expect(joined[0].runId).toBe(results.runId);
  });

  it('reports unmatched entries instead of dropping them', async () => {
    const results = await loadMockResults();
    const file = feedbackFor(results, {
      issues: [
        { slug: 'no-such-doc', fingerprint: '0123456789abcdef', verdict: 'false-positive', exemplar: false },
      ],
    });
    const { joined, unmatched } = joinFeedback([file], new Map([[results.runId, results]]));
    expect(joined).toEqual([]);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].reason).toMatch(/not in run/);
  });

  it('marks every entry unmatched when the run has no committed results', async () => {
    const results = await loadMockResults();
    const file = feedbackFor(results);
    const { unmatched } = joinFeedback([file], new Map());
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].reason).toMatch(/no committed results/);
  });

  it('carries missed entries through with their runId', async () => {
    const results = await loadMockResults();
    const file = feedbackFor(results, {
      missed: [{ slug: 'block-transforms', description: 'isMatch array behaviour not reported' }],
    });
    const { missed } = joinFeedback([file], new Map([[results.runId, results]]));
    expect(missed).toEqual([
      { slug: 'block-transforms', description: 'isMatch array behaviour not reported', runId: results.runId },
    ]);
  });
});
