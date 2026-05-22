import type { TreeNode } from '../tree-builder.js';
import { escapeHtml, healthBadge, statusBadge, renderDashboardLayout, type DashboardNav } from './shared.js';

function statCard(label: string, value: string): string {
  return `
    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${label}</p>
      <div class="mt-3 text-sm font-medium text-slate-900">${value}</div>
    </div>`;
}

export function renderFolder(node: TreeNode, nav: DashboardNav): string {
  const issueCount = node.docs.reduce((count, doc) => count + doc.issues.length, 0);
  const criticalDocs = node.docs.filter(doc => doc.status === 'critical').length;

  const header = `
    <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <a href="../index.html" class="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">← Back to run overview</a>
      <div class="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Folder rollup</p>
          <h2 class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">${escapeHtml(node.label)}</h2>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${healthBadge(node.folderHealth)}
          ${statusBadge(node.folderStatus)}
        </div>
      </div>
      <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        ${statCard('Docs in folder', `${node.docs.length}`)}
        ${statCard('Issues', `${issueCount} total`)}
        ${statCard('Critical docs', `${criticalDocs}`)}
        ${statCard('Lowest score', `${node.docs[0]?.healthScore ?? 'N/A'}`)}
      </div>
    </section>`;

  const docRows = node.docs.map(doc => `
    <tr class="hover:bg-slate-50">
      <td class="px-6 py-4">
        <a href="../doc/${escapeHtml(doc.slug)}.html" class="font-semibold text-blue-700 hover:text-blue-900 hover:underline">${escapeHtml(doc.title)}</a>
        <p class="mt-1 text-xs text-slate-500">${escapeHtml(doc.slug)}</p>
      </td>
      <td class="px-6 py-4">${healthBadge(doc.healthScore)}</td>
      <td class="px-6 py-4">${statusBadge(doc.status)}</td>
      <td class="px-6 py-4 text-sm text-slate-600">${doc.issues.length} issue${doc.issues.length !== 1 ? 's' : ''}</td>
    </tr>`).join('');

  const tableHtml = `
    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <tr>
            <th class="px-6 py-3">Document</th>
            <th class="px-6 py-3">Score</th>
            <th class="px-6 py-3">Status</th>
            <th class="px-6 py-3">Issues</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${docRows}
        </tbody>
      </table>
    </section>`;

  const body = header + tableHtml;
  return renderDashboardLayout(node.label, nav, body);
}
