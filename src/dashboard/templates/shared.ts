function escapeHtml(str: string): string {
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

export { escapeHtml };
