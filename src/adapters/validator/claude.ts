import Anthropic from '@anthropic-ai/sdk';

import type { Doc } from '../doc-source/types.js';
import type { CodeTiers } from '../../types/mapping.js';
import type { DocResult, Issue } from '../../types/results.js';
import type { CodeSource } from '../code-source/types.js';
import type { Validator, CostAccumulator } from './types.js';
import { assembleContext, formatContextForClaude } from './context-assembler.js';
import { scoreDoc } from '../../health-scorer.js';
import { fingerprintIssue } from '../../history.js';

// ---------------------------------------------------------------------------
// Default token pricing (Sonnet 4.6). Override via config.pricing.
// Current rates: https://www.anthropic.com/pricing
// ---------------------------------------------------------------------------
export const DEFAULT_PRICE_INPUT_PER_MTOK        = 3.00;
export const DEFAULT_PRICE_OUTPUT_PER_MTOK        = 15.00;
export const DEFAULT_PRICE_CACHE_WRITE_PER_MTOK   = 3.75;
export const DEFAULT_PRICE_CACHE_READ_PER_MTOK    = 0.30;

// ---------------------------------------------------------------------------
// Types for Claude tool inputs
// ---------------------------------------------------------------------------

type RawIssue = {
  severity:   'critical' | 'major' | 'minor';
  type:       'type-signature' | 'default-value' | 'deprecated-api' | 'broken-example' | 'nonexistent-name' | 'required-optional-mismatch';
  evidence: {
    docSays:  string;
    codeSays: string;
    codeFile: string;
    codeRepo: string;
  };
  suggestion: string | undefined;
  confidence: number;
};

type ReportFindingsInput = {
  issues:    RawIssue[];
  positives: string[];
};

type FetchCodeInput = {
  repo:      string;
  path:      string;
  startLine: number;
  endLine:   number;
};

// ---------------------------------------------------------------------------
// System prompt (cached across calls)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a documentation accuracy validator for the WordPress Block Editor.

Your job: read a documentation page and its mapped source code, then identify specific places where the documentation is inaccurate, outdated, or misleading relative to the current code.

## What counts as drift — report these

- Type signature changes: a parameter was added, removed, or renamed; a return type changed
- Default value changes: a documented default no longer matches the code
- Deprecated APIs shown as current or recommended
- Code examples that would throw or produce wrong output against the current code
- Function, hook, filter, or attribute names that no longer exist in the code
- Required parameters documented as optional, or optional parameters documented as required

## What does NOT count as drift — do not report these

- Teaching simplifications: intentional omission of edge cases or complexity for clarity
- Undocumented optional parameters, unless their absence would cause a reader's code to fail
- Style, grammar, or typos
- Broken external links
- If the documented behavior is a strict subset of actual behavior AND following the doc would not cause a developer's code to fail or produce a surprise, it is not drift

## Severity

- critical: following the doc would cause a developer's code to fail or produce incorrect output
- major: the doc is misleading or likely to confuse developers, but not immediately breaking
- minor: technically inaccurate but unlikely to cause problems in practice

## Source authority — ranked highest to lowest

When multiple source files are provided, resolve conflicts in this order:

1. **Test files** (path contains /test/ or .test.) — highest authority. A test assertion is an explicit contract about intended public API behavior. If a test confirms the doc claim, it is not drift. If a test contradicts the doc claim, that is strong evidence of drift. Never report an issue based on implementation code alone if a test file is available and confirms the documented behavior.

2. **AST-generated symbols** — when present, a machine-extracted list of all exported names, signatures, and constants. Will be provided as a dedicated section in the source context when available. Treat these as authoritative for what names and signatures are part of the public API.

3. **TypeScript type definition files** (types.ts, .d.ts) — authoritative for the public API surface. Type signatures here define what the API accepts and returns. Until AST symbols are available, treat these as the closest proxy for the full generated API surface.

4. **JSDoc / PHPDoc inline comments** — describe intended behavior. Read them before the code body. If a JSDoc comment confirms the doc claim, prefer that over code-body logic.

