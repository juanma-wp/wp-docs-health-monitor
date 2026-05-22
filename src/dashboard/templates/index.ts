import type { RunResults } from '../../types/results.js';
import type { TreeNode } from '../tree-builder.js';
import { escapeHtml, healthBadge, statusBadge, formatTimestamp, renderDashboardLayout, type DashboardNav } from './shared.js';

function renderStatCard(label: string, value: string, tone: string): string {
  return `
    <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-sm font-medium text-slate-500">${label}</p>
      <p class="mt-3 text-3xl font-semibold ${tone}">${value}</p>
    </div>`;
}

export function renderIndex(results: RunResults, tree: TreeNode[], nav: DashboardNav): string {
  const commitSha = results.docs[0]?.commitSha ?? '';
  const shortSha = commitSha ? commitSha.slice(0, 7) : '';

  const headerHtml = `
    <section class="rounded-3xl bg-slate-900 px-6 py-8 text-white shadow-lg">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div class="max-w-3xl">
          <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Overview</p>
          <h2 class="mt-2 text-4xl font-semibold tracking-tight">Generated results dashboard</h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300">This report highlights the riskiest documentation pages first, keeps folder rollups close at hand, and lets you jump between historical runs from the same generated dashboard.</p>
        </div>
        <div class="grid gap-3 rounded-3xl bg-white/10 p-4 text-sm text-slate-100 shadow-inner sm:grid-cols-2 xl:min-w-[22rem]">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-slate-300">Run ID</p>
            <p class="mt-1 font-mono text-sm">${escapeHtml(results.runId)}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-slate-300">Generated</p>
            <p class="mt-1">${escapeHtml(formatTimestamp(results.timestamp))}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-slate-300">Commit</p>
            <p class="mt-1">${shortSha ? `<code>${escapeHtml(shortSha)}</code>` : '—'}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-slate-300">Models</p>
            <p class="mt-1">${escapeHtml(results.models.pass1)} / ${escapeHtml(results.models.pass2)}</p>
          </div>
        </div>
      </div>
    </section>`;

  const summaryHtml = `
    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      ${renderStatCard('Overall health', healthBadge(results.overallHealth), 'text-slate-900')}
      ${renderStatCard('Docs analyzed', String(results.totals.docs), 'text-slate-900')}
      ${renderStatCard('Healthy docs', String(results.totals.healthy), 'text-emerald-700')}
      ${renderStatCard('Critical issues', String(results.totals.issues.critical), 'text-red-700')}
      ${renderStatCard('Major issues', String(results.totals.issues.major), 'text-amber-700')}
    </section>`;

  const priorityDocs = [...results.docs]
    .sort((a, b) => {
      const issueDelta = b.issues.length - a.issues.length;
      if (issueDelta !== 0) return issueDelta;
      return (a.healthScore ?? 101) - (b.healthScore ?? 101);
    })
    .slice(0, 8);

  const priorityDocsHtml = results.docs.length === 0
    ? `
      <section class="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
        <h3 class="text-xl font-semibold text-slate-900">No documents were analyzed in this run.</h3>
        <p class="mt-2 text-sm text-slate-500">The dashboard is ready, but there are no doc results to explore yet.</p>
      </section>`
    : `
      <section class="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-200 px-6 py-4">
          <h3 class="text-xl font-semibold text-slate-950">Priority docs</h3>
          <p class="mt-1 text-sm text-slate-500">Start with the pages carrying the most issues or the lowest health score.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th class="px-6 py-3">Document</th>
                <th class="px-6 py-3">Folder</th>
                <th class="px-6 py-3">Health</th>
                <th class="px-6 py-3">Status</th>
                <th class="px-6 py-3">Issues</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${priorityDocs.map(doc => `
                <tr class="hover:bg-slate-50">
                  <td class="px-6 py-4">
                    <a href="doc/${escapeHtml(doc.slug)}.html" class="font-semibold text-blue-700 hover:text-blue-900 hover:underline">${escapeHtml(doc.title)}</a>
                    <p class="mt-1 text-xs text-slate-500">${escapeHtml(doc.slug)}</p>
                  </td>
                  <td class="px-6 py-4 text-slate-600">${doc.parent ? `<a href="folder/${escapeHtml(doc.parent)}.html" class="hover:text-slate-900 hover:underline">${escapeHtml(doc.parent)}</a>` : 'Uncategorized'}</td>
                  <td class="px-6 py-4">${healthBadge(doc.healthScore)}</td>
                  <td class="px-6 py-4">${statusBadge(doc.status)}</td>
                  <td class="px-6 py-4 text-slate-600">${doc.issues.length} total · ${doc.issues.filter(issue => issue.severity === 'critical').length} critical</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;

  const folderOverviewHtml = tree.length === 0
    ? ''
    : `
      <section class="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div class="border-b border-slate-200 px-6 py-4">
          <h3 class="text-xl font-semibold text-slate-950">Folder overview</h3>
          <p class="mt-1 text-sm text-slate-500">Use folder rollups to find the sections of the docs site that need attention first.</p>
        </div>
        <div class="grid gap-4 p-6 xl:grid-cols-2">
          ${tree.map(node => `
            <a href="folder/${escapeHtml(node.parent)}.html" class="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-sm">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-lg font-semibold text-slate-950">${escapeHtml(node.label)}</p>
                  <p class="mt-1 text-sm text-slate-500">${node.docs.length} doc${node.docs.length !== 1 ? 's' : ''}</p>
                </div>
                ${healthBadge(node.folderHealth)}
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                ${statusBadge(node.folderStatus)}
                <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">${node.docs.reduce((count, doc) => count + doc.issues.length, 0)} issues</span>
              </div>
            </a>`).join('')}
        </div>
      </section>`;

  const usageHtml = results.usage
    ? `
      <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 class="text-xl font-semibold text-slate-950">Run metadata</h3>
        <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          ${renderStatCard('Input tokens', results.usage.inputTokens.toLocaleString(), 'text-slate-900')}
          ${renderStatCard('Output tokens', results.usage.outputTokens.toLocaleString(), 'text-slate-900')}
          ${renderStatCard('Cache read tokens', results.usage.cacheReadTokens.toLocaleString(), 'text-slate-900')}
          ${renderStatCard('Estimated cost (USD)', results.usage.estimatedCostUsd.toFixed(4), 'text-slate-900')}
        </div>
      </section>`
    : '';

  const body = [headerHtml, summaryHtml, priorityDocsHtml, folderOverviewHtml, usageHtml].join('');
  return renderDashboardLayout('Docs Health Monitor', nav, body);
}
