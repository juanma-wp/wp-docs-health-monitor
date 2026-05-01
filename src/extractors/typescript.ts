import ts from 'typescript';
import type { CodeFile } from '../types/mapping.js';
import type { CodeSource } from '../adapters/code-source/types.js';
import type {
  ExtractedFile,
  ExtractedMember,
  ExtractedSymbol,
  JSDocInfo,
  SymbolKind,
} from './types.js';

export type {
  ExtractedFile,
  ExtractedMember,
  ExtractedSymbol,
  JSDocInfo,
  SymbolKind,
} from './types.js';

function nodeText(node: ts.Node, source: ts.SourceFile): string {
  return node.getText(source);
}

function printType(node: ts.TypeNode | undefined, source: ts.SourceFile): string {
  return node ? nodeText(node, source) : 'unknown';
}

function printParams(params: ts.NodeArray<ts.ParameterDeclaration>, source: ts.SourceFile): string {
  return params
    .map(p => {
      const name = nodeText(p.name, source);
      const optional = p.questionToken ? '?' : '';
      const type = p.type ? `: ${nodeText(p.type, source)}` : '';
      const rest = p.dotDotDotToken ? '...' : '';
      return `${rest}${name}${optional}${type}`;
    })
    .join(', ');
}

function commentToString(
  comment: string | ts.NodeArray<ts.JSDocComment> | undefined,
): string {
  if (!comment) return '';
  if (typeof comment === 'string') return comment.trim();
  return comment.map(c => c.text ?? '').join('').trim();
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractJSDoc(node: ts.Node): JSDocInfo | undefined {
  // ts.getJSDocCommentsAndTags walks up to find associated JSDoc nodes.
  // For property signatures and method signatures, JSDoc is attached directly.
  const jsDocs = (node as { jsDoc?: ts.JSDoc[] }).jsDoc ?? [];
  if (jsDocs.length === 0) return undefined;

  const info: JSDocInfo = {};

  // Description: combine prose from all JSDoc blocks
  const descriptionParts: string[] = [];
  for (const doc of jsDocs) {
    const text = commentToString(doc.comment);
    if (text) descriptionParts.push(text);
  }
  if (descriptionParts.length > 0) {
    info.description = singleLine(descriptionParts.join(' '));
  }

  // Tags: pick out the ones that matter for doc validation
  const tags = ts.getJSDocTags(node);
  for (const tag of tags) {
    const tagName = tag.tagName.text;
    const value = singleLine(commentToString(tag.comment));
    if (tagName === 'default' && !info.default) info.default = value;
    else if (tagName === 'deprecated' && info.deprecated === undefined) info.deprecated = value;
    else if (tagName === 'since' && !info.since) info.since = value;
  }

  return Object.keys(info).length > 0 ? info : undefined;
}

function extractMember(
  m: ts.TypeElement,
  source: ts.SourceFile,
): ExtractedMember | null {
  if (ts.isPropertySignature(m) && m.name) {
    const name = nodeText(m.name, source);
    const optional = m.questionToken ? '?' : '';
    const type = printType(m.type, source);
    return {
      name,
      signature: `${name}${optional}: ${type}`,
      jsdoc: extractJSDoc(m),
    };
  }
  if (ts.isMethodSignature(m) && m.name) {
    const name = nodeText(m.name, source);
    const params = printParams(m.parameters, source);
    const ret = printType(m.type, source);
    return {
      name,
      signature: `${name}(${params}): ${ret}`,
      jsdoc: extractJSDoc(m),
    };
  }
  return null;
}

function extractFromStatement(
  stmt: ts.Statement,
  source: ts.SourceFile,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];

  // export function foo(...) { }
  // export async function foo(...) { }
  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    const name = stmt.name.text;
    const params = printParams(stmt.parameters, source);
    const ret = printType(stmt.type, source);
    symbols.push({
      kind: 'function',
      name,
      signature: `${name}(${params}): ${ret}`,
      jsdoc: extractJSDoc(stmt),
    });
    return symbols;
  }

  // export class Foo { }
  if (ts.isClassDeclaration(stmt) && stmt.name) {
    symbols.push({
      kind: 'class',
      name: stmt.name.text,
      signature: stmt.name.text,
      jsdoc: extractJSDoc(stmt),
    });
    return symbols;
  }

  // export type Foo = ...
  if (ts.isTypeAliasDeclaration(stmt)) {
    const name = stmt.name.text;
    const body = nodeText(stmt.type, source);
    symbols.push({
      kind: 'type',
      name,
      signature: `${name} = ${body}`,
      jsdoc: extractJSDoc(stmt),
    });
    return symbols;
  }

  // export interface Foo { }
  if (ts.isInterfaceDeclaration(stmt)) {
    const name = stmt.name.text;
    const members = stmt.members
      .map(m => extractMember(m, source))
      .filter((m): m is ExtractedMember => m !== null);
    symbols.push({
      kind: 'interface',
      name,
      signature: name,
      jsdoc: extractJSDoc(stmt),
      members,
    });
    return symbols;
  }

  // export enum Foo { }
  if (ts.isEnumDeclaration(stmt)) {
    symbols.push({
      kind: 'enum',
      name: stmt.name.text,
      signature: stmt.name.text,
      jsdoc: extractJSDoc(stmt),
    });
    return symbols;
  }

  // export const foo = ...
  // export const foo: Type = ...
  if (ts.isVariableStatement(stmt)) {
    const jsdoc = extractJSDoc(stmt);
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const name = decl.name.text;
      const type = decl.type
        ? nodeText(decl.type, source)
        : decl.initializer
          ? inferLiteralType(decl.initializer, source)
          : 'unknown';
      symbols.push({
        kind: 'const',
        name,
        signature: `${name}: ${type}`,
        jsdoc,
      });
    }
    return symbols;
  }

  // export { foo, bar } or export { foo as bar } from '...'
  // These are re-exports — we note the name but can't resolve the signature here.
  if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
    for (const el of stmt.exportClause.elements) {
      const name = el.name.text;
      symbols.push({ kind: 'const', name, signature: name });
    }
    return symbols;
  }

  return symbols;
}

