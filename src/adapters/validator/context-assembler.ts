import type { Doc } from '../doc-source/types.js';
import type { CodeTiers, CodeFile } from '../../types/mapping.js';
import type { DocResult } from '../../types/results.js';
import type { CodeSource } from '../code-source/types.js';
import { extractSymbolsFromFiles } from '../../extractors/typescript.js';
import { extractPhpSymbolsFromFiles } from '../../extractors/php.js';
import { extractHooksFromFiles } from '../../extractors/hooks.js';
import { extractDefaultsFromFiles } from '../../extractors/defaults.js';
import { extractSchemasFromFiles, isSchemaFile } from '../../extractors/schemas.js';
import type { ExtractedFile, ExtractedHookFile, ExtractedDefaultFile, ExtractedSchema } from '../../extractors/types.js';

export type { ExtractedFile, ExtractedHookFile, ExtractedDefaultFile, ExtractedSchema };

// Budget for the source-code bulk passed to Pass 1. Primary-tier files
// always go in; secondary/context files stop being added once the
// cumulative estimate would exceed this. With 1M-context Sonnet 4.6
// and Opus 4.7, 200K leaves comfortable room for the system prompt
// (~2.5K), per-doc user prompt (~5–20K), structured extractor sections
// (~5–30K), and Pass 2 fetch_code rounds. Aligned with CLAUDE.md
// "spend on context" — a wider budget surfaces more drift candidates.
export const TOKEN_BUDGET = 200_000;

type FileBlock = {
  repo: string;
  path: string;
  content: string;
  tier: 'primary' | 'secondary' | 'context';
  lines?: [number, number];
};

export type AssembledContext = {
  fileBlocks: FileBlock[];
  relatedCode: DocResult['relatedCode'];
  estimatedTokens: number;
  diagnostics: string[];
  missingSymbols: string[];
  extractedSymbols: ExtractedFile[];
  extractedHooks: ExtractedHookFile[];
  extractedDefaults: ExtractedDefaultFile[];
  extractedSchemas: ExtractedSchema[];
};

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'php':
      return 'php';
    case 'css':
    case 'scss':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    default:
      return '';
  }
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// Match files whose path identifies them as tests:
//   - segments named `test`, `tests`, `__tests__` (e.g. `src/api/test/foo.js`,
//     `tests/phpunit/foo.php`, `src/__tests__/foo.ts`)
//   - filenames ending `.test.{js,jsx,ts,tsx}` or `.spec.{js,jsx,ts,tsx}`
//
// Used by the dropBodies path so test files survive even when the
// implementation Source Code bulk is omitted — their assertion strings
// and inline comments often carry drift evidence the structured
// extractors cannot capture.
export function isTestFile(path: string): boolean {
  return (
    /(^|\/)tests?\//i.test(path) ||
    /(^|\/)__tests__\//i.test(path) ||
    /\.test\.[jt]sx?$/i.test(path) ||
    /\.spec\.[jt]sx?$/i.test(path)
  );
}

// Backticked tokens that are JS / PHP primitive type names or literal values.
// These appear constantly in WordPress docs (e.g. ``Type: `string` ``, ``Default: `null` ``)
// and are NEVER actual exported identifiers. Excluding them halves the noise
// in `missingSymbols` without affecting real `nonexistent-name` detection.
const PRIMITIVE_LITERALS_DENYLIST = new Set([
  'true', 'false', 'null', 'undefined', 'void',
  'string', 'boolean', 'number', 'integer', 'object', 'array', 'function',
]);

// Normalise a backtick-captured token into the form the indexer keys on:
// bare identifiers, no namespace prefix, no call parens, no JSX brackets.
//
// Three transforms, applied in order:
//
//   1. JSX bracket unwrap. Backticked JSX references like `<PluginSidebar />`,
//      `<PluginSidebar>`, or `</PluginSidebar>` come out as the raw bracketed
//      string and never match the bare identifier in the symbol index. The
//      uppercase-required regex ensures we don't accidentally pick up generic
//      HTML elements (`<div>`, `<p>`) — JSX/React convention is component
//      names start uppercase, HTML elements lowercase.
//
//   2. Call-form strip. Doc tokens like `registerBlockVariation()` or
//      `wp.blocks.registerBlockVariation()` never match the index entry
//      `export const registerBlockVariation = (...)` (bare identifier) without
//      this. Separators handled: `.` (JS/TS dotted access), `::` (PHP static),
//      `->` (PHP instance) — the last segment after any of these is the
//      indexed identifier.
//
//   3. Bare tokens. `block.json`, `core/block`, `registerBlockType` are left
//      untouched — they may legitimately contain `.` or `/` and are matched
//      verbatim against the index.
function normalizeDocSymbol(raw: string): string {
  const jsxMatch = raw.match(/^<\/?\s*([A-Z][A-Za-z0-9_]*)\s*\/?>$/);
  if (jsxMatch) return jsxMatch[1];

  const callMatch = raw.match(/^(.+?)\s*\(.*\)\s*$/);
  if (!callMatch) return raw;
  const segments = callMatch[1].split(/\.|::|->/);
  return segments[segments.length - 1].trim();
}

