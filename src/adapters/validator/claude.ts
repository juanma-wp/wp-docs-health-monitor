import Anthropic from '@anthropic-ai/sdk';

import type { Doc } from '../doc-source/types.js';
import type { CodeTiers } from '../../types/mapping.js';
import type { DocResult, Issue } from '../../types/results.js';
import type { CodeSource } from '../code-source/types.js';
import type { Validator } from './types.js';
import { assembleContext, formatContextForClaude } from './context-assembler.js';
import { formatSymbolsAsText } from '../../extractors/typescript.js';
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

Your job: find documentation drift that would **break a developer's code or mislead them into wrong behaviour**. You are not a documentation editor or a style reviewer. Imprecise prose, vague type labels, and minor wording inconsistencies are NOT your concern.

## The impact filter — apply this BEFORE reporting any issue

For every candidate issue, ask yourself this exact question:

> If a developer copies this part of the doc verbatim and uses it in their project, will their code fail, behave unexpectedly, or use a feature that no longer exists?

- If YES → report it.
- If NO → do not report it, no matter how technically imprecise the doc is.

This filter overrides everything else below. A finding that fails the filter must be omitted even if it matches a "what counts as drift" category.

## What counts as drift — high-impact, in priority order

These cause real developer pain. Look for these first.

1. **nonexistent-name** — a function, hook, filter, attribute, or property name in the doc that does not exist in the code. The developer would call something that returns undefined or throws.

2. **broken-example** — a code example in the doc that would throw, return the wrong type, or use removed APIs. Pay special attention to copy-paste-ready snippets.

3. **default-value** — the doc states a default value (or that a field has a particular default behaviour) and the code's actual default is different. The developer would build expectations on a wrong default.

4. **required-optional-mismatch** — the doc says a parameter / property is optional but the code requires it (or vice-versa). The developer would omit a required field, or pass an unnecessary one.

5. **deprecated-api** — the doc presents a deprecated API as current or recommended. The developer would adopt something marked for removal.

6. **type-signature** — a parameter was added, removed, or renamed; a return type changed in a way that would cause a developer's call to fail. **High bar**: only report when the type difference would actually break the developer's call. See anti-patterns below.

## What does NOT count as drift — explicit anti-patterns

The following have been observed as false positives. Do not report them:

