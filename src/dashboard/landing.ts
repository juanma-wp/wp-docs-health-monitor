import { escapeHtml, healthBadge, htmlShell } from './templates/shared.js';

export interface LandingEntry {
  runId: string;
  timestamp: string;
  overallHealth: number;
  commitSha?: string;
  totals?: {
    docs: number;
    issues: { critical: number; major: number; minor: number };
  };
  estimatedCostUsd?: number;
  siteLabel?: string;
  href: string;
}

export interface LandingOptions {
  title?: string;
  subtitle?: string;
}

export function renderLanding(entries: LandingEntry[], opts: LandingOptions = {}): string {
  const title = opts.title ?? 'WordPress Docs Health Monitor';
  const subtitle = opts.subtitle ?? 'Per-run dashboards';

  const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const headerHtml = `
    <header class="mb-8">
      <h1 class="text-3xl font-bold mb-1">${escapeHtml(title)}</h1>
      <p class="text-gray-500 text-sm">${escapeHtml(subtitle)}</p>
    </header>`;

  const emptyHtml = `
    <section class="bg-white rounded shadow p-6 text-center text-gray-500">
      <p>No runs available yet. Run <code class="bg-gray-100 px-1 rounded">npm run analyze</code> to produce one.</p>
    </section>`;

  const cardsHtml = sorted.map(entry => {
    const shortSha = entry.commitSha ? entry.commitSha.slice(0, 7) : '';
    const date = escapeHtml(new Date(entry.timestamp).toLocaleString());
    const totalsLine = entry.totals
      ? `<div class="text-xs text-gray-500 mt-2">
           ${entry.totals.docs} docs ·
           <span class="text-red-600">${entry.totals.issues.critical} critical</span> ·
           <span class="text-yellow-700">${entry.totals.issues.major} major</span> ·
           <span class="text-gray-600">${entry.totals.issues.minor} minor</span>
         </div>`
      : '';
    const costLine = typeof entry.estimatedCostUsd === 'number'
      ? `<div class="text-xs text-gray-400 mt-1">Cost: $${entry.estimatedCostUsd.toFixed(2)}</div>`
      : '';
    const siteHtml = entry.siteLabel
      ? `<div class="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">${escapeHtml(entry.siteLabel)}</div>`
      : '';

    return `
      <a href="${escapeHtml(entry.href)}" class="block bg-white rounded shadow p-4 hover:shadow-md transition">
        ${siteHtml}
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold text-gray-900 truncate">${escapeHtml(entry.runId)}</div>
            <div class="text-xs text-gray-500 mt-1">${date}</div>
            ${shortSha ? `<div class="text-xs text-gray-400 mt-1">Analyzed <code class="bg-gray-100 px-1 rounded">${escapeHtml(shortSha)}</code></div>` : ''}
          </div>
          <div class="flex-shrink-0">${healthBadge(entry.overallHealth)}</div>
        </div>
        ${totalsLine}
        ${costLine}
      </a>`;
  }).join('');

  const gridHtml = sorted.length > 0
    ? `<section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${cardsHtml}</section>`
    : emptyHtml;

  return htmlShell(title, headerHtml + gridHtml);
}
