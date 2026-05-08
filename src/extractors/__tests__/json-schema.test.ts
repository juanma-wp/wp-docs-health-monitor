import { describe, it, expect } from 'vitest';
import { extractJsonSchemaSymbolsFromSource } from '../json-schema.js';

function names(content: string): string[] {
  return extractJsonSchemaSymbolsFromSource(content, 'test.json').map(s => s.name);
}

describe('extractJsonSchemaSymbolsFromSource', () => {
  it('extracts top-level property names', () => {
    const schema = JSON.stringify({
      $schema: 'https://json-schema.org/draft-07/schema#',
      properties: {
        apiVersion: { type: 'integer' },
        name:       { type: 'string' },
        title:      { type: 'string' },
      },
    });
    expect(names(schema).sort()).toEqual(['apiVersion', 'name', 'title']);
  });

  it('extracts nested property names', () => {
    const schema = JSON.stringify({
      properties: {
        supports: {
          type: 'object',
          properties: {
            color: {
              type: 'object',
              properties: {
                gradient: { type: 'boolean' },
                background: { type: 'boolean' },
              },
            },
          },
        },
      },
    });
    expect(names(schema)).toEqual(
      expect.arrayContaining(['supports', 'color', 'gradient', 'background']),
    );
  });

  it('extracts string enum values', () => {
    const schema = JSON.stringify({
      properties: {
        category: {
          enum: ['text', 'media', 'design', 'widgets', 'theme', 'embed'],
        },
      },
    });
    expect(names(schema)).toEqual(
      expect.arrayContaining(['category', 'text', 'media', 'design', 'widgets', 'theme', 'embed']),
    );
  });

  it('skips non-string enum values', () => {
    const schema = JSON.stringify({
      properties: {
        version: { enum: [1, 2, 3, true, null] },
      },
    });
    expect(names(schema)).toEqual(['version']);
  });

  it('extracts definitions (draft-07)', () => {
    const schema = JSON.stringify({
      definitions: {
        BlockSupports: { type: 'object' },
        AttributeSpec: { type: 'object' },
      },
      properties: {
        supports: { $ref: '#/definitions/BlockSupports' },
      },
    });
    expect(names(schema)).toEqual(
      expect.arrayContaining(['BlockSupports', 'AttributeSpec', 'supports']),
    );
  });

  it('extracts $defs (2019-09 / 2020-12)', () => {
    const schema = JSON.stringify({
      $defs: {
        ColorOrigin: { type: 'string' },
      },
      properties: {
        origin: { $ref: '#/$defs/ColorOrigin' },
      },
    });
    expect(names(schema)).toEqual(expect.arrayContaining(['ColorOrigin', 'origin']));
  });

  it('recurses into oneOf / anyOf / allOf', () => {
    const schema = JSON.stringify({
      properties: {
        value: {
          oneOf: [
            { properties: { stringValue: {} } },
            { anyOf: [{ properties: { numberValue: {} } }] },
            { allOf: [{ properties: { booleanValue: {} } }] },
          ],
        },
      },
    });
    expect(names(schema)).toEqual(
      expect.arrayContaining(['value', 'stringValue', 'numberValue', 'booleanValue']),
    );
  });

  it('walks items in array schemas', () => {
    const schema = JSON.stringify({
      properties: {
        variations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              isDefault: { type: 'boolean' },
              scope:     { type: 'array' },
            },
          },
        },
      },
    });
    expect(names(schema)).toEqual(
      expect.arrayContaining(['variations', 'isDefault', 'scope']),
    );
  });

  it('walks patternProperties values', () => {
    const schema = JSON.stringify({
      patternProperties: {
        '^[a-z]+$': {
          properties: { localValue: {} },
        },
      },
    });
    expect(names(schema)).toEqual(['localValue']);
  });

  it('returns empty array on malformed JSON', () => {
    expect(extractJsonSchemaSymbolsFromSource('not { valid json', 'broken.json')).toEqual([]);
  });

  it('returns empty array on non-object root (string, number, array)', () => {
    expect(extractJsonSchemaSymbolsFromSource('"just a string"', 'x.json')).toEqual([]);
    expect(extractJsonSchemaSymbolsFromSource('42', 'x.json')).toEqual([]);
    expect(extractJsonSchemaSymbolsFromSource('[1,2,3]', 'x.json')).toEqual([]);
  });

  it('deduplicates symbols seen at multiple paths', () => {
    const schema = JSON.stringify({
      properties: {
        a: { properties: { color: {} } },
        b: { properties: { color: {} } },
      },
    });
    const result = names(schema);
    const colorCount = result.filter(n => n === 'color').length;
    expect(colorCount).toBe(1);
  });

  it('marks every emitted symbol with kind=schema-property', () => {
    const schema = JSON.stringify({
      properties: { foo: {} },
      definitions: { Bar: {} },
    });
    const symbols = extractJsonSchemaSymbolsFromSource(schema, 'x.json');
    for (const s of symbols) expect(s.kind).toBe('schema-property');
  });
});
