import { describe, it, expect } from 'vitest';
import { extractHooksFromSource, formatHooksAsText } from '../hooks.js';
import type { ExtractedHookFile } from '../types.js';

describe('extractHooksFromSource — PHP', () => {
  it('extracts apply_filters with single quotes', () => {
    const src = `<?php
function register_block_type_args( $args, $name ) {
    return apply_filters( 'register_block_type_args', $args, $name );
}`;
    const hooks = extractHooksFromSource(src, 'wp-includes/blocks.php');
    expect(hooks).toHaveLength(1);
    expect(hooks[0]).toMatchObject({
      kind: 'filter',
      name: 'register_block_type_args',
      call: 'apply_filters',
      line: 3,
    });
    expect(hooks[0].source).toContain("apply_filters( 'register_block_type_args'");
  });

  it('extracts do_action with double quotes', () => {
    const src = `<?php
do_action( "init_block_types" );
`;
    const hooks = extractHooksFromSource(src, 'a.php');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].kind).toBe('action');
    expect(hooks[0].name).toBe('init_block_types');
  });

  it('extracts apply_filters_deprecated and apply_filters_ref_array', () => {
    const src = `<?php
apply_filters_deprecated( 'old_hook', array( $value ), '6.0' );
apply_filters_ref_array( 'array_hook', array( &$value ) );
do_action_deprecated( 'old_action', array(), '6.0' );
do_action_ref_array( 'ref_action', array() );
`;
    const hooks = extractHooksFromSource(src, 'a.php');
    expect(hooks).toHaveLength(4);
    expect(hooks.map(h => h.call)).toEqual([
      'apply_filters_deprecated',
      'apply_filters_ref_array',
      'do_action_deprecated',
      'do_action_ref_array',
    ]);
    expect(hooks.map(h => h.kind)).toEqual(['filter', 'filter', 'action', 'action']);
  });

  it('ignores hooks whose name is a variable (cannot statically resolve)', () => {
    const src = `<?php apply_filters( $hook_name, $value );`;
    expect(extractHooksFromSource(src, 'a.php')).toHaveLength(0);
  });

  it('ignores hooks built via string concatenation', () => {
    const src = `<?php apply_filters( 'prefix_' . $type, $value );`;
    expect(extractHooksFromSource(src, 'a.php')).toHaveLength(0);
  });

  it('ignores hooks inside line comments', () => {
    const src = `<?php
// apply_filters( 'commented_out', $value );
do_action( 'real_one' );`;
    const hooks = extractHooksFromSource(src, 'a.php');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].name).toBe('real_one');
  });

  it('ignores hooks inside block comments', () => {
    const src = `<?php
/*
 * Example: apply_filters( 'documented_hook', $value );
 */
do_action( 'real_one' );`;
    const hooks = extractHooksFromSource(src, 'a.php');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].name).toBe('real_one');
  });

  it('captures correct line numbers', () => {
    const src = `<?php
// line 2
apply_filters( 'first', $a );
// line 4

do_action( 'second' );`;
    const hooks = extractHooksFromSource(src, 'a.php');
    expect(hooks[0].line).toBe(3);
    expect(hooks[1].line).toBe(6);
  });

  it('source captures the verbatim line containing the call', () => {
    const src = `<?php\n$result = apply_filters( 'block_type_metadata', $metadata );\n`;
    const hooks = extractHooksFromSource(src, 'a.php');
    expect(hooks[0].source).toBe("$result = apply_filters( 'block_type_metadata', $metadata );");
  });
});

describe('extractHooksFromSource — JS/TS', () => {
  it('extracts applyFilters and doAction', () => {
    const src = `
import { applyFilters, doAction } from '@wordpress/hooks';
const out = applyFilters( 'editor.PostFeaturedImage', element );
doAction( 'editor.didLoad' );
`;
    const hooks = extractHooksFromSource(src, 'a.ts');
    expect(hooks).toHaveLength(2);
    expect(hooks[0]).toMatchObject({ kind: 'filter', name: 'editor.PostFeaturedImage', call: 'applyFilters' });
    expect(hooks[1]).toMatchObject({ kind: 'action', name: 'editor.didLoad', call: 'doAction' });
  });

  it('ignores template literals with interpolation', () => {
    const src = "const out = applyFilters( `prefix.${name}`, value );";
    expect(extractHooksFromSource(src, 'a.ts')).toHaveLength(0);
  });

  it('extracts plain template literals without interpolation', () => {
    const src = "applyFilters( `static.hook.name`, value );";
    const hooks = extractHooksFromSource(src, 'a.ts');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].name).toBe('static.hook.name');
  });

  it('returns empty for unsupported file extensions', () => {
    expect(extractHooksFromSource("apply_filters('x', 1);", 'README.md')).toHaveLength(0);
    expect(extractHooksFromSource("apply_filters('x', 1);", 'config.json')).toHaveLength(0);
  });

  it('returns empty when no hooks present', () => {
    expect(extractHooksFromSource("function foo() { return 1; }", 'a.ts')).toHaveLength(0);
  });
});

describe('formatHooksAsText', () => {
  it('groups hooks by file with kind and line metadata', () => {
    const files: ExtractedHookFile[] = [
      {
        repo: 'wordpress-develop',
        path: 'wp-includes/blocks.php',
        hooks: [
          { kind: 'filter', name: 'foo', call: 'apply_filters', line: 10, source: "apply_filters( 'foo', $bar );" },
          { kind: 'action', name: 'baz', call: 'do_action',     line: 25, source: "do_action( 'baz' );" },
        ],
      },
    ];
    const text = formatHooksAsText(files);
    expect(text).toContain('[wordpress-develop] wp-includes/blocks.php');
    expect(text).toContain('filter @ L10:');
    expect(text).toContain("apply_filters( 'foo', $bar );");
    expect(text).toContain('action @ L25:');
  });

  it('returns empty string for empty input', () => {
    expect(formatHooksAsText([])).toBe('');
  });

  it('separates files with a blank line', () => {
    const files: ExtractedHookFile[] = [
      { repo: 'r', path: 'a.php', hooks: [{ kind: 'filter', name: 'a', call: 'apply_filters', line: 1, source: "apply_filters('a');" }] },
      { repo: 'r', path: 'b.php', hooks: [{ kind: 'action', name: 'b', call: 'do_action',     line: 1, source: "do_action('b');"   }] },
    ];
    expect(formatHooksAsText(files)).toContain('\n\n');
  });
});
