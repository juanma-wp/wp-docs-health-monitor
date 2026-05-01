import phpParser from 'php-parser';
import type { CodeFile } from '../types/mapping.js';
import type { CodeSource } from '../adapters/code-source/types.js';
import type { ExtractedSymbol, ExtractedFile } from './types.js';

export type { ExtractedSymbol, ExtractedFile } from './types.js';

const ENGINE_OPTIONS = {
  parser: {
    extractDoc:     true,
    suppressErrors: true,
    php8:           true,
  },
  ast: {
    withPositions: false,
    withSource:    false,
  },
};

function newEngine(): InstanceType<typeof phpParser.Engine> {
  return new phpParser.Engine(ENGINE_OPTIONS);
}

function identifierName(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  const n = node as { name?: unknown };
  if (typeof n.name === 'string') return n.name;
  if (n.name && typeof n.name === 'object') return identifierName(n.name);
  return '';
}

function typeToString(typeNode: unknown): string {
  if (!typeNode) return '';
  if (Array.isArray(typeNode)) return typeNode.map(typeToString).join('|');
  const n = typeNode as { kind?: string; types?: unknown[]; what?: unknown };
  if (n.kind === 'uniontype')        return (n.types ?? []).map(typeToString).join('|');
  if (n.kind === 'intersectiontype') return (n.types ?? []).map(typeToString).join('&');
  if (n.kind === 'nullabletype')     return '?' + typeToString(n.what);
  return identifierName(typeNode);
}

function paramsToString(args: unknown[] | undefined): string {
  if (!args) return '';
  return args.map(raw => {
    const a = raw as {
      type?: unknown; byref?: boolean; variadic?: boolean;
      name: unknown; value?: unknown; nullable?: boolean;
    };
    const type     = a.type ? `${typeToString(a.type)} ` : '';
    const ref      = a.byref ? '&' : '';
    const variadic = a.variadic ? '...' : '';
    const name     = identifierName(a.name);
    const def      = a.value !== null && a.value !== undefined ? ' = …' : '';
    const nullable = a.nullable && !a.type ? '' : (a.nullable ? '?' : '');
    return `${nullable}${type}${ref}${variadic}$${name}${def}`;
  }).join(', ');
}

function commentsToDoc(node: unknown): string | undefined {
  const n = node as { leadingComments?: Array<{ kind?: string; value?: string }> } | null | undefined;
  const comments = n?.leadingComments;
  if (!comments || comments.length === 0) return undefined;
  const blocks = comments.filter(c => c.kind === 'commentblock' && typeof c.value === 'string' && c.value.startsWith('/**'));
  if (blocks.length === 0) return undefined;
  return blocks.map(c => c.value).join('\n').trim();
}

function returnTypeString(node: { type?: unknown; nullable?: boolean }): string {
  if (!node.type) return '';
  const nullablePrefix = node.nullable ? '?' : '';
  return `: ${nullablePrefix}${typeToString(node.type)}`;
}

function processFunction(node: unknown, prefix: string): ExtractedSymbol {
  const n = node as { name: unknown; arguments?: unknown[]; type?: unknown; nullable?: boolean };
  const fnName = identifierName(n.name);
  const name   = prefix + fnName;
  const params = paramsToString(n.arguments);
  const ret    = returnTypeString(n);
  return {
    kind:       'function',
    name,
    signature:  `${name}(${params})${ret}`,
    docComment: commentsToDoc(node),
  };
}

function processClassLike(
  node: unknown,
  prefix: string,
  kind: 'class' | 'interface' | 'trait',
): ExtractedSymbol[] {
  const n = node as {
    name: unknown;
    body?: unknown[];
    extends?: unknown;
    implements?: unknown[];
  };
  const className = prefix + identifierName(n.name);
  const symbols: ExtractedSymbol[] = [];

  const parts: string[] = [className];
  if (n.extends) {
    parts.push(Array.isArray(n.extends)
      ? `extends ${(n.extends as unknown[]).map(identifierName).join(', ')}`
      : `extends ${identifierName(n.extends)}`);
  }
  if (n.implements && n.implements.length > 0) {
    parts.push(`implements ${n.implements.map(identifierName).join(', ')}`);
  }
  symbols.push({
    kind:       kind === 'interface' ? 'interface' : 'class',
    name:       className,
    signature:  parts.join(' '),
    docComment: commentsToDoc(node),
  });

  for (const rawMember of n.body ?? []) {
    const m = rawMember as {
      kind?: string;
      name?: unknown;
      arguments?: unknown[];
      type?: unknown;
      nullable?: boolean;
      visibility?: string;
      isStatic?: boolean;
      constants?: Array<{ name: unknown }>;
    };

    if (m.kind === 'method') {
      const visibility = m.visibility || 'public';
      const isStatic   = m.isStatic ? ' static' : '';
      const methodName = identifierName(m.name);
      const params     = paramsToString(m.arguments);
      const ret        = returnTypeString(m as { type?: unknown; nullable?: boolean });
      const fullName   = `${className}::${methodName}`;
      symbols.push({
        kind:       'function',
        name:       fullName,
        signature:  `${visibility}${isStatic} ${methodName}(${params})${ret}`,
        docComment: commentsToDoc(rawMember),
      });
    } else if (m.kind === 'classconstant') {
      const visibility = m.visibility || 'public';
      const doc        = commentsToDoc(rawMember);
      for (const c of m.constants ?? []) {
        const cname = identifierName(c.name);
        symbols.push({
          kind:       'const',
          name:       `${className}::${cname}`,
          signature:  `${visibility} const ${cname}`,
          docComment: doc,
        });
      }
    }
  }

  return symbols;
}

function walk(node: unknown, symbols: ExtractedSymbol[], nsPrefix: string): void {
  if (!node) return;
  const n = node as { kind?: string; children?: unknown[]; name?: string };

  if (n.kind === 'program') {
    for (const child of n.children ?? []) walk(child, symbols, nsPrefix);
    return;
  }
  if (n.kind === 'namespace') {
    const ns = n.name ? `${n.name}\\` : '';
    for (const child of n.children ?? []) walk(child, symbols, nsPrefix + ns);
    return;
  }
  if (n.kind === 'function')  { symbols.push(processFunction(node, nsPrefix));                  return; }
  if (n.kind === 'class')     { symbols.push(...processClassLike(node, nsPrefix, 'class'));     return; }
  if (n.kind === 'interface') { symbols.push(...processClassLike(node, nsPrefix, 'interface')); return; }
  if (n.kind === 'trait')     { symbols.push(...processClassLike(node, nsPrefix, 'trait'));     return; }
}

export function extractPhpSymbolsFromSource(content: string, filePath: string): ExtractedSymbol[] {
  try {
    const ast = newEngine().parseCode(content, filePath);
    const symbols: ExtractedSymbol[] = [];
    walk(ast, symbols, '');
    return symbols;
  } catch {
    return [];
  }
}

export async function extractPhpSymbolsFromFiles(
  files: CodeFile[],
  codeSources: Record<string, CodeSource>,
): Promise<ExtractedFile[]> {
  const results: ExtractedFile[] = [];

  for (const file of files) {
    const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'php') continue;

    const source = codeSources[file.repo];
    if (!source) continue;

    try {
      const content = await source.readFile(file.path);
      const symbols = extractPhpSymbolsFromSource(content, file.path);
      if (symbols.length > 0) {
        results.push({ repo: file.repo, path: file.path, symbols });
      }
    } catch {
      // Skip unreadable files — callers handle missing results
    }
  }

  return results;
}
