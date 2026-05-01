import ts from 'typescript';
import type { CodeFile } from '../types/mapping.js';
import type { CodeSource } from '../adapters/code-source/types.js';
import type { ExtractedFile, ExtractedSymbol, SymbolKind } from './types.js';

export type { ExtractedFile, ExtractedSymbol, SymbolKind } from './types.js';

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
    symbols.push({ kind: 'function', name, signature: `${name}(${params}): ${ret}` });
    return symbols;
  }

  // export class Foo { }
  if (ts.isClassDeclaration(stmt) && stmt.name) {
    symbols.push({ kind: 'class', name: stmt.name.text, signature: stmt.name.text });
    return symbols;
  }

  // export type Foo = ...
  // export interface Foo { }
  if (ts.isTypeAliasDeclaration(stmt)) {
    const name = stmt.name.text;
    const body = nodeText(stmt.type, source);
    symbols.push({ kind: 'type', name, signature: `${name} = ${body}` });
    return symbols;
  }

  if (ts.isInterfaceDeclaration(stmt)) {
    const name = stmt.name.text;
    const members = stmt.members.map(m => {
      if (ts.isPropertySignature(m) && m.name) {
        const propName = nodeText(m.name, source);
        const optional = m.questionToken ? '?' : '';
        const type = printType(m.type, source);
        return `  ${propName}${optional}: ${type}`;
      }
      if (ts.isMethodSignature(m) && m.name) {
        const methodName = nodeText(m.name, source);
        const params = printParams(m.parameters, source);
        const ret = printType(m.type, source);
        return `  ${methodName}(${params}): ${ret}`;
      }
      return null;
    }).filter(Boolean);
    symbols.push({ kind: 'interface', name, signature: `${name} {\n${members.join('\n')}\n}` });
    return symbols;
  }

  // export enum Foo { }
  if (ts.isEnumDeclaration(stmt)) {
    symbols.push({ kind: 'enum', name: stmt.name.text, signature: stmt.name.text });
    return symbols;
  }

  // export const foo = ...
  // export const foo: Type = ...
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const name = decl.name.text;
      const type = decl.type
        ? nodeText(decl.type, source)
        : decl.initializer
          ? inferLiteralType(decl.initializer, source)
          : 'unknown';
      symbols.push({ kind: 'const', name, signature: `${name}: ${type}` });
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

export function formatSymbolsAsText(files: ExtractedFile[]): string {
  if (files.length === 0) return '';

  return files
    .map(f => {
      const header = `[${f.repo}] ${f.path}`;
      const lines = f.symbols.map(s => `  ${s.signature}`);
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}