5. **JSON Schema files** (e.g. schemas/json/block.json) — valid for property names and allowed values only. Do NOT use their required arrays to determine whether a field is required — confirm that in TypeScript or PHP source.

6. **Implementation code** — authoritative for runtime behavior, but requires careful interpretation: short-circuit logic, internal-only APIs, and implementation details intentionally abstracted from the public API must not be reported as drift.

## Evidence rules — strictly enforced

Every issue MUST include:
- docSays: an exact verbatim quote from the documentation
- codeSays: an exact verbatim quote from one of the provided source files — copy the text character-for-character
- codeFile: the repo-relative path to the file containing codeSays
- codeRepo: the repo ID of that file (e.g. "gutenberg" or "wordpress-develop")

If you cannot find a verbatim quote from the code that directly contradicts the doc claim, do NOT report the issue. Guessed or paraphrased codeSays values are not acceptable.

## Suggestions — must be specific and structured

Every suggestion must name the exact function, parameter, attribute, hook, or line that needs to change. Examples of unacceptable suggestions: "update the documentation", "revise this section", "fix the description". These will be rejected.

Format every suggestion as:
1. A single summary sentence stating what needs to change.
2. A bullet list of specific actions, one per line, starting with "- ".

Example:
Update the \`registerBlockType\` documentation to reflect the metadata object overload.
- In the function signature section, add the overload: \`registerBlockType( metadata: BlockConfiguration, settings?: Partial<BlockConfiguration> )\`
- Note that when a metadata object is passed as the first argument, the \`settings\` parameter becomes optional

Keep the summary sentence short. Put all detail in the bullets.

## Confidence

Rate your confidence from 0.0 to 1.0. Only report issues you are confident about (≥ 0.7). When in doubt, omit.

## Positives

Report up to 3 things the documentation gets specifically right. These must be concrete — point to something in both the doc and the code. Do not write generic positives like "the documentation is clear". If the doc is entirely accurate, these positives are your primary finding.`;

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const REPORT_FINDINGS_TOOL: Anthropic.Tool = {
  name: 'report_findings',
  description: 'Report all drift issues and positives found in the documentation.',
  input_schema: {
    type: 'object' as const,
    required: ['issues', 'positives'],
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['severity', 'type', 'evidence', 'suggestion', 'confidence'],
          properties: {
            severity:   { type: 'string', enum: ['critical', 'major', 'minor'] },
            type:       { type: 'string', enum: ['type-signature', 'default-value', 'deprecated-api', 'broken-example', 'nonexistent-name', 'required-optional-mismatch'] },
            evidence: {
              type: 'object',
              required: ['docSays', 'codeSays', 'codeFile', 'codeRepo'],
              properties: {
                docSays:  { type: 'string' },
                codeSays: { type: 'string' },
                codeFile: { type: 'string' },
                codeRepo: { type: 'string' },
              },
            },
            suggestion: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
      positives: {
        type: 'array',
        maxItems: 3,
        items: { type: 'string' },
      },
    },
  },
};

const FETCH_CODE_TOOL: Anthropic.Tool = {
  name: 'fetch_code',
  description: 'Fetch a specific line range from a source file for closer inspection.',
  input_schema: {
    type: 'object' as const,
    required: ['repo', 'path', 'startLine', 'endLine'],
    properties: {
      repo:      { type: 'string', description: "Repo ID — e.g. 'gutenberg' or 'wordpress-develop'" },
      path:      { type: 'string', description: 'Repo-relative file path' },
      startLine: { type: 'integer', minimum: 1 },
      endLine:   { type: 'integer', minimum: 1 },
    },
  },
};

// ---------------------------------------------------------------------------
// Weak suggestion detection
// ---------------------------------------------------------------------------

const GENERIC_ONLY_PHRASES = [
  /^update (the )?documentation\.?$/i,
  /^revise (this )?section\.?$/i,
  /^fix (the )?(description|example|documentation|doc|this|it)\.?$/i,
  /^update (this|the) (section|paragraph|text|content|page)\.?$/i,
  /^(correct|improve|rewrite|clarify) (the )?(documentation|description|example|section|text)\.?$/i,
];

