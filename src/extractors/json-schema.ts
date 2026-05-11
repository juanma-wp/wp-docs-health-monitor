import type { ExtractedSymbol } from './types.js';

type AnyObject = Record<string, unknown>;

// Walks a parsed JSON Schema (draft-07, 2019-09, or 2020-12) and emits one
// ExtractedSymbol per discoverable name: property keys, definition / $defs
// keys, and string-valued enum members. Used by the symbol indexer to make
// schema files first-class for cross-doc relevance scoring — without this,
// schema-anchored docs (block.json, theme.json) cannot surface their canonical
// contract via the symbol index.
//
// Intentionally NOT extracted: $ref values (paths, not symbol names),
// type primitives ("string", "number", "boolean"), const literals (those
// belong to the doc's value space, not to the symbol space).
export function extractJsonSchemaSymbolsFromSource(
  content: string,
  _filePath: string,
): ExtractedSymbol[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];

  const seen = new Set<string>();
  const symbols: ExtractedSymbol[] = [];

  function emit(name: string, signature: string): void {
    if (!name || seen.has(name)) return;
    seen.add(name);
    symbols.push({ kind: 'schema-property', name, signature });
  }

  function walkChildren(arr: unknown): void {
    if (!Array.isArray(arr)) return;
    for (const item of arr) walk(item);
  }

  function walk(node: unknown): void {
    if (typeof node !== 'object' || node === null) return;
    const obj = node as AnyObject;

    if (obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as AnyObject;
      for (const propName of Object.keys(props)) {
        emit(propName, `property: ${propName}`);
        walk(props[propName]);
      }
    }

    if (obj.definitions && typeof obj.definitions === 'object') {
      const defs = obj.definitions as AnyObject;
      for (const defName of Object.keys(defs)) {
        emit(defName, `definition: ${defName}`);
        walk(defs[defName]);
      }
    }

    if (obj.$defs && typeof obj.$defs === 'object') {
      const defs = obj.$defs as AnyObject;
      for (const defName of Object.keys(defs)) {
        emit(defName, `definition: ${defName}`);
        walk(defs[defName]);
      }
    }

    if (Array.isArray(obj.enum)) {
      for (const v of obj.enum) {
        if (typeof v === 'string' && v.length > 0) {
          emit(v, `enum-value: ${v}`);
        }
      }
    }

    walkChildren(obj.oneOf);
    walkChildren(obj.anyOf);
    walkChildren(obj.allOf);

    if (obj.items) walk(obj.items);
    if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
      walk(obj.additionalProperties);
    }
    if (obj.patternProperties && typeof obj.patternProperties === 'object') {
      const pp = obj.patternProperties as AnyObject;
      for (const v of Object.values(pp)) walk(v);
    }
  }

  walk(parsed);
  return symbols;
}
