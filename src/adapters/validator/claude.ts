import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';

import type { Doc } from '../doc-source/types.js';
import type { CodeTiers } from '../../types/mapping.js';
import type { DocResult, Issue } from '../../types/results.js';
import type { CodeSource } from '../code-source/types.js';
import type { Validator } from './types.js';
import { assembleContext, formatContextForClaude, isTestFile } from './context-assembler.js';
import { formatSymbolsAsText } from '../../extractors/typescript.js';
import { formatHooksAsText } from '../../extractors/hooks.js';
import { formatDefaultsAsText } from '../../extractors/defaults.js';
import { formatSchemasAsText } from '../../extractors/schemas.js';
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

export type Pass1Candidate = RawIssue;

export type RunPass1Result = {
  candidates: Pass1Candidate[];
  positives:  string[];
};

export type RunPass1Options = {
  dropBodies?:  boolean;
  temperature?: number;
};

// ---------------------------------------------------------------------------
// System prompt (cached across calls)
//
// Prose lives in `./prompts/system.md` so prompt chang[es diff as Markdown
// rather than as escaped TypeScript template literals. The .md is read once
// at module init via `import.meta.url`. Per-site extensions are appended at
// the constructor seam (see `systemPrompt` assignment below) — this constant
// holds the common gate only.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(new URL('./prompts/system.md', import.meta.url)),
  'utf-8',
).trimEnd();

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

// Cap on issues per doc per Pass 1. Encoded on the tool schema rather
// than in the prompt: structural caps belong with the schema, prose
// caps drift. The 1,787-malformed-evidence event on `block-patterns`
// (run 20260502-124630) showed what happens when a degenerate output
// has no schema-level brake.
export const PASS1_MAX_ISSUES = 10;