const CODE_IDENTIFIER_PATTERN = /`[^`]+`|[a-z][A-Z]\w*|[A-Z][a-z]\w*[A-Z]\w*|\b\w+_\w+\b|[/\\]\w|\.\w{2,4}\b|\w+\(\)/;

const SELF_REJECTION_PATTERNS = [
  /^rejected[:\s]/i,
  /no change (needed|required)/i,
  /should be rejected/i,
  /this (issue|finding) (should be|is) rejected/i,
];

// Detects when Pass 2 explicitly rejects its own finding in the suggestion text.
export function isSelfRejected(suggestion: string): boolean {
  if (!suggestion) return false;
  return SELF_REJECTION_PATTERNS.some(re => re.test(suggestion.trim()));
}

export function isWeakSuggestion(suggestion: string): boolean {
  if (!suggestion) return true;
  const trimmed = suggestion.trim();
  // Check if it matches known generic-only phrases
  if (GENERIC_ONLY_PHRASES.some(re => re.test(trimmed))) {
    return true;
  }
  // Check if it contains at least one code identifier
  if (CODE_IDENTIFIER_PATTERN.test(trimmed)) {
    return false;
  }
  // Short suggestions with no identifiers are weak
  return trimmed.split(/\s+/).length <= 8;
}

// ---------------------------------------------------------------------------
// ClaudeValidator
// ---------------------------------------------------------------------------

export class ClaudeValidator implements Validator {
  private readonly pass1Model: string;
  private readonly pass2Model: string;
  private readonly anthropic: Anthropic;
  private readonly systemPrompt: string;
  readonly costAccumulator: CostAccumulator = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  droppedHallucinations = 0;

  constructor(pass1Model: string, pass2Model: string, anthropic: Anthropic, promptExtension?: string) {
    this.pass1Model = pass1Model;
    this.pass2Model = pass2Model;
    this.anthropic = anthropic;
    this.systemPrompt = promptExtension?.trim()
      ? `${SYSTEM_PROMPT}\n\n## Site-specific rules\n\n${promptExtension}`
      : SYSTEM_PROMPT;
  }

  async validateDoc(
    doc: Doc,
    codeTiers: CodeTiers,
    codeSources: Record<string, CodeSource>,
  ): Promise<DocResult> {
    const assembled = await assembleContext(doc, codeTiers, codeSources);
    const diagnostics = [...assembled.diagnostics];

    // Get commit SHA from the first code source that has primary files
    let commitSha = '';
    const primaryRepo = codeTiers.primary[0]?.repo;
    if (primaryRepo && codeSources[primaryRepo]) {
      try {
        commitSha = await codeSources[primaryRepo].getCommitSha();
      } catch {
        // non-fatal
      }
    }

    // Build user message content
    const codeContext = formatContextForClaude(assembled.fileBlocks);
    const missingSymbolsHint = assembled.missingSymbols.length > 0
      ? `\n\n## Potentially removed APIs\n\nThe following identifiers appear in the doc but were not found in any source file. Investigate each as a possible \`nonexistent-name\` issue:\n\n${assembled.missingSymbols.map(s => `- \`${s}\``).join('\n')}`
      : '';
    const userContent = `## Documentation: ${doc.title}

URL: ${doc.sourceUrl}

${doc.content}

---

## Source Code

