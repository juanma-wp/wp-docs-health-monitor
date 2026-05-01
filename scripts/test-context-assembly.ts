/**
 * test-context-assembly.ts — prints the assembled Claude prompt for one doc.
 *
 * Usage:
 *   npx tsx scripts/test-context-assembly.ts [slug]
 *
 * Defaults to the first doc in the manifest if no slug is provided.
 * No API calls to Claude — zero cost.
 */

import { readFileSync } from 'fs';
import { loadConfig } from '../src/config/loader.js';
import { createDocSource, createCodeSources } from '../src/adapters/index.js';
import { MappingSchema } from '../src/types/mapping.js';
import { assembleContext, formatContextForClaude } from '../src/adapters/validator/context-assembler.js';
import { formatSymbolsAsText } from '../src/extractors/typescript.js';

const targetSlug = process.argv[2];
const config = await loadConfig('config/gutenberg-block-api.json');

const docSource = createDocSource(config);
const codeSources = createCodeSources(config);
const mapping = MappingSchema.parse(JSON.parse(readFileSync(config.mappingPath, 'utf-8')));

console.error('Fetching docs...');
const results = await docSource.fetchDocs();
const docs = results.flatMap(r => r.ok ? [r.doc] : []);

const doc = targetSlug
  ? docs.find(d => d.slug === targetSlug)
  : docs.find(d => mapping[d.slug] !== undefined);

if (!doc) {
  console.error(`Slug "${targetSlug}" not found. Available: ${docs.map(d => d.slug).join(', ')}`);
  process.exit(1);
}

const codeTiers = mapping[doc.slug];
if (!codeTiers) {
  console.error(`No mapping for slug "${doc.slug}"`);
  process.exit(1);
}

console.error(`Assembling context for: ${doc.slug}`);
const assembled = await assembleContext(doc, codeTiers, codeSources);

const symbolsText = formatSymbolsAsText(assembled.extractedSymbols);
const symbolsSection = symbolsText
  ? `\n\n---\n\n## Exported API symbols\n\n${symbolsText}`
  : '';

const userMessage = `## Documentation: ${doc.title}

URL: ${doc.sourceUrl}

${doc.content}${symbolsSection}

---

## Source Code

${formatContextForClaude(assembled.sourceCodeBlocks) || '(No source files were available for this document.)'}`;

console.log(userMessage);
console.error(`\n--- Stats ---`);
console.error(`Symbols extracted: ${assembled.extractedSymbols.reduce((n, f) => n + f.symbols.length, 0)} from ${assembled.extractedSymbols.length} file(s)`);
console.error(`Source code files: ${assembled.sourceCodeBlocks.length} of ${assembled.fileBlocks.length} total mapped`);
console.error(`Estimated tokens: ${assembled.estimatedTokens}`);
console.error(`Missing symbols: ${assembled.missingSymbols.length}`);
