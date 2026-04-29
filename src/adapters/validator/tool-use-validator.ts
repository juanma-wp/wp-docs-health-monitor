import type { Doc } from '../doc-source/types.js';
import type { CodeTiers } from '../../types/mapping.js';
import type { DocResult, Issue } from '../../types/results.js';
import type { CodeSource } from '../code-source/types.js';
import type { Validator } from './types.js';
import type { LLMClient, ChatMessage, ToolDef, CostAccumulator } from './llm-client.js';
import { assembleContext, formatContextForClaude } from './context-assembler.js';
import { scoreDoc } from '../../health-scorer.js';
import { fingerprintIssue } from '../../history.js';

// ---------------------------------------------------------------------------
// Types for tool inputs
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
// System prompt
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are a documentation accuracy validator for the WordPress Block Editor.

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

When multiple source files are provided, treat them in this order of authority:

1. **JSON Schema files** (e.g. schemas/json/block.json) — when present, these are the ground truth for valid property names, types, and allowed values in JSON configuration files. A claim contradicted by a schema is a definite issue regardless of what TypeScript source says.
2. **Test files** — tests encode intended public API behavior. A behavior tested explicitly is a documented contract, not an implementation detail.
3. **TypeScript/PHP source** — authoritative for runtime behavior but requires careful interpretation (internal vs public API, short-circuit logic, etc.).

If the documentation describes JSON properties or configuration (e.g. block.json, theme.json fields), always check whether a schema file is provided in the source context before relying on TypeScript inference.

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
// Tool definitions
// ---------------------------------------------------------------------------

