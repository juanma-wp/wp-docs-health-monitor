import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeValidator, isWeakSuggestion } from '../claude.js';
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(validator.droppedHallucinations).toBe(0);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    // Should NOT be dropped — absence is the evidence
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('nonexistent-name');
    expect(validator.droppedHallucinations).toBe(0);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    // Issue should survive with the retried suggestion
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].suggestion).toContain('registerBlockType');
    // pass1 + pass2 + retry = 3 calls
    expect(createSpy).toHaveBeenCalledTimes(3);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
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

    const validator = new ClaudeValidator('claude-sonnet-4-6', client);
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