// Push a candidate identifier through the denylist + normalize chain into the
// running set. Centralises the four-line guard pattern so every extraction
// source (backticks, headings, imports) shares the same gate.
function addSymbol(seen: Set<string>, raw: string): void {
  if (!raw) return;
  if (PRIMITIVE_LITERALS_DENYLIST.has(raw)) return;
  const normalized = normalizeDocSymbol(raw);
  if (!normalized) return;
  if (PRIMITIVE_LITERALS_DENYLIST.has(normalized)) return;
  seen.add(normalized);
}

// True when the heading text looks like an API identifier worth indexing.
// Filters plain-English titles ("Accessibility", "Tutorial") by requiring
// either multiple uppercase letters (CamelCase / PascalCase / camelCase) or
// a kebab/snake separator. WP_Block, useBlockProps, PluginSidebar, theme-json
// pass; Accessibility, Tutorial, Overview do not.
function isIdentifierLikeHeading(text: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(text)) return false;
  return /[A-Z].*[A-Z]/.test(text) || /[_-]/.test(text);
}

// Extract candidate symbols from doc markdown. Three sources, in order:
//
//   1. Inline backticked tokens: `registerBlockType`, `<PluginSidebar />`,
//      `wp.blocks.registerBlockType()`. The historical core source.
//
//   2. H1 headings whose title text is a single identifier-like token:
//      `# PluginSidebar`, `# useBlockProps`, `# theme-json`. Reference-style
//      docs (SlotFills, theme.json sub-pages) put the API name in the H1 and
//      then describe the API in prose without re-mentioning the name in
//      inline backticks. Without this, those docs surface zero symbols.
//
//   3. Imports inside fenced code blocks: JS/TS `import { X } from ...`
//      (including aliased and default forms) and PHP `use Foo\Bar\Baz;`. Usage
//      examples in fences literally name the API the doc is documenting, even
//      when no inline backticks reference it. Each fence is scanned; multiple
//      imports per fence are all collected.
//
// All three sources funnel through `addSymbol`, which applies the same
// primitive-denylist + normalize chain (JSX unwrap + call-form strip).
//
// Heading scope is H1 only by deliberate choice — H2/H3 in this corpus tend
// to be section labels ("Examples", "Location") or auto-generated selector
// names that don't help the validator (Pattern A docs handled via ignore).
export function extractDocSymbols(docContent: string): string[] {
  const seen = new Set<string>();

  // 1. Inline backticks
  for (const [, symbol] of docContent.matchAll(/`([^`\s][^`]*[^`\s]|[^`\s])`/g)) {
    addSymbol(seen, symbol);
  }

  // 2. H1 identifier-like headings
  for (const [, heading] of docContent.matchAll(/^#\s+(.+?)\s*$/gm)) {
    const trimmed = heading.trim();
    if (isIdentifierLikeHeading(trimmed)) addSymbol(seen, trimmed);
  }

  // 3. Imports inside fenced code blocks
  for (const [, fence] of docContent.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)) {
    // JS/TS named imports: `import { A, B as C, type D } from '...'`
    for (const [, body] of fence.matchAll(/import\s*(?:type\s+)?\{\s*([^}]+)\s*\}\s*from/g)) {
      for (const part of body.split(',')) {
        const cleaned = part.trim().replace(/^type\s+/, '');
        const name = cleaned.split(/\s+as\s+/)[0].trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) addSymbol(seen, name);
      }
    }
    // JS/TS default imports: `import X from '...'` / `import type X from '...'`
    for (const [, name] of fence.matchAll(/import\s+(?:type\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+from/g)) {
      addSymbol(seen, name);
    }
    // PHP `use Foo\Bar\Baz;` (optional leading backslash, optional `as alias`)
    for (const [, fqn] of fence.matchAll(/^\s*use\s+\\?([A-Za-z_][A-Za-z0-9_\\]*)(?:\s+as\s+\w+)?\s*;/gm)) {
      const last = fqn.split('\\').pop();
      if (last) addSymbol(seen, last);
    }
  }

  return [...seen];
}

