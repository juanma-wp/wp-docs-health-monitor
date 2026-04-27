import type { RunResults } from '../../types/results.js';
import type { TreeNode } from '../tree-builder.js';
import { escapeHtml, healthBadge, statusBadge, htmlShell } from './shared.js';

export function renderIndex(results: RunResults, tree: TreeNode[]): string {
  const commitSha = results.docs[0]?.commitSha ?? '';
  const shortSha = commitSha ? commitSha.slice(0, 7) : '';

  const headerHtml = `
    <header class="mb-8">
      <h1 class="text-3xl font-bold mb-1">WordPress Docs Health Monitor</h1>
      <p class="text-gray-500 text-sm">
        Run: <code class="bg-gray-100 px-1 rounded">${escapeHtml(results.runId)}</code>
        &nbsp;·&nbsp;
        ${escapeHtml(new Date(results.timestamp).toLocaleString())}
        ${shortSha ? `&nbsp;·&nbsp; Analyzed against <code class="bg-gray-100 px-1 rounded">${escapeHtml(shortSha)}</code>` : ''}
      </p>
    </header>`;

  const summaryHtml = `
    <section class="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="bg-white rounded shadow p-4 text-center">
        <div class="text-3xl font-bold">${healthBadge(results.overallHealth)}</div>
        <div class="text-xs text-gray-500 mt-1">Overall Health</div>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <div class="text-3xl font-bold text-gray-800">${results.totals.docs}</div>
        <div class="text-xs text-gray-500 mt-1">Docs Analyzed</div>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <div class="text-3xl font-bold text-red-600">${results.totals.issues.critical}</div>
        <div class="text-xs text-gray-500 mt-1">Critical Issues</div>
      </div>
      <div class="bg-white rounded shadow p-4 text-center">
        <div class="text-3xl font-bold text-yellow-600">${results.totals.issues.major}</div>
        <div class="text-xs text-gray-500 mt-1">Major Issues</div>
      </div>
    </section>`;

  const treeHtml = tree.map(node => {
    const docRows = node.docs.map(doc => `
        <tr class="border-t">
          <td class="py-2 pr-4">
            <a href="doc/${escapeHtml(doc.slug)}.html" class="text-blue-600 hover:underline">${escapeHtml(doc.title)}</a>
          </td>
          <td class="py-2 pr-4">${healthBadge(doc.healthScore)}</td>
          <td class="py-2">${statusBadge(doc.status)}</td>
        </tr>`).join('');

    return `
    <section class="mb-6 bg-white rounded shadow overflow-hidden">
      <div class="px-4 py-3 bg-gray-100 flex items-center gap-3 border-b">
        <a href="folder/${escapeHtml(node.parent)}.html" class="font-semibold text-blue-700 hover:underline">${escapeHtml(node.label)}</a>
        ${healthBadge(node.folderHealth)}
        ${statusBadge(node.folderStatus)}
      </div>
      <table class="w-full px-4 py-2 text-sm">
        <tbody class="divide-y divide-gray-100">
          ${docRows}
        </tbody>
      </table>
    </section>`;
  }).join('');

  const body = headerHtml + summaryHtml + treeHtml;
  return htmlShell('Docs Health Monitor', body);
}