- **Type label imprecision when the shape is the same**: doc says \`Object[]\`, code says \`BlockVariation[]\` — these refer to the same shape. The developer's code would not fail. SKIP.
- **Generic type labels for function types**: doc says \`Function\`, code says \`(a: A, b: B) => boolean\` — both describe a callable. The developer's code would not fail. SKIP.
- **Equivalent type aliases**: doc says \`number\` and \`integer\` are equivalent, code treats them equivalently. SKIP.
- **Naming style differences in references**: doc says "BlockVariationPicker" while code exports \`__experimentalBlockVariationPicker\` — if the doc text already conveys the experimental nature in prose, the developer is informed enough. SKIP.
- **More precise type than documented**: doc shows the shape, code adds generics. SKIP unless the developer would be surprised.
- **Imprecise return type prose**: doc says "returns Object | Array", code returns a specific shape — if the developer's code would still work treating it as Object/Array, SKIP.
- **Teaching simplifications**: intentional omission of edge cases for clarity.
- **Undocumented optional parameters**: unless omitting them would break the developer's code.
- **Style, grammar, typos, broken external links** — never report.

## Severity

- **critical**: following the doc would cause the developer's code to fail or produce incorrect output (compile error, runtime error, wrong data).
- **major**: following the doc would lead to wrong behaviour or a developer hitting a wall, but not an immediate crash.
- **minor**: technically inaccurate AND would surprise a careful developer, but most usage would still work. Use sparingly.

If you cannot articulate the concrete developer-facing breakage, the issue is not worth reporting.

## Source authority — ranked highest to lowest

When multiple source files are provided, resolve conflicts in this order:

1. **Test files** (path contains /test/ or .test.) — highest authority. A test assertion is an explicit contract about intended public API behavior. If a test confirms the doc claim, it is not drift. If a test contradicts the doc claim, that is strong evidence of drift.

2. **AST-generated symbols + JSDoc** — when present, a machine-extracted list of exported names, signatures, JSDoc descriptions, and tags (\`@default\`, \`@deprecated\`, \`@since\`). **Use this section as a NAVIGATION AID** — to look up what's in the codebase and find the right files to verify against. Do NOT treat it as a checklist of things to compare against the doc; that path leads to type-label nitpicks. Use it to confirm or refute specific claims, not as a target for exhaustive comparison.

3. **TypeScript type definition files** (types.ts, .d.ts) — authoritative for the public API surface.

4. **JSDoc / PHPDoc inline comments** — describe intended behavior. If JSDoc confirms the doc claim, prefer that over code-body logic.

5. **JSON Schema files** (e.g. schemas/json/block.json) — valid for property names and allowed values only. Do NOT use their required arrays to determine whether a field is required — confirm that in TypeScript or PHP source.

6. **Implementation code** — authoritative for runtime behavior. Look here for actual default values, fallback logic, and concrete behavior that types and JSDoc don't capture (e.g. \`variation.scope || ['block', 'inserter']\`).

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

## Positives — what's right AND what's missing

Use the \`positives\` array (max 3 items) for two kinds of concrete findings:

1. **Things the doc gets specifically right** — point to something in both the doc and the code. Use this when the doc is accurate on a non-trivial point.

2. **Useful capabilities the doc fails to mention** — when the code exposes a feature, parameter, hook, or behaviour that would clearly benefit developers but is not documented at all. These are gaps, not drift. They're not breakage, but they leave developers unable to use the API to its full extent.

Each item must be concrete: name the specific function / parameter / hook / pattern, and either confirm the doc covers it correctly OR explain what's missing and why a developer would want to know. Format gap items with the prefix \`GAP:\` so they can be distinguished from confirmations. Example:

- \`GAP: registerBlockBindingsSource accepts a "usesContext" array, but the doc never mentions it. This lets a binding source declare which block-context values it needs.\`

Do NOT write generic positives like "the documentation is clear" or generic gaps like "more examples would help". Both must reference a specific identifier from the code.`;

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
// Cost accumulator type
// ---------------------------------------------------------------------------

export type CostAccumulator = {
  inputTokens:        number;
  outputTokens:       number;
  cacheReadTokens:    number;
  cacheCreationTokens: number;
};

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
    const symbolsText = formatSymbolsAsText(assembled.extractedSymbols);
    const symbolsSection = symbolsText
      ? `\n\n---\n\n## Exported API symbols\n\n${symbolsText}`
      : '';
    const missingSymbolsHint = assembled.missingSymbols.length > 0
      ? `\n\n## Potentially removed APIs\n\nThe following identifiers appear in the doc but were not found in any source file. Investigate each as a possible \`nonexistent-name\` issue:\n\n${assembled.missingSymbols.map(s => `- \`${s}\``).join('\n')}`
      : '';
    const userContent = `## Documentation: ${doc.title}

URL: ${doc.sourceUrl}

${doc.content}${symbolsSection}

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

    // Verbatim check — both docSays and codeSays must be real quotes
    const verbatimPassed: RawIssue[] = [];
    for (const issue of pass1Issues) {
      const { codeRepo, codeFile, codeSays, docSays } = issue.evidence;

      // docSays must be a verbatim quote from the doc
      const docNeedle = docSays.trim();
      if (!doc.content.includes(docNeedle)) {
        this.droppedHallucinations++;
        console.warn(`[verbatim-check] dropped issue in ${doc.slug}: docSays "${docSays}" not found in doc content`);
        continue;
      }

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
          console.warn(`[verbatim-check] dropped issue in ${doc.slug}: codeSays "${codeSays}" not found in ${codeRepo}:${codeFile}`);
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