// Return symbols that do not appear literally in any assembled source file
export function findMissingSymbols(symbols: string[], fileBlocks: FileBlock[]): string[] {
  const allCode = fileBlocks.map(fb => fb.content).join('\n');
  return symbols.filter(sym => !allCode.includes(sym));
}

export function formatContextForClaude(fileBlocks: FileBlock[]): string {
  return fileBlocks
    .map(fb => {
      const lang = inferLanguage(fb.path);
      const range = fb.lines ? `  (lines ${fb.lines[0]}-${fb.lines[1]})` : '';
      return `### [${fb.repo}] ${fb.path}${range}\n\`\`\`${lang}\n${fb.content}\n\`\`\``;
    })
    .join('\n\n');
}

export async function assembleContext(
  doc: Doc,
  codeTiers: CodeTiers,
  codeSources: Record<string, CodeSource>,
): Promise<AssembledContext> {
  const fileBlocks: FileBlock[] = [];
  const relatedCode: DocResult['relatedCode'] = [];
  const diagnostics: string[] = [];
  let cumulativeTokens = 0;
  let budgetExceeded = false;

  const tiers: Array<{ name: 'primary' | 'secondary' | 'context'; files: CodeFile[] }> = [
    { name: 'primary',   files: codeTiers.primary },
    { name: 'secondary', files: codeTiers.secondary },
    { name: 'context',   files: codeTiers.context },
  ];

  for (const { name: tierName, files } of tiers) {
    for (const file of files) {
      // Schema files (.json) are surfaced through the dedicated Schemas
      // section, not the Source Code bulk. Record as included in analysis
      // and skip the fileBlocks/budget path.
      if (isSchemaFile(file.path)) {
        relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: true });
        continue;
      }

      // If budget is already exceeded for non-primary tiers, mark as excluded
      if (budgetExceeded && tierName !== 'primary') {
        relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: false });
        continue;
      }

      let content: string;
      try {
        content = file.lines
          ? await codeSources[file.repo].readFile(file.path, file.lines[0], file.lines[1])
          : await codeSources[file.repo].readFile(file.path);
      } catch (err) {
        const msg = `Could not read ${tierName} file ${file.repo}:${file.path}`;
        diagnostics.push(msg);
        if (tierName === 'primary') {
          // Always attempt primary files; record diagnostic on failure
          relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: false });
        }
        continue;
      }

      const fileTokens = estimateTokens(content);

      // For secondary/context: stop adding if budget would be exceeded
      if (tierName !== 'primary' && cumulativeTokens + fileTokens > TOKEN_BUDGET) {
        budgetExceeded = true;
        relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: false });
        continue;
      }

      cumulativeTokens += fileTokens;
      fileBlocks.push({
        repo: file.repo,
        path: file.path,
        content,
        tier: tierName,
        ...(file.lines ? { lines: file.lines } : {}),
      });
      relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: true });
    }
  }

  const allMappedFiles = [
    ...codeTiers.primary,
    ...codeTiers.secondary,
    ...codeTiers.context,
  ];
  const tsSymbols  = await extractSymbolsFromFiles(allMappedFiles, codeSources);
  const phpSymbols = await extractPhpSymbolsFromFiles(allMappedFiles, codeSources);
  const extractedSymbols = [...tsSymbols, ...phpSymbols];
  const extractedHooks    = await extractHooksFromFiles(allMappedFiles, codeSources);
  const extractedDefaults = await extractDefaultsFromFiles(allMappedFiles, codeSources);
  const extractedSchemas  = await extractSchemasFromFiles(allMappedFiles, codeSources);

  const symbols = extractDocSymbols(doc.content);
  const missingSymbols = findMissingSymbols(symbols, fileBlocks);

  return {
    fileBlocks,
    relatedCode,
    estimatedTokens: cumulativeTokens,
    diagnostics,
    missingSymbols,
    extractedSymbols,
    extractedHooks,
    extractedDefaults,
    extractedSchemas,
  };
}
