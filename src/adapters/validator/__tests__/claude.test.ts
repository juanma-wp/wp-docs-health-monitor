import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeValidator, isWeakSuggestion, isSelfRejected, normalizeForVerbatim, verbatimIncludes, REPORT_FINDINGS_TOOL, PASS1_MAX_ISSUES } from '../claude.js';
import type { Doc } from '../../doc-source/types.js';
import type { CodeTiers } from '../../../types/mapping.js';
import type { CodeSource } from '../../code-source/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<Doc> = {}): Doc {
  return {
    slug:        'block-attributes',
    title:       'Block Attributes',
    parent:      'block-api',
    sourceUrl:   'https://developer.wordpress.org/block-editor/reference-guides/block-api/block-attributes/',
    content:     '# Block Attributes\n\nThe `name` parameter is required.',
    metrics:     { wordCount: 10, codeExampleCount: 0, linkCount: 0 },
    lastModified: null,
    ...overrides,
  };
}

function makeCodeTiers(overrides: Partial<CodeTiers> = {}): CodeTiers {
  return {
    primary:   [{ repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js' }],
    secondary: [],
    context:   [],
    ...overrides,
  };
}

function makeCodeSources(fileContent = 'function registerBlockType(name, settings) {}'): Record<string, CodeSource> {
  return {
    gutenberg: {
      readFile:    vi.fn(async () => fileContent),
      listDir:     vi.fn(async () => []),
      getCommitSha: vi.fn(async () => 'abc123'),
    },
  };
}

function makeAnthropicClient(responses: Anthropic.Message[]): Anthropic {
  let callCount = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        const resp = responses[callCount] ?? responses[responses.length - 1];
        callCount++;
        return resp;
      }),
    },
  } as unknown as Anthropic;
}