function inferLiteralType(node: ts.Expression, source: ts.SourceFile): string {
  if (ts.isStringLiteral(node)) return 'string';
  if (ts.isNumericLiteral(node)) return 'number';
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const fn = node as ts.ArrowFunction | ts.FunctionExpression;
    const params = printParams(fn.parameters, source);
    const ret = fn.type ? nodeText(fn.type, source) : 'unknown';
    return `(${params}) => ${ret}`;
  }
  return 'unknown';
}

function isExported(stmt: ts.Statement): boolean {
  const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
  return mods?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

export function extractSymbolsFromSource(content: string, filePath: string): ExtractedSymbol[] {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const symbols: ExtractedSymbol[] = [];

  for (const stmt of source.statements) {
    if (!isExported(stmt)) continue;
    symbols.push(...extractFromStatement(stmt, source));
  }

  return symbols;
}

export async function extractSymbolsFromFiles(
  files: CodeFile[],
  codeSources: Record<string, CodeSource>,
): Promise<ExtractedFile[]> {
  const results: ExtractedFile[] = [];

  for (const file of files) {
    const source = codeSources[file.repo];
    if (!source) continue;

    const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
    if (!['ts', 'tsx', 'js', 'jsx'].includes(ext)) continue;

    try {
      const content = await source.readFile(file.path);
      const symbols = extractSymbolsFromSource(content, file.path);
      if (symbols.length > 0) {
        results.push({ repo: file.repo, path: file.path, symbols });
      }
    } catch {
      // Skip unreadable files — callers handle missing results
    }
  }

  return results;
}

function formatJSDocLines(jsdoc: JSDocInfo | undefined, indent: string): string[] {
  if (!jsdoc) return [];
  const lines: string[] = [];
  if (jsdoc.description) lines.push(`${indent}${jsdoc.description}`);
  if (jsdoc.default !== undefined) lines.push(`${indent}@default ${jsdoc.default}`);
  if (jsdoc.deprecated !== undefined) {
    lines.push(`${indent}@deprecated${jsdoc.deprecated ? ` ${jsdoc.deprecated}` : ''}`);
  }
  if (jsdoc.since) lines.push(`${indent}@since ${jsdoc.since}`);
  return lines;
}

export function formatSymbolsAsText(files: ExtractedFile[]): string {
  if (files.length === 0) return '';

  return files
    .map(f => {
      const header = `[${f.repo}] ${f.path}`;
      const lines: string[] = [header];

      for (const sym of f.symbols) {
        if (sym.kind === 'interface' && sym.members) {
          lines.push(`  ${sym.signature} {`);
          lines.push(...formatJSDocLines(sym.jsdoc, '    '));
          for (const member of sym.members) {
            lines.push(`    ${member.signature}`);
            lines.push(...formatJSDocLines(member.jsdoc, '      '));
          }
          lines.push('  }');
        } else {
          lines.push(`  ${sym.signature}`);
          lines.push(...formatJSDocLines(sym.jsdoc, '    '));
        }
      }

      return lines.join('\n');
    })
    .join('\n\n');
}
