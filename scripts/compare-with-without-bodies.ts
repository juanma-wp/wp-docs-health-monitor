/**
 * compare-with-without-bodies.ts — runs Pass 1 of the Claude validator twice
 * for the same doc: once with the full Source Code bulk (current behaviour),
 * once with bulk dropped (only doc + symbols + JSDoc + hooks + defaults).
 *
 * Both runs use temperature=0 so the comparison is deterministic. Reports
 * which candidate issues survived in each variant so we can decide whether
 * the structured extractor sections are sufficient on their own.
 *
 * Usage:
 *   npx tsx scripts/compare-with-without-bodies.ts <slug> [--config <path>]
 *
 * No Pass 2, no verbatim check — only Pass 1 candidates. Cost: ~2x normal
 * Pass 1 input + a small output, since cache hits between runs are limited
 * by the prompt diff.
 */

import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config/loader.js';
import { createDocSource, createCodeSources } from '../src/adapters/index.js';
import { MappingSchema } from '../src/types/mapping.js';
import { ClaudeValidator, type Pass1Candidate } from '../src/adapters/validator/claude.js';
import { readFile } from 'fs/promises';

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const configIdx = args.indexOf('--config');
const configPath = configIdx >= 0 ? args[configIdx + 1] : 'config/gutenberg-block-api.json';

if (!slug) {
  console.error('Usage: tsx scripts/compare-with-without-bodies.ts <slug> [--config <path>]');
  process.exit(1);
}

const config = await loadConfig(configPath as string);
const docSource   = createDocSource(config);
const codeSources = createCodeSources(config);
const mapping = MappingSchema.parse(JSON.parse(readFileSync(config.mappingPath, 'utf-8')));

console.error(`Fetching docs from ${configPath}...`);
const fetched = await docSource.fetchDocs();
const doc = fetched.flatMap(r => r.ok ? [r.doc] : []).find(d => d.slug === slug);
if (!doc) {
  console.error(`Slug "${slug}" not found in manifest.`);
  process.exit(1);
}

const codeTiers = mapping[slug];
if (!codeTiers) {
  console.error(`No mapping for slug "${slug}".`);
  process.exit(1);
}

const promptExtension = config.validator.systemPromptExtension
  ? await readFile(config.validator.systemPromptExtension, 'utf-8').catch(() => undefined)
  : undefined;

const anthropic = new Anthropic();
const validator = new ClaudeValidator(
  config.validator.pass1Model,
  config.validator.pass2Model,
  anthropic,
  promptExtension,
);

function fingerprint(c: Pass1Candidate): string {
  const evidenceFile = `${c.evidence.codeRepo}:${c.evidence.codeFile}`;
  const docKey = c.evidence.docSays.trim().slice(0, 80);
  return `${c.type}|${evidenceFile}|${docKey}`;
}

function summarise(label: string, result: { candidates: Pass1Candidate[]; positives: string[] }) {
  console.error(`\n=== ${label} — ${result.candidates.length} candidates / ${result.positives.length} positives ===`);
  for (const c of result.candidates) {
    console.error(`  [${c.severity}] ${c.type} (conf ${c.confidence}) — ${c.evidence.codeRepo}:${c.evidence.codeFile}`);
    console.error(`    docSays:  ${JSON.stringify(c.evidence.docSays).slice(0, 140)}`);
    console.error(`    codeSays: ${JSON.stringify(c.evidence.codeSays).slice(0, 140)}`);
  }
}

console.error(`Running Pass 1 WITH bodies (temperature=0)...`);
const withBodies = await validator.runPass1Only(doc, codeTiers, codeSources, {
  dropBodies: false,
  temperature: 0,
});
summarise('WITH BODIES', withBodies);

console.error(`\nRunning Pass 1 WITHOUT bodies (temperature=0)...`);
const withoutBodies = await validator.runPass1Only(doc, codeTiers, codeSources, {
  dropBodies: true,
  temperature: 0,
});
summarise('WITHOUT BODIES', withoutBodies);

const fpWith    = new Map(withBodies.candidates.map(c => [fingerprint(c), c]));
const fpWithout = new Map(withoutBodies.candidates.map(c => [fingerprint(c), c]));

const onlyWith    = [...fpWith.keys()].filter(k => !fpWithout.has(k));
const onlyWithout = [...fpWithout.keys()].filter(k => !fpWith.has(k));
const inBoth      = [...fpWith.keys()].filter(k =>  fpWithout.has(k));

console.error(`\n=== DIFF ===`);
console.error(`In both:        ${inBoth.length}`);
console.error(`Only WITH:      ${onlyWith.length}`);
console.error(`Only WITHOUT:   ${onlyWithout.length}`);
console.error(`Cost so far:    $${(
  (validator.costAccumulator.inputTokens         * config.pricing.inputPerMtok      / 1_000_000) +
  (validator.costAccumulator.outputTokens        * config.pricing.outputPerMtok     / 1_000_000) +
  (validator.costAccumulator.cacheCreationTokens * config.pricing.cacheWritePerMtok / 1_000_000) +
  (validator.costAccumulator.cacheReadTokens     * config.pricing.cacheReadPerMtok  / 1_000_000)
).toFixed(4)}`);

const retention = inBoth.length / Math.max(1, fpWith.size);
console.error(`Retention rate (without/with overlap as fraction of with): ${(retention * 100).toFixed(1)}%`);

console.log(JSON.stringify({
  slug,
  withBodies: {
    candidates: withBodies.candidates,
    positives:  withBodies.positives,
  },
  withoutBodies: {
    candidates: withoutBodies.candidates,
    positives:  withoutBodies.positives,
  },
  diff: {
    inBoth,
    onlyWith,
    onlyWithout,
    retention,
  },
}, null, 2));