function makeReportFindingsResponse(
  issues: object[],
  positives: string[],
  inputTokens = 100,
  outputTokens = 50,
): Anthropic.Message {
  return {
    id:           'msg_test',
    type:         'message',
    role:         'assistant',
    model:        'claude-sonnet-4-6',
    stop_reason:  'tool_use',
    stop_sequence: null,
    usage:        { input_tokens: inputTokens, output_tokens: outputTokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    content: [
      {
        type:  'tool_use',
        id:    'tu_1',
        name:  'report_findings',
        input: { issues, positives },
        caller: { type: 'direct' },
      } as unknown as Anthropic.ToolUseBlock,
    ],
  } as unknown as Anthropic.Message;
}

const BASE_ISSUE = {
  severity:   'major' as const,
  type:       'type-signature' as const,
  evidence: {
    docSays:  'The `name` parameter is required.',
    codeSays: 'function registerBlockType(name, settings)',
    codeFile: 'packages/blocks/src/api/registration.js',
    codeRepo: 'gutenberg',
  },
  suggestion:  'Update the `name` parameter description to match `registerBlockType(name, settings)`',
  confidence:  0.85,
};

// ---------------------------------------------------------------------------
// isSelfRejected
// ---------------------------------------------------------------------------

describe('isSelfRejected', () => {
  it('detects "REJECTED: no change needed"', () => {
    expect(isSelfRejected('REJECTED: no change needed')).toBe(true);
  });

  it('detects "no change needed" mid-suggestion', () => {
    expect(isSelfRejected('The doc is accurate — no change needed.')).toBe(true);
  });

  it('detects "should be rejected"', () => {
    expect(isSelfRejected('This issue should be rejected.')).toBe(true);
  });

  it('returns false for a normal suggestion', () => {
    expect(isSelfRejected('Update `registerBlockType` to document the metadata overload.')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSelfRejected('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWeakSuggestion
// ---------------------------------------------------------------------------

describe('isWeakSuggestion', () => {
  it('considers "update the documentation" as weak', () => {
    expect(isWeakSuggestion('update the documentation')).toBe(true);
  });

  it('considers "revise this section" as weak', () => {
    expect(isWeakSuggestion('revise this section')).toBe(true);
  });

  it('considers "fix the description" as weak', () => {
    expect(isWeakSuggestion('fix the description')).toBe(true);
  });

  it('considers a suggestion with a specific function name as strong', () => {
    expect(isWeakSuggestion('Update `registerBlockType` to include `name` as required')).toBe(false);
  });

  it('considers a suggestion with a file path as strong', () => {
    expect(isWeakSuggestion('Update the `name` parameter in packages/blocks/src/api/registration.js')).toBe(false);
  });

  it('considers a suggestion with camelCase as strong', () => {
    expect(isWeakSuggestion('Change blockType to blockName in the signature')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — verbatim check
// ---------------------------------------------------------------------------

describe('ClaudeValidator — verbatim check', () => {
  it('drops an issue where codeSays is NOT a substring of the file content', async () => {
    // Pass 1 returns 1 issue whose codeSays is NOT in the file
    const pass1Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence: {
          ...BASE_ISSUE.evidence,
          codeSays: 'THIS TEXT DOES NOT EXIST IN THE FILE',
        },
      },
    ], ['Doc correctly describes the block API']);

    // Pass 2 response for any surviving issues (none should survive)
    const pass2Response = makeReportFindingsResponse([], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    // Issue should have been dropped by verbatim check
    expect(result.issues).toHaveLength(0);
    expect(validator.droppedHallucinations).toBe(1);
  });

  it('keeps an issue where codeSays IS found in the file content', async () => {
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    // This codeSays exists verbatim in fileContent
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], ['Good doc']);

    // Pass 2 confirms the issue
    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(validator.droppedHallucinations).toBe(0);
  });

  it('drops an issue where docSays is NOT a substring of the doc content', async () => {
    const pass1Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence: {
          ...BASE_ISSUE.evidence,
          docSays: 'THIS QUOTE NEVER APPEARS IN THE DOC',
        },
      },
    ], []);

    // Pass 2 should never run for this issue
    const pass2Response = makeReportFindingsResponse([], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources();

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
    expect(validator.droppedHallucinations).toBe(1);
  });

  it('drops a hallucinated docSays even on a nonexistent-name issue', async () => {
    // Absence-of-code is allowed for nonexistent-name, but the doc quote must still be real
    const pass1Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        type: 'nonexistent-name',
        evidence: {
          ...BASE_ISSUE.evidence,
          docSays: 'INVENTED DOC QUOTE',
          codeSays: 'somethingMissing',
        },
      },
    ], []);

    const pass2Response = makeReportFindingsResponse([], []);
    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources();

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
    expect(validator.droppedHallucinations).toBe(1);
  });

  it('passes a nonexistent-name issue through even when codeSays is not in the file', async () => {
    // The API named in codeSays genuinely does not exist in the file — that IS the finding
    const pass1Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        type: 'nonexistent-name',
        evidence: {
          ...BASE_ISSUE.evidence,
          codeSays: 'source',  // this string is NOT in the file content below
        },
      },
    ], []);

    const pass2Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        type: 'nonexistent-name',
        evidence: { ...BASE_ISSUE.evidence, codeSays: 'source' },
        confidence: 0.9,
      },
    ], []);

    const fileContent = 'function registerBlockType(name, settings) {}';
    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    // Should NOT be dropped — absence is the evidence
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('nonexistent-name');
    expect(validator.droppedHallucinations).toBe(0);
  });

  it('keeps an issue where docSays differs from doc content only in whitespace', async () => {
    // The doc has a multi-line bullet list with newlines + indentation;
    // the model paraphrases it as a single-line smooth quote. Pre-fix
    // this dropped silently — the smoke-test failure mode on
    // `block-attributes` (type/source allowed-values lists).
    const docWithBullets =
      '# Block Attributes\n\nThe `type` field MUST be one of the following:\n\n  - `null`\n  - `boolean`\n  - `object`\n';
    const docSays = 'The `type` field MUST be one of the following: - `null` - `boolean` - `object`';
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, docSays, codeSays } },
    ], []);
    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, docSays, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(
      makeDoc({ content: docWithBullets }),
      makeCodeTiers(),
      codeSources,
    );

    expect(result.issues).toHaveLength(1);
    expect(validator.droppedHallucinations).toBe(0);
  });

  it('keeps an issue where codeSays differs from file content only in whitespace', async () => {
    // File has indented code; model quotes it without leading indent.
    const fileContent =
      'function registerBlockType(\n  name,\n  settings,\n) {\n  return settings;\n}';
    const codeSays = 'function registerBlockType( name, settings, )';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);
    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(validator.droppedHallucinations).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeForVerbatim — unit tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// REPORT_FINDINGS_TOOL — schema-level caps
// ---------------------------------------------------------------------------

describe('REPORT_FINDINGS_TOOL schema', () => {
  // Pinned because the cap is structural — encoded on the tool schema
  // rather than in the system prompt. Any future schema rewrite must
  // preserve it; otherwise we re-open the 1,787-malformed-evidence
  // failure mode that this PR was designed to prevent.
  it('caps issues array at PASS1_MAX_ISSUES via schema maxItems', () => {
    const schema = REPORT_FINDINGS_TOOL.input_schema as {
      properties: {
        issues:    { maxItems?: number };
        positives: { maxItems?: number };
      };
    };
    expect(schema.properties.issues.maxItems).toBe(PASS1_MAX_ISSUES);
    expect(PASS1_MAX_ISSUES).toBe(10);
  });

  it('keeps positives capped at 3 (unchanged)', () => {
    const schema = REPORT_FINDINGS_TOOL.input_schema as {
      properties: { positives: { maxItems?: number } };
    };
    expect(schema.properties.positives.maxItems).toBe(3);
  });
});

describe('normalizeForVerbatim', () => {
  it('collapses runs of whitespace to a single space', () => {
    expect(normalizeForVerbatim('foo    bar')).toBe('foo bar');
    expect(normalizeForVerbatim('foo\n\n  bar')).toBe('foo bar');
    expect(normalizeForVerbatim('foo\tbar')).toBe('foo bar');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeForVerbatim('  foo bar  ')).toBe('foo bar');
    expect(normalizeForVerbatim('\nfoo\n')).toBe('foo');
  });

  it('strips Markdown link syntax', () => {
    // Bare inline link
    expect(normalizeForVerbatim('see [the docs](https://example.com)')).toBe('see the docs');
    // Image link with alt text
    expect(normalizeForVerbatim('![alt text](image.png)')).toBe('alt text');
    // Link with title attribute
    expect(normalizeForVerbatim('[text](url "title")')).toBe('text');
    // Relative path with anchor (the block-attributes case)
    expect(
      normalizeForVerbatim("data is stored in the block's [comment delimiter](/docs/explanations.md#data)."),
    ).toBe("data is stored in the block's comment delimiter.");
  });

  it('does not strip comment-continuation characters', () => {
    // PHPDoc `*` and similar are language-specific and intentionally NOT
    // normalised here — would belong in per-site config if needed.
    expect(normalizeForVerbatim('* foo\n * bar')).toBe('* foo * bar');
    expect(normalizeForVerbatim('# foo\n# bar')).toBe('# foo # bar');
  });

  it('does not strip bold/italic emphasis or inline code', () => {
    // Stripping emphasis would mangle identifiers like `__experimental`.
    // Stripping backticks would erase the structural distinction between
    // identifiers and prose. Both are deliberately preserved.
    expect(normalizeForVerbatim('**bold** _italic_ ~~strike~~')).toBe('**bold** _italic_ ~~strike~~');
    expect(normalizeForVerbatim('use `registerBlockType()` here')).toBe('use `registerBlockType()` here');
    expect(normalizeForVerbatim('the `__experimentalFoo` API')).toBe('the `__experimentalFoo` API');
  });

  it('preserves substring detection across line breaks', () => {
    const haystack = normalizeForVerbatim('one\n  - two\n  - three\n  - four');
    const needle = normalizeForVerbatim('two - three - four');
    expect(haystack.includes(needle)).toBe(true);
  });

  it('preserves substring detection across Markdown link rendering', () => {
    // The block-attributes regression: doc has `[comment delimiter](url)`,
    // model paraphrases as plain `comment delimiter`. After normalisation
    // both sides should match.
    const haystack = normalizeForVerbatim(
      "stored in the block's [comment delimiter](/docs/key-concepts.md#data).",
    );
    const needle = normalizeForVerbatim("stored in the block's comment delimiter.");
    expect(haystack.includes(needle)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verbatimIncludes
// ---------------------------------------------------------------------------

describe('verbatimIncludes', () => {
  // Strategy 1: direct normalized match (existing behaviour, pinned)
  it('delegates to normalizeForVerbatim for normal content', () => {
    expect(verbatimIncludes('foo bar baz', 'foo bar')).toBe(true);
    expect(verbatimIncludes('foo bar baz', 'qux')).toBe(false);
  });

  // Strategy 2: bullet-stripped match
  it('matches when model prefixes lines with `- ` from a bullet-formatted doc section', () => {
    // Doc content: plain text property descriptions (no bullets)
    // Model's docSays: prefixed with `- ` on each line (bullet reformatting)
    const docContent = normalizeForVerbatim('Optional.\nProperty: `apiVersion`');
    expect(verbatimIncludes(docContent, '- Optional.\n- Property: `apiVersion`')).toBe(true);
  });

  it('matches when model uses leading `- ` on a single-line quote', () => {
    const docContent = normalizeForVerbatim('The apiVersion field is required.');
    expect(verbatimIncludes(docContent, '- The apiVersion field is required.')).toBe(true);
  });

  it('does not strip mid-word hyphens (content, not bullets)', () => {
    // `type-signature` has a hyphen but no surrounding spaces — must stay
    const docContent = normalizeForVerbatim('type-signature drift is flagged');
    expect(verbatimIncludes(docContent, 'type-signature drift')).toBe(true);
  });

  // Strategy 3: single backtick identifier fallback
  it('matches single backtick identifier against plain text in haystack', () => {
    expect(verbatimIncludes('the filePath property is optional', '`filePath`')).toBe(true);
    expect(verbatimIncludes('use apiVersion to declare the version', '`apiVersion`')).toBe(true);
  });

  it('matches when haystack also has the backtick form (strategy 1 fires)', () => {
    expect(verbatimIncludes('use `filePath` to specify the path', '`filePath`')).toBe(true);
  });

  it('does not broaden multi-token backtick quotes', () => {
    expect(verbatimIncludes('some content here', '`foo bar`')).toBe(false);
  });

  it('still rejects genuine hallucinations', () => {
    expect(verbatimIncludes('The block name must be a string.', '`shadowColor`')).toBe(false);
    expect(verbatimIncludes('The block name must be a string.', 'nonExistentFunction()')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — confidence filter
// ---------------------------------------------------------------------------

describe('ClaudeValidator — confidence filter', () => {
  it('drops an issue with confidence < 0.7 after Pass 2', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    // Pass 2 returns the issue with LOW confidence
    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.6 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
  });

  it('keeps an issue with confidence >= 0.7 after Pass 2', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.7 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — weak suggestion handling
// ---------------------------------------------------------------------------

describe('ClaudeValidator — weak suggestion handling', () => {
  it('drops a minor issue with a weak suggestion without retry', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, severity: 'minor', evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    // Pass 2 returns a weak suggestion
    const pass2Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        severity:   'minor',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: 'update the documentation',
      },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const createSpy = client.messages.create as Mock;
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
    // Should NOT have called retry (only pass1 + pass2 = 2 calls)
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it('triggers exactly one retry for a critical issue with a weak suggestion', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, severity: 'critical', evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    // Pass 2 returns a weak suggestion for a critical issue
    const pass2WeakResponse = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        severity:   'critical',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: 'fix the description',
      },
    ], []);

    // Retry response returns a specific suggestion
    const retryResponse = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        severity:   'critical',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: 'Update `registerBlockType` to document that `name` must be unique',
      },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2WeakResponse, retryResponse]);
    const createSpy = client.messages.create as Mock;
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    // Issue should survive with the retried suggestion
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].suggestion).toContain('registerBlockType');
    // pass1 + pass2 + retry = 3 calls
    expect(createSpy).toHaveBeenCalledTimes(3);
  });

  it('does not crash when Pass 2 returns an issue with missing suggestion', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    // Pass 1: codeSays is present in the file so it survives the verbatim check
    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    // Pass 2: returns an issue with suggestion omitted (undefined)
    const pass2Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: undefined,
      },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — fingerprint
// ---------------------------------------------------------------------------

describe('ClaudeValidator — fingerprint', () => {
  it('sets fingerprint on every surviving issue', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — duplicate suppression
// ---------------------------------------------------------------------------

describe('ClaudeValidator — duplicate suppression', () => {
  it('drops a duplicate issue with same type + codeFile + docSays', async () => {
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    const sharedDocSays = 'The `name` parameter is required.';
    // Two different codeSays snippets — both are verbatim substrings of fileContent
    const codeSays1 = 'function registerBlockType(name, settings)';
    const codeSays2 = 'function registerBlockType(name, settings) { return settings; }';

    // Pass 1 returns two issues: identical type, codeFile, docSays — but different codeSays
    const pass1Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence: { ...BASE_ISSUE.evidence, docSays: sharedDocSays, codeSays: codeSays1 },
      },
      {
        ...BASE_ISSUE,
        evidence: { ...BASE_ISSUE.evidence, docSays: sharedDocSays, codeSays: codeSays2 },
      },
    ], []);

    // Pass 2 confirms issue 1
    const pass2Response1 = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence:   { ...BASE_ISSUE.evidence, docSays: sharedDocSays, codeSays: codeSays1 },
        confidence: 0.9,
      },
    ], []);

    // Pass 2 confirms issue 2
    const pass2Response2 = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence:   { ...BASE_ISSUE.evidence, docSays: sharedDocSays, codeSays: codeSays2 },
        confidence: 0.9,
      },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response1, pass2Response2]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    // Deduplication on (type, codeFile, docSays) must keep only one of the two issues
    expect(result.issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — Pass 2 fetch_code agentic loop
// ---------------------------------------------------------------------------

describe('ClaudeValidator — Pass 2 fetch_code tool', () => {
  it('handles a fetch_code call in Pass 2 before report_findings', async () => {
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    // Pass 2 turn 1: Claude calls fetch_code
    const pass2FetchResponse: Anthropic.Message = {
      id:           'msg_p2_1',
      type:         'message',
      role:         'assistant',
      model:        'claude-sonnet-4-6',
      stop_reason:  'tool_use',
      stop_sequence: null,
      usage:        { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [
        {
          type:  'tool_use',
          id:    'tu_fetch',
          name:  'fetch_code',
          input: { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', startLine: 1, endLine: 5 },
          caller: { type: 'direct' },
        } as unknown as Anthropic.ToolUseBlock,
      ],
    } as unknown as Anthropic.Message;

    // Pass 2 turn 2: Claude calls report_findings after seeing the fetched code
    const pass2ReportResponse = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2FetchResponse, pass2ReportResponse]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
    // fetch was called for the readFile (verbatim check + fetch_code)
    expect(codeSources.gutenberg.readFile).toHaveBeenCalledWith(
      'packages/blocks/src/api/registration.js',
      1,
      5,
    );
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — temperature plumbing (issue #56)
// ---------------------------------------------------------------------------

describe('ClaudeValidator — temperature plumbing', () => {
  it('passes the configured temperature on every messages.create call (Pass 1, Pass 2, retry)', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, severity: 'critical', evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);
    // Pass 2 returns a weak suggestion → triggers a retry (third call).
    const pass2WeakResponse = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        severity:   'critical',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: 'fix the description',
      },
    ], []);
    const retryResponse = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        severity:   'critical',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: 'Update `registerBlockType` to document the new `metadata` overload',
      },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2WeakResponse, retryResponse]);
    const createSpy = client.messages.create as Mock;
    const codeSources = makeCodeSources(fileContent);

    const validator = new ClaudeValidator(
      'claude-sonnet-4-6',
      'claude-sonnet-4-6',
      client,
      undefined,
      { temperature: 0 },
    );
    await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(createSpy).toHaveBeenCalledTimes(3);
    for (const call of createSpy.mock.calls) {
      expect(call[0]).toMatchObject({ temperature: 0 });
    }
  });

  it('defaults temperature to 0 when no option is provided', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);
    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeAnthropicClient([pass1Response, pass2Response]);
    const createSpy = client.messages.create as Mock;

    const validator = new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    await validator.validateDoc(makeDoc(), makeCodeTiers(), makeCodeSources(fileContent));

    expect(createSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of createSpy.mock.calls) {
      expect(call[0].temperature).toBe(0);
    }
  });

  it('honours a non-zero temperature when explicitly configured', async () => {
    const pass1Response = makeReportFindingsResponse([], []);
    const client = makeAnthropicClient([pass1Response]);
    const createSpy = client.messages.create as Mock;

    const validator = new ClaudeValidator(
      'claude-sonnet-4-6',
      'claude-sonnet-4-6',
      client,
      undefined,
      { temperature: 0.7 },
    );
    await validator.validateDoc(makeDoc(), makeCodeTiers(), makeCodeSources());

    expect(createSpy.mock.calls[0][0].temperature).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// ClaudeValidator — N-sample Pass 1 with fingerprint dedup (issue #56)
// ---------------------------------------------------------------------------

describe('ClaudeValidator — N-sample Pass 1', () => {
  it('runs Pass 1 N times when samples > 1 and unions candidates by fingerprint', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    // Sample 1 returns issue A (type-signature) only.
    const pass1Sample1 = makeReportFindingsResponse([
      { ...BASE_ISSUE, type: 'type-signature', evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], ['Doc accurately describes the API']);

    // Sample 2 returns issue A again (same type+codeFile+codeRepo → same fingerprint)
    // PLUS a different issue B (deprecated-api → different fingerprint).
    const pass1Sample2 = makeReportFindingsResponse([
      { ...BASE_ISSUE, type: 'type-signature', evidence: { ...BASE_ISSUE.evidence, codeSays } },
      {
        ...BASE_ISSUE,
        type:     'deprecated-api',
        evidence: { ...BASE_ISSUE.evidence, codeSays, docSays: 'The `name` parameter is required.' },
      },
    ], ['Doc accurately describes the API']);

    // Sample 3 returns nothing new.
    const pass1Sample3 = makeReportFindingsResponse([], []);

    // Each unique candidate must be verified at most once by Pass 2 → 2 calls.
    const pass2A = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        type:       'type-signature',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.9,
        suggestion: 'Update `registerBlockType` to document the new `metadata` overload',
      },
    ], []);
    const pass2B = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        type:       'deprecated-api',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.9,
        suggestion: 'Mark `registerBlockType` deprecated in favour of `wp.blocks.register`',
      },
    ], []);

    const client = makeAnthropicClient([pass1Sample1, pass1Sample2, pass1Sample3, pass2A, pass2B]);
    const createSpy = client.messages.create as Mock;

    const validator = new ClaudeValidator(
      'claude-sonnet-4-6',
      'claude-sonnet-4-6',
      client,
      undefined,
      { samples: 3 },
    );
    const result = await validator.validateDoc(
      makeDoc(),
      makeCodeTiers(),
      makeCodeSources(fileContent),
    );

    // 3 Pass-1 calls + 2 Pass-2 calls (one per unique candidate, not per sample sighting).
    expect(createSpy).toHaveBeenCalledTimes(5);
    // Both unique findings survive.
    expect(result.issues).toHaveLength(2);
    const types = result.issues.map(i => i.type).sort();
    expect(types).toEqual(['deprecated-api', 'type-signature']);
  });

  it('still produces a valid DocResult when one Pass-1 sample throws', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const goodPass1 = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);
    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    let callCount = 0;
    const client = {
      messages: {
        create: vi.fn(async () => {
          callCount++;
          if (callCount === 1) throw new Error('transient API error');
          if (callCount === 2) return goodPass1;
          return pass2Response;
        }),
      },
    } as unknown as Anthropic;

    const validator = new ClaudeValidator(
      'claude-sonnet-4-6',
      'claude-sonnet-4-6',
      client,
      undefined,
      { samples: 2 },
    );
    const result = await validator.validateDoc(
      makeDoc(),
      makeCodeTiers(),
      makeCodeSources(fileContent),
    );

    // The surviving sample's findings are kept; the failed sample is reported in diagnostics.
    expect(result.issues).toHaveLength(1);
    expect(result.diagnostics.some(d => /Pass 1 sample 1\/2 failed/.test(d))).toBe(true);
  });

  it('rejects samples < 1 at construction time', () => {
    const client = makeAnthropicClient([makeReportFindingsResponse([], [])]);
    expect(
      () =>
        new ClaudeValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client, undefined, {
          samples: 0,
        }),
    ).toThrow(/samples must be an integer >= 1/);
  });
});
