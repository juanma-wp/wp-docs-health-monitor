import type { Issue } from '../../types/results.js';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function healthBadge(score: number | null): string {
  if (score === null) return `<span class="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-gray-100 text-gray-500">N/A</span>`;
  if (score >= 85) return `<span class="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-green-100 text-green-800">${score}</span>`;
  if (score >= 60) return `<span class="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-yellow-100 text-yellow-800">${score}</span>`;
  return `<span class="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-red-100 text-red-800">${score}</span>`;
}

export function healthScoreText(score: number | null): string {
  if (score === null)  return 'text-slate-400';
  if (score >= 85)     return 'text-emerald-700';
  if (score >= 60)     return 'text-amber-700';
  return 'text-red-700';
}

export function healthScoreSurface(score: number | null): string {
  if (score === null)  return 'border-slate-200 bg-slate-50';
  if (score >= 85)     return 'border-emerald-200 bg-emerald-50';
  if (score >= 60)     return 'border-amber-200 bg-amber-50';
  return 'border-red-200 bg-red-50';
}

export type IssueBreakdown = { critical: number; major: number; minor: number };

export function issueBreakdown(issues: Issue[]): IssueBreakdown {
  return {
    critical: issues.filter(i => i.severity === 'critical').length,
    major:    issues.filter(i => i.severity === 'major').length,
    minor:    issues.filter(i => i.severity === 'minor').length,
  };
}

export function renderIssueBreakdown(b: IssueBreakdown): string {
  const seg = (n: number, label: string, activeColor: string): string => {
    const numColor   = n > 0 ? activeColor    : 'text-slate-400';
    const labelColor = n > 0 ? 'text-slate-600' : 'text-slate-400';
    return `<span class="whitespace-nowrap"><span class="font-medium ${numColor}">${n}</span>&nbsp;<span class="${labelColor}">${label}</span></span>`;
  };
  return `
    <span class="inline-flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      ${seg(b.critical, 'critical', 'text-red-700')}
      ${seg(b.major,    'major',    'text-amber-700')}
      ${seg(b.minor,    'minor',    'text-slate-700')}
    </span>`;
}

export function statusBadge(status: string): string {
  if (status === 'healthy') return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">healthy</span>`;
  if (status === 'needs-attention') return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">needs-attention</span>`;
  if (status === 'not-mapped') return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">not mapped</span>`;
  return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">critical</span>`;
}

// Render basic inline markdown: backtick code and **bold**. Safe: escapes HTML first.
export function inlineCode(str: string): string {
  return escapeHtml(str)
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-gray-800 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// Render a suggestion: first sentence as summary, followed by a <ul> if bullet lines are present.
export function renderSuggestion(str: string): string {
  const lines = str.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => l.startsWith('- '));
  const prose = lines.filter(l => !l.startsWith('- '));

  const proseHtml = prose.map(l => `<p class="mb-2">${inlineCode(l)}</p>`).join('');
  const listHtml = bullets.length > 0
    ? `<ul class="list-disc list-inside space-y-1 mt-2">${bullets.map(l => `<li>${inlineCode(l.slice(2))}</li>`).join('')}</ul>`
    : '';

  return proseHtml + listHtml;
}

export function tailwindScript(): string {
  return `<script src="https://cdn.tailwindcss.com"></script>`;
}

export type DashboardHistoryEntry = {
  runId: string;
  timestamp: string;
  overallHealth: number;
  docCount?: number;
  criticalIssues?: number;
  majorIssues?: number;
  minorIssues?: number;
  commitSha?: string;
};

export type DashboardRunLink = DashboardHistoryEntry & {
  href: string;
  isCurrent: boolean;
  isLatest: boolean;
};

export type DashboardNav = {
  currentRunId: string;
  latestRunId: string;
  latestRunHref: string | null;
  metaIndexHref: string | null;
  history: DashboardRunLink[];
  disclaimer: string;
};

export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

export function renderDashboardLayout(title: string, nav: DashboardNav, content: string): string {
  const historyHtml = nav.history.length > 0
    ? nav.history.map(run => `
        <a
          href="${escapeHtml(run.href)}"
          class="block rounded-2xl border px-4 py-3 transition ${run.isCurrent ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-semibold text-slate-900">${escapeHtml(run.runId)}</p>
              <p class="text-xs text-slate-500">${escapeHtml(formatTimestamp(run.timestamp))}</p>
            </div>
            ${healthBadge(run.overallHealth)}
          </div>
          <div class="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            ${run.isLatest ? '<span class="rounded-full bg-slate-900 px-2 py-1 font-medium text-white">latest</span>' : ''}
            ${run.isCurrent ? '<span class="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-800">open</span>' : ''}
            ${typeof run.docCount === 'number' ? `<span class="rounded-full bg-slate-100 px-2 py-1">${run.docCount} docs</span>` : ''}
            ${typeof run.criticalIssues === 'number' ? `<span class="rounded-full bg-red-100 px-2 py-1 text-red-800">${run.criticalIssues} critical</span>` : ''}
            ${typeof run.majorIssues === 'number' ? `<span class="rounded-full bg-amber-100 px-2 py-1 text-amber-800">${run.majorIssues} major</span>` : ''}
          </div>
        </a>
      `).join('')
    : '<p class="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">No previous reports available yet.</p>';

  const latestLinkHtml = nav.latestRunHref
    ? `<a href="${escapeHtml(nav.latestRunHref)}" class="mt-2 inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Go to latest dashboard</a>`
    : '';

  const metaIndexLinkHtml = nav.metaIndexHref
    ? `<a href="${escapeHtml(nav.metaIndexHref)}" class="inline-flex items-center text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline">← All sites</a>`
    : '';

  return htmlShell(title, `
    <div class="lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8">
      <aside class="mb-8 lg:sticky lg:top-6 lg:mb-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
        <div class="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div>
            ${metaIndexLinkHtml ? `<div class="mb-2">${metaIndexLinkHtml}</div>` : ''}
            <p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Report explorer</p>
            <h1 class="mt-2 text-2xl font-semibold text-slate-950">Docs Health Monitor</h1>
            <p class="mt-2 text-sm text-slate-600">Browse the latest report, jump to historical runs, and inspect changes without leaving the generated site.</p>
          </div>
          <div class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current report</p>
            <p class="mt-2 font-mono text-sm text-slate-900">${escapeHtml(nav.currentRunId)}</p>
            ${latestLinkHtml}
          </div>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-slate-900">Previous runs</h2>
              <span class="text-xs text-slate-500">${nav.history.length} total</span>
            </div>
            <div class="space-y-3">
              ${historyHtml}
            </div>
          </div>
        </div>
      </aside>
      <main class="min-w-0 space-y-6">
        ${nav.disclaimer ? `
          <aside class="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p><span class="mr-1" aria-hidden="true">ℹ️</span><span class="font-semibold">Heads-up:</span> ${escapeHtml(nav.disclaimer)}</p>
          </aside>` : ''}
        ${content}
      </main>
    </div>
  `);
}

export function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  ${tailwindScript()}
</head>
<body class="bg-gray-50 text-gray-900 min-h-screen">
  <div class="mx-auto w-full max-w-screen-2xl px-4 py-8 xl:px-6 2xl:px-8">
    ${body}
  </div>
</body>
</html>`;
}