const REPORT_FINDINGS_TOOL: ToolDef = {
  name:        'report_findings',
  description: 'Report all drift issues and positives found in the documentation.',
  parameters: {
    type: 'object',
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

const FETCH_CODE_TOOL: ToolDef = {
  name:        'fetch_code',
  description: 'Fetch a specific line range from a source file for closer inspection.',
  parameters: {
    type: 'object',
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

export function isSelfRejected(suggestion: string): boolean {
  if (!suggestion) return false;
  return SELF_REJECTION_PATTERNS.some(re => re.test(suggestion.trim()));
}

export function isWeakSuggestion(suggestion: string): boolean {
  if (!suggestion) return true;
  const trimmed = suggestion.trim();
  if (GENERIC_ONLY_PHRASES.some(re => re.test(trimmed))) return true;
  if (CODE_IDENTIFIER_PATTERN.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 8;
}

// ---------------------------------------------------------------------------
// ToolUseValidator
// ---------------------------------------------------------------------------

export class ToolUseValidator implements Validator {
  private readonly pass1Model:    string;
  private readonly pass2Model:    string;
  private readonly client:        LLMClient;
  private readonly systemPrompt:  string;
  readonly costAccumulator: CostAccumulator = {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
  };
  droppedHallucinations = 0;

  constructor(
    pass1Model:      string,
    pass2Model:      string,
    client:          LLMClient,
    promptExtension?: string,
  ) {
    this.pass1Model   = pass1Model;
    this.pass2Model   = pass2Model;
    this.client       = client;
    this.systemPrompt = promptExtension
      ? `${BASE_SYSTEM_PROMPT}\n\n${promptExtension}`
      : BASE_SYSTEM_PROMPT;
  }

  async validateDoc(
    doc: Doc,
    codeTiers: CodeTiers,
    codeSources: Record<string, CodeSource>,
  ): Promise<DocResult> {
    const assembled   = await assembleContext(doc, codeTiers, codeSources);
    const diagnostics = [...assembled.diagnostics];

    let commitSha = '';
    const primaryRepo = codeTiers.primary[0]?.repo;
    if (primaryRepo && codeSources[primaryRepo]) {
      try {
        commitSha = await codeSources[primaryRepo].getCommitSha();
      } catch {
        // non-fatal
      }
    }

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

    let pass1Issues: RawIssue[] = [];
    let positives:   string[]   = [];

    try {
      const pass1Result = await this.runPass1(userContent);
      pass1Issues = pass1Result.issues;
      positives   = pass1Result.positives.slice(0, 3);
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
        const fileContent    = await codeSources[codeRepo].readFile(codeFile);
        const needle         = codeSays.trim();
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
    const finalIssues: Issue[]    = [];
    const seenKeys    = new Set<string>();
    for (const candidate of verbatimPassed) {
      try {
        const verified = await this.runPass2(candidate, codeSources, doc.slug);
        if (verified) {
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
    const messages: ChatMessage[] = [{ role: 'user', text: userContent }];

    const response = await this.client.chat(
      this.pass1Model,
      this.systemPrompt,
      messages,
      [REPORT_FINDINGS_TOOL],
      { type: 'tool', name: 'report_findings' },
      4096,
    );

    this.accumulateUsage(response.usage);

    const call = response.toolCalls.find(c => c.name === 'report_findings');
    return call ? (call.input as ReportFindingsInput) : { issues: [], positives: [] };
  }

  private async runPass2(
    candidate:   RawIssue,
    codeSources: Record<string, CodeSource>,
    slug:        string,
  ): Promise<Issue | null> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        text: `Re-evaluate this candidate issue using the fetch_code tool to inspect the relevant code region.
Confirm or reject the issue. If confirmed, ensure the suggestion is specific.

Issue:
${JSON.stringify(candidate, null, 2)}`,
      },
    ];

    let result: ReportFindingsInput | null = null;

    for (let turn = 0; turn < 10; turn++) {
      const response = await this.client.chat(
        this.pass2Model,
        this.systemPrompt,
        messages,
        [FETCH_CODE_TOOL, REPORT_FINDINGS_TOOL],
        { type: 'any' },
        2048,
      );

      this.accumulateUsage(response.usage);
      messages.push(response.appendMessage);

      if (response.stopReason === 'end_turn') break;
      if (response.stopReason !== 'tool_use')  break;

      const toolResults: Array<{ id: string; content: string }> = [];
      let foundReportFindings = false;

      for (const call of response.toolCalls) {
        if (call.name === 'report_findings') {
          result = call.input as ReportFindingsInput;
          foundReportFindings = true;
          break;
        }

        if (call.name === 'fetch_code') {
          const input = call.input as FetchCodeInput;
          let fetchedContent: string;
          try {
            const src = codeSources[input.repo];
            if (!src) throw new Error(`Unknown repo: ${input.repo}`);
            fetchedContent = await src.readFile(input.path, input.startLine, input.endLine);
          } catch (err) {
            fetchedContent = `Error fetching code: ${String(err)}`;
          }
          toolResults.push({ id: call.id, content: fetchedContent });
        }
      }

      if (foundReportFindings) break;

      if (toolResults.length > 0) {
        messages.push({ role: 'tool_result', results: toolResults });
      } else {
        break;
      }
    }

    if (!result || result.issues.length === 0) return null;

    const rawIssue = result.issues[0];
    if (!rawIssue)              return null;
    if (rawIssue.confidence < 0.7) return null;
    if (!rawIssue.suggestion)      return null;
    if (isSelfRejected(rawIssue.suggestion)) return null;

    if (isWeakSuggestion(rawIssue.suggestion)) {
      if (rawIssue.severity === 'minor') return null;
      const retried = await this.retryWeakSuggestion(rawIssue, messages);
      if (!retried) return null;
      rawIssue.suggestion = retried;
      if (isWeakSuggestion(rawIssue.suggestion)) return null;
    }

    return {
      severity:    rawIssue.severity,
      type:        rawIssue.type,
      evidence:    rawIssue.evidence,
      suggestion:  rawIssue.suggestion,
      confidence:  rawIssue.confidence,
      fingerprint: fingerprintIssue(slug, rawIssue.type, rawIssue.evidence.codeFile, rawIssue.suggestion),
    };
  }

  private async retryWeakSuggestion(
    rawIssue:     RawIssue,
    prevMessages: ChatMessage[],
  ): Promise<string | null> {
    const retryMessages: ChatMessage[] = [
      ...prevMessages,
      { role: 'user', text: 'The suggestion is too generic. Rewrite it to name the exact function, parameter, or line that needs to change.' },
    ];

    const response = await this.client.chat(
      this.pass2Model,
      this.systemPrompt,
      retryMessages,
      [REPORT_FINDINGS_TOOL],
      { type: 'tool', name: 'report_findings' },
      1024,
    );

    this.accumulateUsage(response.usage);

    const call = response.toolCalls.find(c => c.name === 'report_findings');
    if (!call) return null;
    const retried = call.input as ReportFindingsInput;
    return retried.issues[0]?.suggestion ?? null;
  }

  private accumulateUsage(usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }): void {
    this.costAccumulator.inputTokens         += usage.inputTokens;
    this.costAccumulator.outputTokens        += usage.outputTokens;
    this.costAccumulator.cacheReadTokens     += usage.cacheReadTokens     ?? 0;
    this.costAccumulator.cacheCreationTokens += usage.cacheWriteTokens    ?? 0;
  }
}
