import { describe, it, expect } from 'vitest';
import { extractPhpSymbolsFromSource } from '../php.js';

describe('extractPhpSymbolsFromSource — top-level functions', () => {
  it('extracts a function with typed parameters and return type', () => {
    const src = `<?php
function register_block_type_args( array $args, string $name ): array {
    return $args;
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe('function');
    expect(symbols[0].name).toBe('register_block_type_args');
    expect(symbols[0].signature).toContain('array $args');
    expect(symbols[0].signature).toContain('string $name');
    expect(symbols[0].signature).toContain(': array');
  });

  it('captures PHPDoc above a function with @param, @return, @since', () => {
    const src = `<?php
/**
 * Registers a block type.
 *
 * @since 5.0.0
 * @param string $name Block name.
 * @return WP_Block_Type|false The block type, or false on failure.
 */
function register_block_type( $name ) {
    return null;
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols[0].docComment).toBeDefined();
    expect(symbols[0].docComment).toContain('@since 5.0.0');
    expect(symbols[0].docComment).toContain('@param string $name');
    expect(symbols[0].docComment).toContain('@return WP_Block_Type|false');
  });

  it('flags optional parameters with default values', () => {
    const src = `<?php
function get_post( $post = null, $output = OBJECT, $filter = 'raw' ) {}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols[0].signature).toMatch(/\$post = …/);
    expect(symbols[0].signature).toMatch(/\$output = …/);
    expect(symbols[0].signature).toMatch(/\$filter = …/);
  });

  it('handles variadic and reference parameters', () => {
    const src = `<?php
function log_all( string &$buffer, ...$args ) {}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols[0].signature).toContain('&$buffer');
    expect(symbols[0].signature).toContain('...$args');
  });

  it('handles union and nullable return types', () => {
    const src = `<?php
function find_block( string $name ): ?WP_Block_Type {}
function find_value(): string|int {}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols[0].signature).toContain(': ?WP_Block_Type');
    expect(symbols[1].signature).toContain(': string|int');
  });
});

describe('extractPhpSymbolsFromSource — classes', () => {
  it('extracts a class declaration with extends and implements', () => {
    const src = `<?php
class WP_Block_Type extends Base implements Stringable, Countable {
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols).toHaveLength(1);
    expect(symbols[0].kind).toBe('class');
    expect(symbols[0].name).toBe('WP_Block_Type');
    expect(symbols[0].signature).toContain('extends Base');
    expect(symbols[0].signature).toContain('implements Stringable, Countable');
  });

  it('extracts methods with class-qualified names and visibility', () => {
    const src = `<?php
class WP_Block_Bindings_Registry {
    public function register( string $name, array $source_properties ) {}
    private function validate( $properties ) {}
    public static function get_instance() {}
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    const methods = symbols.filter(s => s.kind === 'function');
    expect(methods).toHaveLength(3);
    expect(methods[0].name).toBe('WP_Block_Bindings_Registry::register');
    expect(methods[0].signature).toContain('public register(');
    expect(methods[1].name).toBe('WP_Block_Bindings_Registry::validate');
    expect(methods[1].signature).toContain('private validate(');
    expect(methods[2].signature).toContain('public static get_instance');
  });

  it('captures PHPDoc on individual methods', () => {
    const src = `<?php
class Foo {
    /**
     * @deprecated Use bar() instead.
     */
    public function legacy() {}
    public function modern() {}
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    const legacy = symbols.find(s => s.name === 'Foo::legacy');
    const modern = symbols.find(s => s.name === 'Foo::modern');
    expect(legacy?.docComment).toContain('@deprecated');
    expect(modern?.docComment).toBeUndefined();
  });

  it('extracts class constants', () => {
    const src = `<?php
class Block {
    public const API_VERSION = 3;
    private const DEFAULT_NAME = 'core/paragraph';
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    const consts = symbols.filter(s => s.kind === 'const');
    expect(consts).toHaveLength(2);
    expect(consts[0].name).toBe('Block::API_VERSION');
    expect(consts[1].name).toBe('Block::DEFAULT_NAME');
    expect(consts[1].signature).toContain('private const DEFAULT_NAME');
  });
});

describe('extractPhpSymbolsFromSource — interfaces and traits', () => {
  it('extracts interfaces with their methods', () => {
    const src = `<?php
interface Block_Source {
    public function get_value( array $args ): string;
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols[0].kind).toBe('interface');
    expect(symbols[0].name).toBe('Block_Source');
    expect(symbols[1].name).toBe('Block_Source::get_value');
    expect(symbols[1].signature).toContain(': string');
  });

  it('extracts traits as classes (closest existing kind)', () => {
    const src = `<?php
trait Serializable_Trait {
    public function serialize() {}
}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols[0].kind).toBe('class');
    expect(symbols[0].name).toBe('Serializable_Trait');
    expect(symbols[1].name).toBe('Serializable_Trait::serialize');
  });
});

describe('extractPhpSymbolsFromSource — namespaces', () => {
  it('prefixes symbols with their namespace', () => {
    const src = `<?php
namespace WP\\Blocks;
function register( string $name ) {}
class Block_Type {}`;
    const symbols = extractPhpSymbolsFromSource(src, 'a.php');
    expect(symbols[0].name).toBe('WP\\Blocks\\register');
    expect(symbols[1].name).toBe('WP\\Blocks\\Block_Type');
  });
});

describe('extractPhpSymbolsFromSource — error handling', () => {
  it('returns empty array for files with no PHP declarations', () => {
    expect(extractPhpSymbolsFromSource('<?php $x = 1;', 'a.php')).toEqual([]);
  });

  it('does not throw on syntax errors (suppressErrors)', () => {
    const src = `<?php
function broken( {{{`;
    expect(() => extractPhpSymbolsFromSource(src, 'a.php')).not.toThrow();
  });

  it('returns empty for empty input', () => {
    expect(extractPhpSymbolsFromSource('', 'a.php')).toEqual([]);
  });
});
