import type { DocResult, Issue } from '../../types/results.js';
import { escapeHtml, inlineCode, renderSuggestion, healthBadge, statusBadge, formatTimestamp, renderDashboardLayout, type DashboardNav } from './shared.js';

const SEVERITY_ORDER: Record<Issue['severity'], number> = { critical: 0, major: 1, minor: 2 };

function githubUrl(repoUrls: Record<string, string>, repoRefs: Record<string, string>, codeRepo: string, codeFile: string): string | null {
  const base = repoUrls[codeRepo];
  const ref = repoRefs[codeRepo];
  if (!base || !ref) return null;
  return `${base}/blob/${ref}/${codeFile}`;
}

function renderIssue(issue: Issue, repoUrls: Record<string, string>, repoRefs: Record<string, string>): string {
  const confidence = `${Math.round(issue.confidence * 100)}%`;
  const severityClass = issue.severity === 'critical'
    ? 'border-l-red-500 bg-red-50'
    : issue.severity === 'major'
      ? 'border-l-yellow-500 bg-yellow-50'
      : 'border-l-gray-400 bg-gray-50';

  const url = githubUrl(repoUrls, repoRefs, issue.evidence.codeRepo, issue.evidence.codeFile);
  const fileLabel = `${escapeHtml(issue.evidence.codeRepo)}:${escapeHtml(issue.evidence.codeFile)}`;
  const fileLink = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="hover:underline text-blue-600">${fileLabel}</a>`
    : fileLabel;

  return `
    <div class="border-l-4 ${severityClass} pl-4 py-3 mb-4 rounded-r">
      <div class="flex items-center gap-2 mb-2">
        <span class="font-semibold text-sm uppercase tracking-wide">${escapeHtml(issue.severity)}</span>
        <span class="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">${escapeHtml(issue.type)}</span>
        <span class="text-xs text-gray-400 ml-auto">confidence: ${escapeHtml(confidence)}</span>
      </div>
      <blockquote class="border-l-4 border-blue-300 bg-blue-50 px-3 py-2 mb-2 text-sm italic text-gray-700">
        ${inlineCode(issue.evidence.docSays)}
      </blockquote>
      <div class="mb-2">
        <p class="text-xs text-gray-500 mb-1">${fileLink}</p>
        <pre class="bg-gray-100 text-sm rounded px-3 py-2 overflow-x-auto whitespace-pre-wrap"><code>${escapeHtml(issue.evidence.codeSays)}</code></pre>
      </div>
      <div class="bg-blue-100 border border-blue-200 rounded px-3 py-2 text-sm text-blue-900 leading-relaxed">
        💡 ${renderSuggestion(issue.suggestion)}
      </div>
    </div>`;
}

function statCard(label: string, value: string): string {
  return `
    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${label}</p>
      <div class="mt-3 text-sm font-medium text-slate-900">${value}</div>
    </div>`;
}

export function renderDoc(doc: DocResult, repoUrls: Record<string, string>, repoRefs: Record<string, string>, nav: DashboardNav): string {
  const breadcrumb = `
    <nav class="text-sm text-slate-500">
      <a href="../index.html" class="font-medium text-blue-700 hover:text-blue-900 hover:underline">Run overview</a>
      ${doc.parent ? ` &rsaquo; <a href="../folder/${escapeHtml(doc.parent)}.html" class="hover:underline text-blue-600">${escapeHtml(doc.parent)}</a>` : ''}
      &rsaquo; <span>${escapeHtml(doc.title)}</span>
    </nav>`;

  const header = `
    <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      ${breadcrumb}
      <div class="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <h2 class="text-3xl font-semibold tracking-tight text-slate-950">${escapeHtml(doc.title)}</h2>
          <a href="${escapeHtml(doc.sourceUrl)}" class="mt-2 inline-flex items-center text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline" target="_blank" rel="noopener noreferrer">${escapeHtml(doc.sourceUrl)}</a>
        </div>
        <div class="flex flex-wrap items-center gap-2 xl:justify-end">
          ${healthBadge(doc.healthScore)}
          ${statusBadge(doc.status)}
        </div>
      </div>
      <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        ${statCard('Issues', `${doc.issues.length} total`)}
        ${statCard('Diagnostics', `${doc.diagnostics.length} warning${doc.diagnostics.length === 1 ? '' : 's'}`)}
        ${statCard('Related code', `${doc.relatedCode.length} file${doc.relatedCode.length === 1 ? '' : 's'}`)}
        ${statCard('Analyzed', escapeHtml(formatTimestamp(doc.analyzedAt)))}
      </div>
    </section>`;

  const sortedIssues = [...doc.issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const issuesHtml = sortedIssues.length > 0
    ? `<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h3 class="text-xl font-semibold text-slate-950">Issues</h3>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">${sortedIssues.length} total</span>
        </div>
        ${sortedIssues.map(i => renderIssue(i, repoUrls, repoRefs)).join('')}
      </section>`
    : `<section class="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm"><p class="font-medium text-emerald-800">✅ No issues found for this document.</p></section>`;

  const positivesHtml = doc.positives.length > 0
    ? `<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 class="text-xl font-semibold text-slate-950">What is already accurate</h3>
        <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
          ${doc.positives.map(p => `<li>${inlineCode(p)}</li>`).join('')}
        </ul>
      </section>`
    : '';

  const relatedCodeHtml = doc.relatedCode.length > 0
    ? `<section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 class="text-xl font-semibold text-slate-950">Related code</h3>
        <ul class="mt-4 space-y-2 text-sm">
          ${doc.relatedCode.map(rc => {
            const tierClass = rc.tier === 'primary' ? 'text-slate-900 font-medium' : 'text-slate-500';
            const included = rc.includedInAnalysis ? '✓' : '✗';
            return `<li class="rounded-2xl bg-slate-50 px-4 py-3 ${tierClass}"><code>${escapeHtml(rc.repo)}:${escapeHtml(rc.file)}</code> <span class="ml-2 text-xs">[${rc.tier}] ${included}</span></li>`;
          }).join('')}
        </ul>
      </section>`
    : '';

  const diagnosticsHtml = doc.diagnostics.length > 0
    ? `<section class="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h3 class="text-xl font-semibold text-amber-950">Diagnostics</h3>
        <ul class="mt-4 space-y-2 text-sm text-amber-900">
          ${doc.diagnostics.map(d => `<li>⚠️ ${escapeHtml(d)}</li>`).join('')}
        </ul>
      </section>`
    : '';

  const footer = `
    <footer class="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
      <p>Analyzed: ${escapeHtml(formatTimestamp(doc.analyzedAt))}</p>
      <div class="mt-4">
        <a href="../index.html" class="font-medium text-blue-700 hover:text-blue-900 hover:underline">← Back to run overview</a>
      </div>
    </footer>
  `;

  const body = header + issuesHtml + positivesHtml + relatedCodeHtml + diagnosticsHtml + footer;
  return renderDashboardLayout(doc.title, nav, body);
}
