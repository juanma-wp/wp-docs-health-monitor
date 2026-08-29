import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { RunResultsSchema, type Issue, type RunResults } from '../types/results.js';
import { FeedbackFileSchema, RUN_ID_PATTERN, type FeedbackFile, type MissedIssue } from './schema.js';

// ---------------------------------------------------------------------------
// Feedback store — reads feedback/<site>/<runId>.json files and joins them
// against the committed run results under out/<site>/data/runs/<runId>/.
// ---------------------------------------------------------------------------

export type JoinedIssueFeedback = {
  runId:    string;
  slug:     string;
  verdict:  FeedbackFile['issues'][number]['verdict'];
  notes?:   string;
  exemplar: boolean;
  issue:    Issue;
};

export type UnmatchedFeedback = {
  runId:       string;
  slug:        string;
  fingerprint: string;
  reason:      string;
};

export type JoinResult = {
  joined:    JoinedIssueFeedback[];
  missed:    Array<MissedIssue & { runId: string }>;
  unmatched: UnmatchedFeedback[];
};

// Loads and validates every <runId>.json under feedback/<site>/, sorted by
// runId ascending. Throws on a file that exists but does not parse — a
// malformed verdict file must fail loudly, not silently shrink the metrics.
export function loadSiteFeedback(feedbackRoot: string, site: string): FeedbackFile[] {
  const dir = join(feedbackRoot, site);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json') && RUN_ID_PATTERN.test(f.replace(/\.json$/, '')))
    .sort();
  return files.map(f => {
    const path = join(dir, f);
    const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    const parsed = FeedbackFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid feedback file ${path}:\n${parsed.error.toString()}`);
    }
    const expectedRunId = f.replace(/\.json$/, '');
    if (parsed.data.runId !== expectedRunId) {
      throw new Error(`Feedback file ${path} declares runId "${parsed.data.runId}" but is named "${expectedRunId}.json"`);
    }
    return parsed.data;
  });
}

// Reads out/<site>/data/runs/<runId>/results.json. Returns null when the run
// is not committed (caller decides whether that is a warning or an error).
export function loadRunResults(outRoot: string, site: string, runId: string): RunResults | null {
  const path = join(outRoot, site, 'data', 'runs', runId, 'results.json');
  if (!existsSync(path)) return null;
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  const parsed = RunResultsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid results file ${path}:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

// Joins verdicts to the issues they reference by (slug, fingerprint) within
// each run. Entries that reference an unknown run, doc, or fingerprint land
// in `unmatched` — they are reviewer typos or drift between the feedback
// file and the committed results, and must be surfaced, never dropped.
export function joinFeedback(
  files: FeedbackFile[],
  resultsByRunId: Map<string, RunResults>,
): JoinResult {
  const joined: JoinedIssueFeedback[] = [];
  const missed: JoinResult['missed'] = [];
  const unmatched: UnmatchedFeedback[] = [];

  for (const file of files) {
    const results = resultsByRunId.get(file.runId);
    for (const entry of file.issues) {
      if (!results) {
        unmatched.push({ runId: file.runId, slug: entry.slug, fingerprint: entry.fingerprint, reason: `no committed results for run ${file.runId}` });
        continue;
      }
      const doc = results.docs.find(d => d.slug === entry.slug);
      if (!doc) {
        unmatched.push({ runId: file.runId, slug: entry.slug, fingerprint: entry.fingerprint, reason: `doc "${entry.slug}" not in run ${file.runId}` });
        continue;
      }
      const issue = doc.issues.find(i => i.fingerprint === entry.fingerprint);
      if (!issue) {
        unmatched.push({ runId: file.runId, slug: entry.slug, fingerprint: entry.fingerprint, reason: `fingerprint not found in doc "${entry.slug}" of run ${file.runId}` });
        continue;
      }
      joined.push({
        runId:    file.runId,
        slug:     entry.slug,
        verdict:  entry.verdict,
        notes:    entry.notes,
        exemplar: entry.exemplar,
        issue,
      });
    }
    for (const m of file.missed) {
      missed.push({ ...m, runId: file.runId });
    }
  }

  return { joined, missed, unmatched };
}