${codeContext || '(No source files were available for this document.)'}${missingSymbolsHint}`;

    // Pass 1: get initial issues and positives
    let pass1Issues: RawIssue[] = [];
    let positives: string[] = [];

    try {
      const pass1Result = await this.runPass1(userContent);
      pass1Issues = pass1Result.issues;
      positives = pass1Result.positives.slice(0, 3);
    } catch (err) {
      diagnostics.push(`Pass 1 failed: ${String(err)}`);
      return this.buildDocResult(doc, [], positives, assembled.relatedCode, diagnostics, commitSha);
    }

    // Verbatim check
    const verbatimPassed: RawIssue[] = [];
    for (const issue of pass1Issues) {
      const { codeRepo, codeFile, codeSays } = issue.evidence;
      if (!codeSources[codeRepo]) {
        diagnostics.push(`Unknown repo "${codeRepo}" in issue evidence — dropping`);
        continue;
      }
      try {
        const fileContent = await codeSources[codeRepo].readFile(codeFile);
        const needle = codeSays.trim();
        // nonexistent-name evidence is absence — there is no quote to find in the file
        const isAbsenceIssue = issue.type === 'nonexistent-name';
        if (!isAbsenceIssue && !fileContent.includes(needle)) {
          this.droppedHallucinations++;
          console.warn(`[verbatim-check] dropped issue in ${doc.slug}: "${codeSays}" not found in ${codeRepo}:${codeFile}`);
          continue;
        }
        verbatimPassed.push(issue);
      } catch {
        diagnostics.push(`Could not read ${codeRepo}:${codeFile} for verbatim check — dropping issue`);
      }
    }

    // Pass 2: targeted verification for each surviving candidate
    const finalIssues: Issue[] = [];
    const seenKeys = new Set<string>();
    for (const candidate of verbatimPassed) {
      try {
        const verified = await this.runPass2(candidate, codeSources, doc.slug);
        if (verified) {
          // Deduplicate: same type + codeFile + docSays = same finding reported twice
          const key = `${verified.type}|${verified.evidence.codeFile}|${verified.evidence.docSays}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            finalIssues.push(verified);
          } else {
            console.warn(`[dedup] dropped duplicate issue in ${doc.slug}: ${verified.type} in ${verified.evidence.codeFile}`);
          }
        }
      } catch (err) {
        diagnostics.push(`Pass 2 failed for issue in ${doc.slug}: ${String(err)}`);
      }
    }

    return this.buildDocResult(doc, finalIssues, positives, assembled.relatedCode, diagnostics, commitSha);
  }

  private buildDocResult(
    doc: Doc,
    issues: Issue[],
    positives: string[],
    relatedCode: DocResult['relatedCode'],
    diagnostics: string[],
    commitSha: string,
  ): DocResult {
    const { healthScore, status } = scoreDoc(issues);
    return {
      slug:        doc.slug,
      title:       doc.title,
      parent:      doc.parent,
      sourceUrl:   doc.sourceUrl,
      healthScore,
      status,
      issues,
      positives,
      relatedCode,
      diagnostics,
      commitSha,
      analyzedAt:  new Date().toISOString(),
    };
  }

  private async runPass1(userContent: string): Promise<ReportFindingsInput> {
    const response = await this.anthropic.messages.create({
      model:      this.pass1Model,
      max_tokens: 4096,
      system: [
        {
          type:          'text',
          text:          this.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role:    'user',
          content: userContent,
        },
      ],
      tools:       [REPORT_FINDINGS_TOOL],
      tool_choice: { type: 'tool', name: 'report_findings' },
    });

    this.costAccumulator.inputTokens         += response.usage.input_tokens;
    this.costAccumulator.outputTokens        += response.usage.output_tokens;
    this.costAccumulator.cacheReadTokens     += response.usage.cache_read_input_tokens    ?? 0;
    this.costAccumulator.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'report_findings') {
        return block.input as ReportFindingsInput;
      }
    }

    return { issues: [], positives: [] };
  }

  private async runPass2(
    candidate: RawIssue,
    codeSources: Record<string, CodeSource>,
    slug: string,
  ): Promise<Issue | null> {
    const messages: Anthropic.MessageParam[] = [
      {
        role:    'user',
        content: `Re-evaluate this candidate issue using the fetch_code tool to inspect the relevant code region.
Confirm or reject the issue. If confirmed, ensure the suggestion is specific.

Issue:
${JSON.stringify(candidate, null, 2)}`,
      },
    ];

    let result: ReportFindingsInput | null = null;

    // Agentic loop: allow Claude to call fetch_code before report_findings
    for (let turn = 0; turn < 10; turn++) {
      const response = await this.anthropic.messages.create({
        model:      this.pass2Model,
        max_tokens: 2048,
        system: [
          {
            type:          'text',
            text:          this.systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
        tools:       [FETCH_CODE_TOOL, REPORT_FINDINGS_TOOL],
        tool_choice: { type: 'any' },
      });

      this.costAccumulator.inputTokens         += response.usage.input_tokens;
      this.costAccumulator.outputTokens        += response.usage.output_tokens;
      this.costAccumulator.cacheReadTokens     += response.usage.cache_read_input_tokens    ?? 0;
      this.costAccumulator.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

      // Add assistant response to the conversation
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') break;

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let foundReportFindings = false;

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        if (block.name === 'report_findings') {
          result = block.input as ReportFindingsInput;
          foundReportFindings = true;
          break;
        }

        if (block.name === 'fetch_code') {
          const input = block.input as FetchCodeInput;
          let fetchedContent: string;
          try {
            const src = codeSources[input.repo];
            if (!src) throw new Error(`Unknown repo: ${input.repo}`);
            fetchedContent = await src.readFile(input.path, input.startLine, input.endLine);
          } catch (err) {
            fetchedContent = `Error fetching code: ${String(err)}`;
          }
          toolResults.push({
            type:        'tool_result',
            tool_use_id: block.id,
            content:     fetchedContent,
          });
        }
      }

      if (foundReportFindings) break;

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      } else {
        break;
      }
    }

    if (!result || result.issues.length === 0) return null;

    const rawIssue = result.issues[0];
    if (!rawIssue) return null;

    // Drop if confidence < 0.7
    if (rawIssue.confidence < 0.7) return null;

    // Guard against undefined suggestion from malformed API response
    if (!rawIssue.suggestion) return null;

    // Drop if the model explicitly rejects its own finding
    if (isSelfRejected(rawIssue.suggestion)) return null;

    if (isWeakSuggestion(rawIssue.suggestion)) {
      if (rawIssue.severity === 'minor') {
        // Drop without retry
        return null;
      }
      // For critical/major: retry once
      const retried = await this.retryWeakSuggestion(rawIssue, messages);
      if (!retried) return null;
      rawIssue.suggestion = retried;
      if (isWeakSuggestion(rawIssue.suggestion)) return null;
    }

    // Build the Issue with fingerprint
    const issue: Issue = {
      severity:    rawIssue.severity,
      type:        rawIssue.type,
      evidence:    rawIssue.evidence,
      suggestion:  rawIssue.suggestion,
      confidence:  rawIssue.confidence,
      fingerprint: fingerprintIssue(slug, rawIssue.type, rawIssue.evidence.codeFile, rawIssue.suggestion),
    };

    return issue;
  }

  private async retryWeakSuggestion(
    rawIssue: RawIssue,
    prevMessages: Anthropic.MessageParam[],
  ): Promise<string | null> {
    const retryMessages: Anthropic.MessageParam[] = [
      ...prevMessages,
      {
        role:    'user',
        content: 'The suggestion is too generic. Rewrite it to name the exact function, parameter, or line that needs to change.',
      },
    ];

    const response = await this.anthropic.messages.create({
      model:      this.pass2Model,
      max_tokens: 1024,
      system: [
        {
          type:          'text',
          text:          this.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages:    retryMessages,
      tools:       [REPORT_FINDINGS_TOOL],
      tool_choice: { type: 'tool', name: 'report_findings' },
    });

    this.costAccumulator.inputTokens         += response.usage.input_tokens;
    this.costAccumulator.outputTokens        += response.usage.output_tokens;
    this.costAccumulator.cacheReadTokens     += response.usage.cache_read_input_tokens    ?? 0;
    this.costAccumulator.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'report_findings') {
        const retried = block.input as ReportFindingsInput;
        if (retried.issues.length > 0) {
          return retried.issues[0].suggestion ?? null;
        }
      }
    }

    return null;
  }
}
