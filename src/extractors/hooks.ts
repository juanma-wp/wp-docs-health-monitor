import type { CodeFile } from '../types/mapping.js';
import type { CodeSource } from '../adapters/code-source/types.js';
import type { ExtractedHook, ExtractedHookFile, HookKind } from './types.js';

export type { ExtractedHook, ExtractedHookFile, HookKind } from './types.js';

const PHP_PATTERN = /\b(apply_filters(?:_ref_array|_deprecated)?|do_action(?:_ref_array|_deprecated)?)\s*\(\s*(['"])([^'"\n]+?)\2\s*[,)]/g;
const JS_PATTERN  = /\b(applyFilters|doAction)\s*\(\s*(['"`])([^'"`$\n{}]+?)\2\s*[,)]/g;

const PHP_EXTS = new Set(['php']);
const JS_EXTS  = new Set(['js', 'jsx', 'ts', 'tsx']);

function callKind(call: string): HookKind {
  if (call.startsWith('apply_filters') || call === 'applyFilters') return 'filter';
  return 'action';
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractLine(content: string, index: number): string {
  let start = index;
  while (start > 0 && content.charCodeAt(start - 1) !== 10) start--;
  let end = index;
  while (end < content.length && content.charCodeAt(end) !== 10) end++;
  return content.slice(start, end).trim();
}

// Replace comments with whitespace of equal length so offsets and line
// numbers remain valid relative to the original source.
function blankComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1 + ' '.repeat(_m.length - p1.length));
}

export function extractHooksFromSource(content: string, filePath: string): ExtractedHook[] {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  let pattern: RegExp | null = null;
  if (PHP_EXTS.has(ext)) pattern = new RegExp(PHP_PATTERN.source, 'g');
  else if (JS_EXTS.has(ext)) pattern = new RegExp(JS_PATTERN.source, 'g');
  if (!pattern) return [];

  const masked = blankComments(content);
  const hooks: ExtractedHook[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const call = match[1];
    const name = match[3];
    if (!call || !name) continue;
    hooks.push({
      kind:   callKind(call),
      name,
      call,
      line:   lineNumberAt(content, match.index),
      source: extractLine(content, match.index),
    });
  }

  return hooks;
}

export async function extractHooksFromFiles(
  files: CodeFile[],
  codeSources: Record<string, CodeSource>,
): Promise<ExtractedHookFile[]> {
  const results: ExtractedHookFile[] = [];

  for (const file of files) {
    const source = codeSources[file.repo];
    if (!source) continue;

    const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
    if (!PHP_EXTS.has(ext) && !JS_EXTS.has(ext)) continue;

    try {
      const content = await source.readFile(file.path);
      const hooks = extractHooksFromSource(content, file.path);
      if (hooks.length > 0) {
        results.push({ repo: file.repo, path: file.path, hooks });
      }
    } catch {
      // Skip unreadable files — callers handle missing results
    }
  }

  return results;
}

export function formatHooksAsText(files: ExtractedHookFile[]): string {
  if (files.length === 0) return '';

  return files
    .map(f => {
      const header = `[${f.repo}] ${f.path}`;
      const lines = f.hooks.map(h => `  ${h.kind} @ L${h.line}: ${h.source}`);
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}
