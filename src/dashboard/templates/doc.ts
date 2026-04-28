import type { DocResult, Issue } from '../../types/results.js';
import { escapeHtml, inlineCode, renderSuggestion, healthBadge, statusBadge, htmlShell } from './shared.js';

const SEVERITY_ORDER: Record<Issue['severity'], number> = { critical: 0, major: 1, minor: 2 };

function githubUrl(repoUrls: Record<string, string>, commitSha: string, codeRepo: string, codeFile: string): string | null {
  const base = repoUrls[codeRepo];
  if (!base || !commitSha) return null;
  return `${base}/blob/${commitSha}/${codeFile}`;
}

function renderIssue(issue: Issue, repoUrls: Record<string, string>, commitSha: string): string {
  const confidence = `${Math.round(issue.confidence * 100)}%`;
  const severityClass = issue.severity === 'critical'
    ? 'border-l-red-500 bg-red-50'
    : issue.severity === 'major'
      ? 'border-l-yellow-500 bg-yellow-50'
      : 'border-l-gray-400 bg-gray-50';

  const url = githubUrl(repoUrls, commitSha, issue.evidence.codeRepo, issue.evidence.codeFile);
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

export function renderDoc(doc: DocResult, repoUrls: Record<string, string>): string {
  const breadcrumb = `
    <nav class="text-sm text-gray-500 mb-6">
      <a href="../index.html" class="hover:underline text-blue-600">Index</a>
      ${doc.parent ? ` &rsaquo; <a href="../folder/${escapeHtml(doc.parent)}.html" class="hover:underline text-blue-600">${escapeHtml(doc.parent)}</a>` : ''}
      &rsaquo; <span>${escapeHtml(doc.title)}</span>
    </nav>`;

  const header = `
    <div class="flex items-start justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold mb-1">${escapeHtml(doc.title)}</h1>
        <a href="${escapeHtml(doc.sourceUrl)}" class="text-blue-600 text-sm hover:underline" target="_blank" rel="noopener noreferrer">${escapeHtml(doc.sourceUrl)}</a>
      </div>
      <div class="flex flex-col items-end gap-1 ml-4 shrink-0">
        ${healthBadge(doc.healthScore)}
        ${statusBadge(doc.status)}
      </div>
    </div>`;

  const sortedIssues = [...doc.issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const issuesHtml = sortedIssues.length > 0
    ? `<section class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Issues (${sortedIssues.length})</h2>
        ${sortedIssues.map(i => renderIssue(i, repoUrls, doc.commitSha)).join('')}
      </section>`
    : `<section class="mb-8"><p class="text-green-700 font-medium">✅ No issues found.</p></section>`;

  const positivesHtml = doc.positives.length > 0
    ? `<section class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Positives</h2>
        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
          ${doc.positives.map(p => `<li>${inlineCode(p)}</li>`).join('')}
        </ul>
      </section>`
    : '';

  const relatedCodeHtml = doc.relatedCode.length > 0
    ? `<section class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Related Code</h2>
        <ul class="space-y-1 text-sm">
          ${doc.relatedCode.map(rc => {
            const tierClass = rc.tier === 'primary' ? 'text-gray-900 font-medium' : 'text-gray-500';
            const included = rc.includedInAnalysis ? '✓' : '✗';
            return `<li class="${tierClass}"><code>${escapeHtml(rc.repo)}:${escapeHtml(rc.file)}</code> <span class="text-xs">[${rc.tier}] ${included}</span></li>`;
          }).join('')}
        </ul>
      </section>`
    : '';

  const diagnosticsHtml = doc.diagnostics.length > 0
    ? `<section class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Diagnostics</h2>
        <ul class="space-y-1 text-sm text-yellow-800 bg-yellow-50 p-3 rounded">
          ${doc.diagnostics.map(d => `<li>⚠️ ${escapeHtml(d)}</li>`).join('')}
        </ul>
      </section>`
    : '';

  const footer = `
    <footer class="mt-8 pt-4 border-t text-xs text-gray-400">
      Commit: <code>${escapeHtml(doc.commitSha)}</code> &nbsp;·&nbsp; Analyzed: ${escapeHtml(doc.analyzedAt)}
    </footer>
    <div class="mt-4">
      <a href="../index.html" class="text-blue-600 hover:underline text-sm">← Back to index</a>
    </div>`;

  const body = breadcrumb + header + issuesHtml + positivesHtml + relatedCodeHtml + diagnosticsHtml + footer;
  return htmlShell(doc.title, body);
}
