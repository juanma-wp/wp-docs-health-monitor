import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

import { ToolUseValidator, isWeakSuggestion, isSelfRejected } from '../tool-use-validator.js';
import type { LLMClient, ChatResponse } from '../llm-client.js';
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

function makeLLMClient(responses: ChatResponse[]): LLMClient {
  let callCount = 0;
  return {
    chat: vi.fn(async () => {
      const resp = responses[callCount] ?? responses[responses.length - 1];
      callCount++;
      return resp;
    }),
  };
}

function makeReportFindingsResponse(
  issues: object[],
  positives: string[],
  inputTokens = 100,
  outputTokens = 50,
): ChatResponse {
  const call = { id: 'tu_1', name: 'report_findings', input: { issues, positives } };
  return {
    toolCalls:     [call],
    appendMessage: { role: 'assistant', toolCalls: [call], _raw: {} },
    stopReason:    'tool_use',
    usage:         { inputTokens, outputTokens },
  };
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
// ToolUseValidator — verbatim check
// ---------------------------------------------------------------------------

describe('ToolUseValidator — verbatim check', () => {
  it('drops an issue where codeSays is NOT a substring of the file content', async () => {
    const pass1Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence: {
          ...BASE_ISSUE.evidence,
          codeSays: 'THIS TEXT DOES NOT EXIST IN THE FILE',
        },
      },
    ], ['Doc correctly describes the block API']);

    const pass2Response = makeReportFindingsResponse([], []);

    const client = makeLLMClient([pass1Response, pass2Response]);
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
    expect(validator.droppedHallucinations).toBe(1);
  });

  it('keeps an issue where codeSays IS found in the file content', async () => {
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], ['Good doc']);

    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeLLMClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(validator.droppedHallucinations).toBe(0);
  });

  it('passes a nonexistent-name issue through even when codeSays is not in the file', async () => {
    const pass1Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        type: 'nonexistent-name',
        evidence: {
          ...BASE_ISSUE.evidence,
          codeSays: 'source',
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
    const client = makeLLMClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('nonexistent-name');
    expect(validator.droppedHallucinations).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ToolUseValidator — confidence filter
// ---------------------------------------------------------------------------

describe('ToolUseValidator — confidence filter', () => {
  it('drops an issue with confidence < 0.7 after Pass 2', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.6 },
    ], []);

    const client = makeLLMClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
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

    const client = makeLLMClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ToolUseValidator — weak suggestion handling
// ---------------------------------------------------------------------------

describe('ToolUseValidator — weak suggestion handling', () => {
  it('drops a minor issue with a weak suggestion without retry', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, severity: 'minor', evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    const pass2Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        severity:   'minor',
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: 'update the documentation',
      },
    ], []);

    const client = makeLLMClient([pass1Response, pass2Response]);
    const chatSpy = client.chat as Mock;
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
    expect(chatSpy).toHaveBeenCalledTimes(2);
  });

  it('triggers exactly one retry for a critical issue with a weak suggestion', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, severity: 'critical', evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

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
        suggestion: 'Update `registerBlockType` to document that `name` must be unique',
      },
    ], []);

    const client = makeLLMClient([pass1Response, pass2WeakResponse, retryResponse]);
    const chatSpy = client.chat as Mock;
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].suggestion).toContain('registerBlockType');
    expect(chatSpy).toHaveBeenCalledTimes(3);
  });

  it('does not crash when Pass 2 returns an issue with missing suggestion', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    const pass2Response = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence:   { ...BASE_ISSUE.evidence, codeSays },
        confidence: 0.8,
        suggestion: undefined,
      },
    ], []);

    const client = makeLLMClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ToolUseValidator — fingerprint
// ---------------------------------------------------------------------------

describe('ToolUseValidator — fingerprint', () => {
  it('sets fingerprint on every surviving issue', async () => {
    const fileContent = 'function registerBlockType(name, settings) {}';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    const pass2Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeLLMClient([pass1Response, pass2Response]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// ToolUseValidator — duplicate suppression
// ---------------------------------------------------------------------------

describe('ToolUseValidator — duplicate suppression', () => {
  it('drops a duplicate issue with same type + codeFile + docSays', async () => {
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    const sharedDocSays = 'The `name` parameter is required.';
    const codeSays1 = 'function registerBlockType(name, settings)';
    const codeSays2 = 'function registerBlockType(name, settings) { return settings; }';

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

    const pass2Response1 = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence:   { ...BASE_ISSUE.evidence, docSays: sharedDocSays, codeSays: codeSays1 },
        confidence: 0.9,
      },
    ], []);

    const pass2Response2 = makeReportFindingsResponse([
      {
        ...BASE_ISSUE,
        evidence:   { ...BASE_ISSUE.evidence, docSays: sharedDocSays, codeSays: codeSays2 },
        confidence: 0.9,
      },
    ], []);

    const client = makeLLMClient([pass1Response, pass2Response1, pass2Response2]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ToolUseValidator — Pass 2 fetch_code agentic loop
// ---------------------------------------------------------------------------

describe('ToolUseValidator — Pass 2 fetch_code tool', () => {
  it('handles a fetch_code call in Pass 2 before report_findings', async () => {
    const fileContent = 'function registerBlockType(name, settings) { return settings; }';
    const codeSays = 'function registerBlockType(name, settings)';

    const pass1Response = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays } },
    ], []);

    // Pass 2 turn 1: model calls fetch_code
    const fetchCall = {
      id:    'tu_fetch',
      name:  'fetch_code',
      input: { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', startLine: 1, endLine: 5 },
    };
    const pass2FetchResponse: ChatResponse = {
      toolCalls:     [fetchCall],
      appendMessage: { role: 'assistant', toolCalls: [fetchCall], _raw: {} },
      stopReason:    'tool_use',
      usage:         { inputTokens: 200, outputTokens: 30 },
    };

    // Pass 2 turn 2: model calls report_findings after seeing fetched code
    const pass2ReportResponse = makeReportFindingsResponse([
      { ...BASE_ISSUE, evidence: { ...BASE_ISSUE.evidence, codeSays }, confidence: 0.9 },
    ], []);

    const client = makeLLMClient([pass1Response, pass2FetchResponse, pass2ReportResponse]);
    const codeSources = makeCodeSources(fileContent);

    const validator = new ToolUseValidator('claude-sonnet-4-6', 'claude-sonnet-4-6', client);
    const result = await validator.validateDoc(makeDoc(), makeCodeTiers(), codeSources);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(codeSources.gutenberg.readFile).toHaveBeenCalledWith(
      'packages/blocks/src/api/registration.js',
      1,
      5,
    );
  });
});
