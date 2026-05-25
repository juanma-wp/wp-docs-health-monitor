import {
  escapeHtml,
  formatTimestamp,
  healthBadge,
  htmlShell,
  type DashboardHistoryEntry,
} from './templates/shared.js';
import type { SiteRegistry } from '../types/meta.js';

function joinRel(dir: string, sub: string): string {
  return dir.endsWith('/') ? `${dir}${sub}` : `${dir}/${sub}`;
}

function shortCommit(sha: string | undefined): string {
  return typeof sha === 'string' && sha.length >= 7 ? sha.slice(0, 7) : '';
}

function countsLine(latest: DashboardHistoryEntry): string {
  const segs: string[] = [];
  if (typeof latest.docCount === 'number')      segs.push(`<span class="text-slate-700">${latest.docCount} docs</span>`);
  if (typeof latest.criticalIssues === 'number') segs.push(`<span class="text-red-700">${latest.criticalIssues} critical</span>`);
  if (typeof latest.majorIssues === 'number')   segs.push(`<span class="text-amber-700">${latest.majorIssues} major</span>`);
  if (typeof latest.minorIssues === 'number')   segs.push(`<span class="text-slate-500">${latest.minorIssues} minor</span>`);
  return segs.join(' <span class="text-slate-300">·</span> ');
}

function renderEmptyCard(name: string, message: string): string {
  return `
    <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-wide text-blue-700">${escapeHtml(name)}</p>
      <p class="mt-3 text-sm text-slate-500">${escapeHtml(message)}</p>
    </article>
  `;
}

function renderCard(
  name: string,
  dir: string,
  history: DashboardHistoryEntry[],
): string {
  if (history.length === 0) {
    return renderEmptyCard(name, 'No runs yet.');
  }

  const sorted = [...history].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest = sorted[0];
  const previous = sorted.slice(1);

  const commit = shortCommit(latest.commitSha);
  const commitTag = commit
    ? `<span class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">Analyzed <span class="text-slate-900">${escapeHtml(commit)}</span></span>`
    : '';

  const selectHtml = previous.length > 0
    ? `
      <div class="mt-4 border-t border-slate-100 pt-3">
        <label class="block text-xs font-medium text-slate-500" for="prev-${escapeHtml(dir)}">Previous runs</label>
        <select
          id="prev-${escapeHtml(dir)}"
          class="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
          onchange="if(this.value)window.location=this.value"
        >
          <option value="">Jump to a previous run…</option>
          ${previous.map(run => `
            <option value="${escapeHtml(joinRel(dir, `runs/${run.runId}/index.html`))}">
              ${escapeHtml(run.runId)} — ${escapeHtml(formatTimestamp(run.timestamp))}
            </option>
          `).join('')}
        </select>
      </div>
    `
    : '';

  const latestHref = joinRel(dir, 'index.html');

  return `
    <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <a href="${escapeHtml(latestHref)}" class="block hover:opacity-90">
        <p class="text-xs font-semibold uppercase tracking-wide text-blue-700">${escapeHtml(name)}</p>
        <div class="mt-2 flex items-start justify-between gap-3">
          <h2 class="font-mono text-lg font-semibold text-slate-900">${escapeHtml(latest.runId)}</h2>
          ${healthBadge(latest.overallHealth)}
        </div>
        <p class="mt-1 text-sm text-slate-500">${escapeHtml(formatTimestamp(latest.timestamp))}</p>
        ${commitTag ? `<p class="mt-2">${commitTag}</p>` : ''}
        <p class="mt-3 text-sm">${countsLine(latest)}</p>
      </a>
      ${selectHtml}
    </article>
  `;
}

export function renderMetaIndex(
  registry: SiteRegistry,
  histories: Map<string, DashboardHistoryEntry[] | undefined>,
): string {
  const cardsHtml = registry.sites.map(site => {
    const history = histories.get(site.id);
    if (history === undefined) {
      return renderEmptyCard(site.name, 'No history found.');
    }
    return renderCard(site.name, site.dir, history);
  }).join('');

  const body = `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-slate-950">WordPress Docs Health Monitor</h1>
      <p class="mt-1 text-sm text-slate-500">Published runs</p>
    </header>
    <section class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      ${cardsHtml}
    </section>
  `;

  return htmlShell('WordPress Docs Health Monitor', body);
}
