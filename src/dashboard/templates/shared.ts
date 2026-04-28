export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function healthBadge(score: number): string {
  if (score >= 85) return `<span class="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-green-100 text-green-800">${score}</span>`;
  if (score >= 60) return `<span class="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-yellow-100 text-yellow-800">${score}</span>`;
  return `<span class="inline-block px-2 py-0.5 rounded text-sm font-semibold bg-red-100 text-red-800">${score}</span>`;
}

export function statusBadge(status: string): string {
  if (status === 'healthy') return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">healthy</span>`;
  if (status === 'needs-attention') return `<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">needs-attention</span>`;
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
  <div class="max-w-5xl mx-auto px-4 py-8">
    ${body}
  </div>
</body>
</html>`;
}
