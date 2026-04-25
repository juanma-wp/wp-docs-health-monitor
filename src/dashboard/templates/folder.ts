import type { TreeNode } from '../tree-builder.js';
import { escapeHtml, healthBadge, statusBadge, htmlShell } from './shared.js';

export function renderFolder(node: TreeNode): string {
  const header = `
    <div class="flex items-center gap-3 mb-6">
      <h1 class="text-2xl font-bold">${escapeHtml(node.label)}</h1>
      ${healthBadge(node.folderHealth)}
      ${statusBadge(node.folderStatus)}
    </div>`;

  const docRows = node.docs.map(doc => `
    <tr class="border-t hover:bg-gray-50">
      <td class="py-3 pr-4">
        <a href="../doc/${escapeHtml(doc.slug)}.html" class="text-blue-600 hover:underline font-medium">${escapeHtml(doc.title)}</a>
      </td>
      <td class="py-3 pr-4">${healthBadge(doc.healthScore)}</td>
      <td class="py-3 pr-4">${statusBadge(doc.status)}</td>
      <td class="py-3 text-sm text-gray-500">${doc.issues.length} issue${doc.issues.length !== 1 ? 's' : ''}</td>
    </tr>`).join('');

  const tableHtml = `
    <section class="bg-white rounded shadow overflow-hidden mb-8">
      <table class="w-full text-sm">
        <thead class="bg-gray-100 text-left text-xs uppercase text-gray-600">
          <tr>
            <th class="px-4 py-2">Document</th>
            <th class="px-4 py-2">Score</th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Issues</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 px-4">
          ${docRows}
        </tbody>
      </table>
    </section>`;

  const backLink = `<a href="../index.html" class="text-blue-600 hover:underline text-sm">← Back to index</a>`;

  const body = backLink + header + tableHtml;
  return htmlShell(node.label, body);
}
