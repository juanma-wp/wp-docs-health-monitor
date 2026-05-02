import { describe, it, expect } from 'vitest';
import { extractDefaultsFromSource, formatDefaultsAsText } from '../defaults.js';
import type { ExtractedDefaultFile } from '../types.js';

describe('extractDefaultsFromSource — PHP wp_parse_args', () => {
  it('captures inline literal defaults', () => {
    const src = `<?php
function foo( $args ) {
    $args = wp_parse_args( $args, array(
        'category' => 'common',
        'icon'     => null,
    ) );
    return $args;
}`;
    const defaults = extractDefaultsFromSource(src, 'a.php');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].pattern).toBe('wp_parse_args');
    expect(defaults[0].source).toContain("'category' => 'common'");
    expect(defaults[0].source).toContain("'icon'     => null");
    expect(defaults[0].source).toContain('wp_parse_args');
  });

  it('captures defaults declared as a variable above the call', () => {
    const src = `<?php
function bar( $args ) {
    $defaults = array(
        'foo' => 'bar',
        'baz' => 1,
    );
    $args = wp_parse_args( $args, $defaults );
    return $args;
}`;
    const defaults = extractDefaultsFromSource(src, 'a.php');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].source).toContain("'foo' => 'bar'");
    expect(defaults[0].source).toContain("'baz' => 1");
    expect(defaults[0].source).toContain('wp_parse_args( $args, $defaults )');
  });

  it('handles short-array syntax inside the call', () => {
    const src = `<?php $args = wp_parse_args( $args, [ 'foo' => 'bar' ] );`;
    const defaults = extractDefaultsFromSource(src, 'a.php');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].source).toContain("[ 'foo' => 'bar' ]");
  });

  it('handles nested function calls inside the defaults array', () => {
    const src = `<?php
$args = wp_parse_args( $args, array(
    'callback' => array( $this, 'render' ),
    'label'    => __( 'Hello', 'text-domain' ),
) );`;
    const defaults = extractDefaultsFromSource(src, 'a.php');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].source).toContain("__( 'Hello', 'text-domain' )");
    expect(defaults[0].source.match(/\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('captures multiple wp_parse_args calls in one file', () => {
    const src = `<?php
$a = wp_parse_args( $a, array( 'x' => 1 ) );
$b = wp_parse_args( $b, array( 'y' => 2 ) );`;
    expect(extractDefaultsFromSource(src, 'a.php')).toHaveLength(2);
  });

  it('reports correct line number for each call', () => {
    const src = `<?php
// line 2
$a = wp_parse_args( $a, array( 'x' => 1 ) );
// line 4
$b = wp_parse_args( $b, array( 'y' => 2 ) );`;
    const defaults = extractDefaultsFromSource(src, 'a.php');
    expect(defaults[0].line).toBe(3);
    expect(defaults[1].line).toBe(5);
  });
});

describe('extractDefaultsFromSource — JS object-spread', () => {
  it('captures const with inline defaults and spread', () => {
    const src = `const opts = { foo: 'bar', baz: 1, ...input };`;
    const defaults = extractDefaultsFromSource(src, 'a.ts');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].pattern).toBe('object-spread');
    expect(defaults[0].source).toContain("foo: 'bar'");
    expect(defaults[0].source).toContain('...input');
  });

  it('captures spread-defaults pattern { ...defaults, key: override }', () => {
    const src = `const opts = { ...defaults, foo: 'override' };`;
    const defaults = extractDefaultsFromSource(src, 'a.ts');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].source).toContain('...defaults');
    expect(defaults[0].source).toContain("foo: 'override'");
  });

  it('captures return statement with defaults', () => {
    const src = `function f(input) {
  return { type: 'paragraph', level: 1, ...input };
}`;
    const defaults = extractDefaultsFromSource(src, 'a.ts');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].source).toContain("type: 'paragraph'");
  });

  it('ignores object literals with only key:value pairs (no spread)', () => {
    const src = `const cfg = { foo: 'bar', baz: 1 };`;
    expect(extractDefaultsFromSource(src, 'a.ts')).toHaveLength(0);
  });

  it('ignores object literals with only spread (no defaults)', () => {
    const src = `const merged = { ...a, ...b };`;
    expect(extractDefaultsFromSource(src, 'a.ts')).toHaveLength(0);
  });

  it('ignores object literals exceeding the size cap', () => {
    const huge = 'x'.repeat(700);
    const src  = `const opts = { foo: '${huge}', ...input };`;
    expect(extractDefaultsFromSource(src, 'a.ts')).toHaveLength(0);
  });

  it('returns empty for unsupported file extensions', () => {
    const src = `const opts = { foo: 'bar', ...input };`;
    expect(extractDefaultsFromSource(src, 'README.md')).toHaveLength(0);
  });
});

describe('formatDefaultsAsText', () => {
  it('groups defaults by file with pattern label and indented source', () => {
    const files: ExtractedDefaultFile[] = [
      {
        repo: 'wordpress-develop',
        path: 'wp-includes/blocks.php',
        defaults: [
          { pattern: 'wp_parse_args', line: 100, source: "$args = wp_parse_args( $args, array( 'foo' => 'bar' ) );" },
        ],
      },
    ];
    const text = formatDefaultsAsText(files);
    expect(text).toContain('[wordpress-develop] wp-includes/blocks.php');
    expect(text).toContain('wp_parse_args @ L100:');
    expect(text).toContain("    $args = wp_parse_args( $args, array( 'foo' => 'bar' ) );");
  });

  it('returns empty string for empty input', () => {
    expect(formatDefaultsAsText([])).toBe('');
  });
});
