import type { CodeFile } from '../types/mapping.js';
import type { CodeSource } from '../adapters/code-source/types.js';
import type { ExtractedDefault, ExtractedDefaultFile, DefaultPattern } from './types.js';

export type { ExtractedDefault, ExtractedDefaultFile, DefaultPattern } from './types.js';

const PHP_EXTS = new Set(['php']);
const JS_EXTS  = new Set(['js', 'jsx', 'ts', 'tsx']);

const OBJECT_SPREAD_MAX_CHARS = 600;
const PRECEDING_LINES_FOR_DECL = 6;

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function walkToMatchingClose(
  content: string,
  openIdx: number,
  openCh: number,
  closeCh: number,
): number {
  let depth = 1;
  let i = openIdx + 1;
  while (i < content.length && depth > 0) {
    const c = content.charCodeAt(i);
    if (c === openCh) depth++;
    else if (c === closeCh) depth--;
    i++;
  }
  return depth === 0 ? i : -1;
}

function startOfLineNBefore(content: string, idx: number, n: number): number {
  let pos = idx;
  let count = 0;
  while (pos > 0 && count < n) {
    pos--;
    if (content.charCodeAt(pos) === 10) count++;
  }
  return pos;
}

function findWpParseArgs(content: string): ExtractedDefault[] {
  const results: ExtractedDefault[] = [];
  const PATTERN = /\bwp_parse_args\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = PATTERN.exec(content)) !== null) {
    const openIdx = match.index + match[0].length - 1;
    const endIdx  = walkToMatchingClose(content, openIdx, 40, 41);
    if (endIdx < 0) continue;

    const beforeStart = startOfLineNBefore(content, match.index, PRECEDING_LINES_FOR_DECL);
    const block = content.slice(beforeStart, endIdx).trim();
    const line  = lineNumberAt(content, match.index);

    results.push({ pattern: 'wp_parse_args', line, source: block });
  }
  return results;
}

function findObjectSpreadLiterals(content: string): ExtractedDefault[] {
  const results: ExtractedDefault[] = [];
  const PATTERN = /(?:const|let|var)\s+\w+\s*=\s*\{|return\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = PATTERN.exec(content)) !== null) {
    const openIdx = match.index + match[0].length - 1;
    const endIdx  = walkToMatchingClose(content, openIdx, 123, 125);
    if (endIdx < 0) continue;

    const block = content.slice(openIdx, endIdx);
    if (block.length > OBJECT_SPREAD_MAX_CHARS) continue;
    if (!/\.\.\./.test(block)) continue;
    if (!/\b\w+\s*:\s*[^,{}]+/.test(block)) continue;

    const line = lineNumberAt(content, openIdx);
    results.push({ pattern: 'object-spread', line, source: block.trim() });
  }
  return results;
}

export function extractDefaultsFromSource(content: string, filePath: string): ExtractedDefault[] {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (PHP_EXTS.has(ext)) return findWpParseArgs(content);
  if (JS_EXTS.has(ext))  return findObjectSpreadLiterals(content);
  return [];
}

export async function extractDefaultsFromFiles(
  files: CodeFile[],
  codeSources: Record<string, CodeSource>,
): Promise<ExtractedDefaultFile[]> {
  const results: ExtractedDefaultFile[] = [];
  for (const file of files) {
    const source = codeSources[file.repo];
    if (!source) continue;
    const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
    if (!PHP_EXTS.has(ext) && !JS_EXTS.has(ext)) continue;
    try {
      const content = await source.readFile(file.path);
      const defaults = extractDefaultsFromSource(content, file.path);
      if (defaults.length > 0) {
        results.push({ repo: file.repo, path: file.path, defaults });
      }
    } catch {
      // Skip unreadable files — callers handle missing results
    }
  }
  return results;
}

export function formatDefaultsAsText(files: ExtractedDefaultFile[]): string {
  if (files.length === 0) return '';
  return files
    .map(f => {
      const header = `[${f.repo}] ${f.path}`;
      const blocks = f.defaults.map(d => {
        const indented = d.source.split('\n').map(l => `    ${l}`).join('\n');
        return `  ${d.pattern} @ L${d.line}:\n${indented}`;
      });
      return [header, ...blocks].join('\n\n');
    })
    .join('\n\n');
}
