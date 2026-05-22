import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { RunResultsSchema, type RunResults } from '../types/results.js';
import { buildTree } from './tree-builder.js';
import { renderIndex } from './templates/index.js';
import { renderDoc } from './templates/doc.js';
import { renderFolder } from './templates/folder.js';
import type { DashboardHistoryEntry, DashboardNav } from './templates/shared.js';

export type GenerateDashboardOptions = {
  history?: DashboardHistoryEntry[];
  latestRunId?: string;
  mode?: 'latest' | 'run';
};

function buildHistoryEntry(results: RunResults): DashboardHistoryEntry {
  return {
    runId: results.runId,
    timestamp: results.timestamp,
    overallHealth: results.overallHealth,
    docCount: results.totals.docs,
    criticalIssues: results.totals.issues.critical,
    majorIssues: results.totals.issues.major,
    commitSha: results.docs[0]?.commitSha ?? '',
  };
}

function normalizeHistory(results: RunResults, history: DashboardHistoryEntry[] = []): DashboardHistoryEntry[] {
  const entries = new Map<string, DashboardHistoryEntry>();

  for (const entry of history) {
    entries.set(entry.runId, entry);
  }

  entries.set(results.runId, {
    ...entries.get(results.runId),
    ...buildHistoryEntry(results),
  });

  return [...entries.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function buildRelativePaths(mode: 'latest' | 'run', page: 'index' | 'nested'): {
  currentRunHref: string;
  latestRunHref: string | null;
  archivedRunPrefix: string;
} {
  if (mode === 'latest') {
    return page === 'index'
      ? { currentRunHref: 'index.html', latestRunHref: null, archivedRunPrefix: 'runs' }
      : { currentRunHref: '../index.html', latestRunHref: '../index.html', archivedRunPrefix: '../runs' };
  }

  return page === 'index'
    ? { currentRunHref: 'index.html', latestRunHref: '../../index.html', archivedRunPrefix: '..' }
    : { currentRunHref: '../index.html', latestRunHref: '../../../index.html', archivedRunPrefix: '../..' };
}

function buildNav(
  currentRunId: string,
  latestRunId: string,
  history: DashboardHistoryEntry[],
  mode: 'latest' | 'run',
  page: 'index' | 'nested',
): DashboardNav {
  const paths = buildRelativePaths(mode, page);

  return {
    currentRunId,
    latestRunId,
    latestRunHref: currentRunId === latestRunId ? (page === 'index' ? null : paths.currentRunHref) : paths.latestRunHref,
    history: history.map(entry => {
      const href = entry.runId === currentRunId
        ? paths.currentRunHref
        : entry.runId === latestRunId
          ? (paths.latestRunHref ?? paths.currentRunHref)
          : `${paths.archivedRunPrefix}/${entry.runId}/index.html`;

      return {
        ...entry,
        href,
        isCurrent: entry.runId === currentRunId,
        isLatest: entry.runId === latestRunId,
      };
    }),
  };
}

export async function generate(results: RunResults, outDir: string, options: GenerateDashboardOptions = {}): Promise<void> {
  RunResultsSchema.parse(results);
  const mode = options.mode ?? 'latest';
  const history = normalizeHistory(results, options.history);
  const latestRunId = options.latestRunId ?? history[0]?.runId ?? results.runId;

  await mkdir(join(outDir, 'doc'), { recursive: true });
  await mkdir(join(outDir, 'folder'), { recursive: true });

  const tree = buildTree(results.docs);
  const indexNav = buildNav(results.runId, latestRunId, history, mode, 'index');
  const nestedNav = buildNav(results.runId, latestRunId, history, mode, 'nested');

  await writeFile(join(outDir, 'index.html'), renderIndex(results, tree, indexNav), 'utf-8');

  for (const doc of results.docs) {
    await writeFile(join(outDir, 'doc', `${doc.slug}.html`), renderDoc(doc, results.repoUrls, results.repoRefs, nestedNav), 'utf-8');
  }

  for (const node of tree) {
    await writeFile(join(outDir, 'folder', `${node.parent}.html`), renderFolder(node, nestedNav), 'utf-8');
  }
}
