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
import { formatHooksAsText } from '../src/extractors/hooks.js';
import { formatDefaultsAsText } from '../src/extractors/defaults.js';
import { formatSchemasAsText } from '../src/extractors/schemas.js';

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

const symbolsText  = formatSymbolsAsText(assembled.extractedSymbols);
const hooksText    = formatHooksAsText(assembled.extractedHooks);
const defaultsText = formatDefaultsAsText(assembled.extractedDefaults);
const schemasText  = formatSchemasAsText(assembled.extractedSchemas);
const symbolsSection = symbolsText
  ? `\n\n---\n\n## Exported API symbols\n\n${symbolsText}`
  : '';
const hooksSection = hooksText
  ? `\n\n---\n\n## Hooks and filters\n\nFiring sites for action and filter hooks. Use these to verify hook names referenced in the documentation.\n\n${hooksText}`
  : '';
const defaultsSection = defaultsText
  ? `\n\n---\n\n## Defaults\n\nDefault-value sites: \`wp_parse_args\` calls in PHP and object-spread merges in JS/TS. Use these to verify documented default values.\n\n${defaultsText}`
  : '';
const schemasSection = schemasText
  ? `\n\n---\n\n## Schemas\n\nJSON schema files. Authoritative for property names and allowed enum values. Confirm field requirements against TypeScript or PHP source rather than the schema's \`required\` array.\n\n${schemasText}`
  : '';

const userMessage = `## Documentation: ${doc.title}

URL: ${doc.sourceUrl}

${doc.content}${symbolsSection}${hooksSection}${defaultsSection}${schemasSection}

---

## Source Code

${formatContextForClaude(assembled.fileBlocks) || '(No source files were available for this document.)'}`;

console.log(userMessage);
console.error(`\n--- Stats ---`);
console.error(`Symbols extracted: ${assembled.extractedSymbols.reduce((n, f) => n + f.symbols.length, 0)} from ${assembled.extractedSymbols.length} file(s)`);
console.error(`Hooks extracted: ${assembled.extractedHooks.reduce((n, f) => n + f.hooks.length, 0)} from ${assembled.extractedHooks.length} file(s)`);
console.error(`Defaults extracted: ${assembled.extractedDefaults.reduce((n, f) => n + f.defaults.length, 0)} from ${assembled.extractedDefaults.length} file(s)`);
console.error(`Schemas extracted: ${assembled.extractedSchemas.length} file(s)${assembled.extractedSchemas.some(s => s.truncated) ? ' (some truncated)' : ''}`);
console.error(`File blocks: ${assembled.fileBlocks.length}`);
console.error(`Estimated tokens: ${assembled.estimatedTokens}`);
console.error(`Missing symbols: ${assembled.missingSymbols.length}`);
