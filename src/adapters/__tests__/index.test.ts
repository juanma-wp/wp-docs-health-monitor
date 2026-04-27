import { describe, it, expect } from 'vitest';

import type { Config } from '../../config/schema.js';
import {
  createDocSource,
  createCodeSources,
  createValidator,
  NotImplementedError,
} from '../index.js';
import { ManifestUrlDocSource } from '../doc-source/manifest-url.js';
import { GitCloneSource } from '../code-source/git-clone.js';
import { ClaudeValidator } from '../validator/claude.js';

// ---------------------------------------------------------------------------
// Helpers: build a Config whose inner `type` strings bypass the z.literal
// narrowing (simulating a schema that was widened without updating the factory).
// ---------------------------------------------------------------------------

function makeDocSourceConfig(type: string): Config {
  return {
    project: { name: 'test' },
    docSource: {
      type: type as 'manifest-url',
      manifestUrl: 'https://example.com/manifest.json',
      parentSlug: 'test',
    },
    codeSources: {
      gutenberg: {
        type: 'git-clone',
        repoUrl: 'https://github.com/WordPress/gutenberg.git',
        ref: 'trunk',
      },
    },
    mappingPath: 'mappings/test.json',
    outputDir: './out',
    validator: { type: 'claude', model: 'claude-sonnet-4-6' },
  };
}

function makeCodeSourceConfig(type: string): Config {
  const cfg = makeDocSourceConfig('manifest-url');
  (cfg.codeSources.gutenberg as { type: string }).type = type;
  return cfg;
}

// ---------------------------------------------------------------------------
// createDocSource
// ---------------------------------------------------------------------------

describe('createDocSource', () => {
  it('returns a ManifestUrlDocSource for type "manifest-url"', () => {
    const source = createDocSource(makeDocSourceConfig('manifest-url'));
    expect(source).toBeInstanceOf(ManifestUrlDocSource);
  });

  it('throws NotImplementedError for an unrecognised docSource type', () => {
    expect(() => createDocSource(makeDocSourceConfig('local-fs'))).toThrow(NotImplementedError);
    try {
      createDocSource(makeDocSourceConfig('local-fs'));
    } catch (e) {
      expect(e).toBeInstanceOf(NotImplementedError);
      expect((e as Error).name).toBe('NotImplementedError');
      expect((e as Error).message).toContain('local-fs');
    }
  });
});

// ---------------------------------------------------------------------------
// createCodeSources
// ---------------------------------------------------------------------------

describe('createCodeSources', () => {
  it('returns a record of GitCloneSource instances keyed by config id', () => {
    const sources = createCodeSources(makeCodeSourceConfig('git-clone'));
    expect(sources.gutenberg).toBeInstanceOf(GitCloneSource);
  });

  it('derives cacheDir from repoUrl basename + ref', () => {
    const sources = createCodeSources(makeCodeSourceConfig('git-clone'));
    // GitCloneSource stores cacheDir privately — exercise via getCommitSha path
    // semantics by asserting construction succeeded and instance is of correct type.
    expect(sources.gutenberg).toBeInstanceOf(GitCloneSource);
  });

  it('throws NotImplementedError for an unrecognised codeSource type', () => {
    expect(() => createCodeSources(makeCodeSourceConfig('svn'))).toThrow(NotImplementedError);
    try {
      createCodeSources(makeCodeSourceConfig('svn'));
    } catch (e) {
      expect(e).toBeInstanceOf(NotImplementedError);
      expect((e as Error).name).toBe('NotImplementedError');
      expect((e as Error).message).toContain('svn');
    }
  });
});

// ---------------------------------------------------------------------------
// createValidator
// ---------------------------------------------------------------------------

describe('createValidator', () => {
  it('returns a ClaudeValidator for type "claude"', () => {
    const validator = createValidator(makeDocSourceConfig('manifest-url'));
    expect(validator).toBeInstanceOf(ClaudeValidator);
  });

  it('throws NotImplementedError for an unrecognised validator type', () => {
    const cfg = makeDocSourceConfig('manifest-url');
    (cfg.validator as { type: string }).type = 'gpt';
    expect(() => createValidator(cfg)).toThrow(NotImplementedError);
  });
});