export const REPORT_FINDINGS_TOOL: Anthropic.Tool = {
  name: 'report_findings',
  description: 'Report all drift issues and positives found in the documentation.',
  input_schema: {
    type: 'object' as const,
    required: ['issues', 'positives'],
    properties: {
      issues: {
        type: 'array',
        maxItems: PASS1_MAX_ISSUES,
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
      repo:      { type: 'string', description: 'Repo ID — must be one of the keys configured in `codeSources` for this corpus' },
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

// Tolerant normalisation for verbatim substring comparison.
//
// Models paraphrase content rather than quote it byte-for-byte:
//   1. Multi-line content (bullet lists, indented blocks, continuation
//      lines) gets flattened to a smooth quotable form — single spaces,
//      no line breaks.
//   2. Markdown link syntax `[text](url)` gets rendered to plain `text`
//      (the model writes what it visually parses, not the raw markup).
//
// Both have produced silent drops on real docs (block-attributes
// `source` enum lists, block-patterns `filePath` PHPDoc evidence).
// A byte-exact `.includes()` would treat these as hallucinations even
// though the meaningful content is identical.
//
// Generic by design — applies to any Markdown-based docs site:
//   - Whitespace collapse: universal across docs/codebases.
//   - Markdown link stripping: universal across Markdown-based docs.
//
// Intentionally OUT OF SCOPE:
//   - Comment-continuation characters (`*` PHPDoc, `#` Python, `///`
//     Rust) — language-specific; per-site configuration territory.
//   - Bold/italic emphasis markers (`**foo**`, `__foo__`) — risk of
//     false-merging identifiers like `__experimental`. Add only with
//     evidence.
//   - Inline code backticks (`` `foo` ``) — structural marker that
//     distinguishes identifiers from prose; preserve.
//   - Bullet markers (`- `, `* `) — handled in verbatimIncludes as a
//     second-chance strategy rather than here, because stripping them
//     from both sides of the base normaliser would break the existing
//     match where whitespace-collapse already turns multi-line bullet
//     content into inline ` - ` separators that the model retains.
export function normalizeForVerbatim(s: string): string {
  return s
    // Strip Markdown link syntax: [text](url) → text. Works for inline
    // links and image alt text; ignores nested-bracket edge cases.
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Collapse runs of whitespace to a single space.
    .replace(/\s+/g, ' ')
    .trim();
}

// Verbatim substring check with two additional fallback strategies.
//
// Strategy 2 — bullet-stripped match:
//   Models sometimes prefix each quoted line with `- ` when the doc
//   section is a bullet list. After normalizeForVerbatim these appear
//   as a leading `- ` or inline ` - ` separators in the needle.
//   Stripping them from both sides and retrying catches this pattern
//   without touching the base normaliser (which needs those ` - `
//   separators intact for the inverse case where the model collapses
//   multi-line bullets into a single inline-dashed phrase).
//
// Strategy 3 — single backtick identifier fallback:
//   Docs sometimes omit the backticks around a property name in prose
//   even when the model correctly quotes it as `identifier`. Allow a
//   single-token backtick-wrapped needle to match the plain-text form.
export function verbatimIncludes(haystack: string, needle: string): boolean {
  const n = normalizeForVerbatim(needle);

  // Strategy 1: direct normalized match
  if (haystack.includes(n)) return true;

  // Strategy 2: bullet-stripped match on both sides
  const stripBullets = (s: string): string =>
    s.replace(/(?:^| )- /g, ' ').replace(/\s+/g, ' ').trim();
  const nStripped = stripBullets(n);
  if (nStripped !== n && stripBullets(haystack).includes(nStripped)) return true;

  // Strategy 3: single backtick identifier against plain text
  const singleIdent = n.match(/^`([^`\s]+)`$/);
  if (singleIdent) return haystack.includes(singleIdent[1]);

  return false;
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
    const userContent = ClaudeValidator.buildUserContent(doc, assembled, {});

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

    // Verbatim check — both docSays and codeSays must be real quotes.
    // Comparison is whitespace-tolerant (see normalizeForVerbatim) so
    // multi-line bullet lists and continuation-line content survive.
    const verbatimPassed: RawIssue[] = [];
    const normalizedDoc = normalizeForVerbatim(doc.content);
    const normalizedFileCache = new Map<string, string>();
    for (const issue of pass1Issues) {
      const { codeRepo, codeFile, codeSays, docSays } = issue.evidence;

      // docSays must be a verbatim quote from the doc
      if (!verbatimIncludes(normalizedDoc, docSays)) {
        this.droppedHallucinations++;
        const conf = issue.confidence;
        const tag = conf >= 0.9 ? `[verbatim-check][high-conf:${conf}]` : '[verbatim-check]';
        console.warn(`${tag} dropped issue in ${doc.slug}: docSays "${docSays}" not found in doc content`);
        continue;
      }

      if (!codeSources[codeRepo]) {
        diagnostics.push(`Unknown repo "${codeRepo}" in issue evidence — dropping`);
        continue;
      }
      try {
        const cacheKey = `${codeRepo}:${codeFile}`;
        let normalizedFile = normalizedFileCache.get(cacheKey);
        if (normalizedFile === undefined) {
          normalizedFile = normalizeForVerbatim(await codeSources[codeRepo].readFile(codeFile));
          normalizedFileCache.set(cacheKey, normalizedFile);
        }
        // nonexistent-name evidence is absence — there is no quote to find in the file
        const isAbsenceIssue = issue.type === 'nonexistent-name';
        if (!isAbsenceIssue && !verbatimIncludes(normalizedFile, codeSays)) {
          this.droppedHallucinations++;
          const conf = issue.confidence;
          const tag = conf >= 0.9 ? `[verbatim-check][high-conf:${conf}]` : '[verbatim-check]';
          console.warn(`${tag} dropped issue in ${doc.slug}: codeSays "${codeSays}" not found in ${codeRepo}:${codeFile}`);
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

  // Public helper used by experiment scripts. Builds the same Pass 1 user
  // message that validateDoc would, optionally dropping the Source Code bulk.
  static buildUserContent(
    doc: Doc,
    assembled: Awaited<ReturnType<typeof assembleContext>>,
    options: { dropBodies?: boolean } = {},
  ): string {
    // dropBodies omits implementation source code but ALWAYS retains test
    // files — assertion strings and inline comments often carry drift
    // evidence (e.g. expected error messages, expected outputs) that the
    // structured extractors cannot capture.
    const renderedFileBlocks = options.dropBodies
      ? assembled.fileBlocks.filter(fb => isTestFile(fb.path))
      : assembled.fileBlocks;
    const codeContext = formatContextForClaude(renderedFileBlocks);
    const symbolsText  = formatSymbolsAsText(assembled.extractedSymbols);
    const hooksText    = formatHooksAsText(assembled.extractedHooks);
    const defaultsText = formatDefaultsAsText(assembled.extractedDefaults);
    const schemasText  = formatSchemasAsText(assembled.extractedSchemas);
    // Each structured section carries its own authority note inline — the
    // system prompt's "How to read the input" section tells the model to
    // read these notes before using the section's content. Keep the notes
    // claim-type-keyed (what is this section AUTHORITATIVE FOR? what is it
    // NOT?) rather than restating a global ranking.
    const symbolsSection = symbolsText
      ? `\n\n---\n\n## Exported API symbols\n\nMachine-extracted from the source AST: exported names, signatures, and the documentation tags attached to them. Authoritative for: which symbols exist (this is the canonical export list), their signatures, and the lifecycle/intent tags surfaced here. NOT authoritative for runtime behaviour or descriptive prose — verify those in Source Code. Use this section to confirm or refute specific claims you already have in mind, not as a checklist to walk against the doc.\n\n${symbolsText}`
      : '';
    const hooksSection = hooksText
      ? `\n\n---\n\n## Hooks and filters\n\nFiring sites for action and filter hooks. Authoritative for: which hook names exist and where they fire. Use to verify hook names referenced in the documentation.\n\n${hooksText}`
      : '';
    const defaultsSection = defaultsText
      ? `\n\n---\n\n## Defaults\n\nExtracted default-value sites (e.g. \`wp_parse_args\` calls, object-spread merges). Authoritative for: documented default-value claims when a literal default is visible here. If a documented default is built from a fallback expression (\`value ?? X\`, \`value || X\`) or computed, cross-reference Source Code — runtime behaviour wins.\n\n${defaultsText}`
      : '';
    // Schemas survive `dropBodies`: JSON files are small and load-bearing
    // for property/enum claims, worth keeping when Source Code is omitted.
    const schemasSection = schemasText
      ? `\n\n---\n\n## Schemas\n\nJSON schema files. Authoritative for: property names and allowed enum values. NOT a sole source for whether a field is required — confirm "required" claims against the implementation language rather than the schema's \`required\` array, unless the per-site extension elevates schema authority.\n\n${schemasText}`
      : '';
    const missingSymbolsHint = assembled.missingSymbols.length > 0
      ? `\n\n## Potentially removed APIs\n\nThe following identifiers appear in the doc but were not found in any source file. Investigate each as a possible \`nonexistent-name\` issue:\n\n${assembled.missingSymbols.map(s => `- \`${s}\``).join('\n')}`
      : '';
    // The dropBodies experiment seam ships only test files (assertions
    // carry drift evidence — expected error messages, expected outputs —
    // that the structured extractors cannot capture). Keep the model
    // oriented when the implementation bulk is missing.
    const sourceCodeBlock = options.dropBodies
      ? (codeContext
          ? `(Implementation source code omitted for this run — only test files are included below. Use the structured sections above for surface-contract claims.)\n\n${codeContext}`
          : '(Implementation source code omitted for this run, and no test files were available. Rely on the structured sections above.)')
      : (codeContext || '(No source files were available for this document.)');
    const sourceCodeAuthorityNote = 'Authoritative for: runtime behaviour, default values built from fallback expressions, branching logic, error paths — anything not captured by the structured sections above. Test files (when present, identified by path or filename convention) are corroborating evidence: a failing assertion against the doc claim is strong drift signal; a passing test only confirms the case it tests.';
    return `## Documentation: ${doc.title}

URL: ${doc.sourceUrl}

${doc.content}${symbolsSection}${hooksSection}${defaultsSection}${schemasSection}

---

## Source Code

${sourceCodeAuthorityNote}

${sourceCodeBlock}${missingSymbolsHint}`;
  }

  // Public entrypoint for experiment scripts: runs only Pass 1 and returns
  // the raw candidates (no verbatim check, no Pass 2). Supports temperature
  // override and dropBodies for fair extractor-vs-bulk comparisons.
  async runPass1Only(
    doc: Doc,
    codeTiers: CodeTiers,
    codeSources: Record<string, CodeSource>,
    options: RunPass1Options = {},
  ): Promise<RunPass1Result> {
    const assembled = await assembleContext(doc, codeTiers, codeSources);
    const userContent = ClaudeValidator.buildUserContent(doc, assembled, {
      dropBodies: options.dropBodies,
    });
    const result = await this.runPass1(userContent, options.temperature);
    return { candidates: result.issues, positives: result.positives };
  }

  private async runPass1(
    userContent: string,
    temperature?: number,
  ): Promise<ReportFindingsInput> {
    const response = await this.anthropic.messages.create({
      model:      this.pass1Model,
      // 8192 sized for up to PASS1_MAX_ISSUES issues × structured
      // suggestion (~500 tokens each) + positives + slack. 4096 was
      // tight on multi-issue docs and contributed to truncation.
      max_tokens: 8192,
      ...(temperature !== undefined ? { temperature } : {}),
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
        // TEMP DIAGNOSTIC: capture Pass 1 raw shape when DUMP_PASS1=1
        // Used to investigate the block-patterns "1787 malformed evidence" event.
        // Remove after the structural fix lands.
        if (process.env.DUMP_PASS1) {
          const inp = block.input as Record<string, unknown> | undefined;
          const issues = inp?.issues as unknown;
          const issuesType = Array.isArray(issues) ? 'array' : typeof issues;
          const issuesLen = Array.isArray(issues)
            ? issues.length
            : (typeof issues === 'string' ? issues.length : 'n/a');
          console.warn(
            `[pass1-dump] stop_reason=${response.stop_reason} issuesType=${issuesType} length=${issuesLen} outTok=${response.usage.output_tokens}`,
          );
          try {
            const fs = await import('fs');
            const path = await import('path');
            const dir = '/tmp/wp-docs-pass1-dump';
            fs.mkdirSync(dir, { recursive: true });
            const ts = Date.now();
            fs.writeFileSync(
              path.join(dir, `pass1-${ts}.json`),
              JSON.stringify({
                stop_reason: response.stop_reason,
                usage:       response.usage,
                inputType:   typeof block.input,
                inputIsArray: Array.isArray(block.input),
                input:       block.input,
              }, null, 2),
            );
          } catch {
            // ignore — diagnostic only
          }
        }
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
