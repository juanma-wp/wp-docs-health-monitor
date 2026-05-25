import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
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
  siteName?: string;
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
    ...(entries.get(results.runId) ?? {}),
    ...buildHistoryEntry(results),
  });

  return [...entries.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function buildRelativePaths(mode: 'latest' | 'run', page: 'index' | 'nested'): {
  currentRunHref: string;
  latestRunHref: string | null;
  archivedRunPrefix: string;
  metaIndexHref: string;
} {
  if (mode === 'latest') {
    return page === 'index'
      ? { currentRunHref: 'index.html',    latestRunHref: null,             archivedRunPrefix: 'runs',     metaIndexHref: '../index.html' }
      : { currentRunHref: '../index.html', latestRunHref: '../index.html',  archivedRunPrefix: '../runs',  metaIndexHref: '../../index.html' };
  }

  return page === 'index'
    ? { currentRunHref: 'index.html',    latestRunHref: '../../index.html',    archivedRunPrefix: '..',    metaIndexHref: '../../../index.html' }
    : { currentRunHref: '../index.html', latestRunHref: '../../../index.html', archivedRunPrefix: '../..', metaIndexHref: '../../../../index.html' };
}

function buildNav(
  currentRunId: string,
  latestRunId: string,
  history: DashboardHistoryEntry[],
  mode: 'latest' | 'run',
  page: 'index' | 'nested',
  metaIndexAvailable: boolean,
): DashboardNav {
  const paths = buildRelativePaths(mode, page);

  return {
    currentRunId,
    latestRunId,
    latestRunHref: currentRunId === latestRunId ? (page === 'index' ? null : paths.currentRunHref) : paths.latestRunHref,
    metaIndexHref: metaIndexAvailable ? paths.metaIndexHref : null,
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

  await mkdir(outDir, { recursive: true });

  // Probe for a sibling/ancestor meta-index. Relative to outDir:
  //   mode='latest' (outDir == <site>): meta is at ../index.html
  //   mode='run'    (outDir == <site>/runs/<id>): meta is at ../../../index.html
  const metaProbePath = mode === 'latest'
    ? join(outDir, '..', 'index.html')
    : join(outDir, '..', '..', '..', 'index.html');
  const metaIndexAvailable = existsSync(metaProbePath);

  const tree = buildTree(results.docs);
  const indexNav = buildNav(results.runId, latestRunId, history, mode, 'index', metaIndexAvailable);
  const nestedNav = buildNav(results.runId, latestRunId, history, mode, 'nested', metaIndexAvailable);

  // The latest dashboard's index.html lives at <site>/index.html but links into
  // <site>/runs/<latestId>/doc/ and <site>/runs/<latestId>/folder/ — the same
  // files the archived-run loop renders. Avoids duplicating per-doc HTML at
  // both <site>/doc/ and <site>/runs/<latestId>/doc/.
  const docFolderLinkPrefix = mode === 'latest' ? `runs/${latestRunId}/` : '';

  await writeFile(join(outDir, 'index.html'), renderIndex(results, tree, indexNav, options.siteName, docFolderLinkPrefix), 'utf-8');

  // doc/ and folder/ pages are written only by mode='run' calls. The latest
  // run's per-doc pages come from the archived-run regeneration loop in the
  // caller (cli.ts) which calls generate() again with mode='run' for every
  // history entry — including the latest itself.
  if (mode === 'run') {
    await mkdir(join(outDir, 'doc'), { recursive: true });
    await mkdir(join(outDir, 'folder'), { recursive: true });

    for (const doc of results.docs) {
      await writeFile(join(outDir, 'doc', `${doc.slug}.html`), renderDoc(doc, results.repoUrls, results.repoRefs, nestedNav), 'utf-8');
    }

    for (const node of tree) {
      await writeFile(join(outDir, 'folder', `${node.parent}.html`), renderFolder(node, nestedNav), 'utf-8');
    }
  }
}
