/**
 * bootstrap-mapping.ts — dev-time helper for seeding mappings/gutenberg-block-api.json
 *
 * Usage:
 *   npx tsx scripts/bootstrap-mapping.ts <slug> [--config <path>]
 *
 * For each slug, asks Claude to propose a CodeTiers entry based on the doc
 * content and the repo file trees. A human reviews the output and merges it
 * into mappings/gutenberg-block-api.json.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config/loader.js';
import { createCodeSources } from '../src/adapters/index.js';
import { ManifestEntrySchema } from '../src/types/mapping.js';
import { CodeTiersSchema } from '../src/types/mapping.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { slug: string; configPath: string } {
  const args = argv.slice(2);
  let slug = '';
  let configPath = resolve(__dirname, '../config/gutenberg-block-api.json');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = resolve(args[i + 1]);
      i++;
    } else if (!slug && !args[i].startsWith('--')) {
      slug = args[i];
    }
  }

  if (!slug) {
    console.error('Usage: npx tsx scripts/bootstrap-mapping.ts <slug> [--config <path>]');
    process.exit(1);
  }

  return { slug, configPath };
}

async function main() {
  const { slug, configPath } = parseArgs(process.argv);
  const config = await loadConfig(configPath);

  // 1. Fetch the manifest and find the entry for this slug
  const manifestRes = await fetch(config.docSource.manifestUrl);
  if (!manifestRes.ok) {
    console.error(`Failed to fetch manifest: HTTP ${manifestRes.status}`);
    process.exit(1);
  }

  const rawEntries = await manifestRes.json() as unknown[];
  const resolvedEntries = rawEntries.flatMap((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const entry = raw as Record<string, unknown>;
    if (typeof entry.markdown_source === 'string') {
      entry.markdown_source = new URL(entry.markdown_source, config.docSource.manifestUrl).href;
    }
    const parsed = ManifestEntrySchema.safeParse(entry);
    if (!parsed.success) return [];
    return [parsed.data];
  });

  const entry = resolvedEntries.find(e => e.slug === slug);
  if (!entry) {
    console.error(`Slug "${slug}" not found in manifest. Available slugs: ${resolvedEntries.map(e => e.slug).join(', ')}`);
    process.exit(1);
  }

  // 2. Fetch the doc's markdown content
  const docRes = await fetch(entry.markdown_source);
  if (!docRes.ok) {
    console.error(`Failed to fetch doc content: HTTP ${docRes.status}`);
    process.exit(1);
  }
  const docContent = await docRes.text();

  // 3. Instantiate all CodeSources and get file trees
  const codeSources = createCodeSources(config);
  const fileTrees: string[] = [];
  for (const [id, cs] of Object.entries(codeSources)) {
    console.error(`Listing files for repo "${id}"...`);
    const files = await cs.listDir('.');
    fileTrees.push(`# ${id}\n${files.join('\n')}`);
  }

  // 4. Call Claude
  const client = new Anthropic();
  const prompt = `Given this Block API Reference doc and these repo file trees, which files are most relevant for understanding the APIs described?

Return only a JSON object matching this shape:
{ "primary": [{"repo": "...", "path": "..."}], "secondary": [{"repo": "...", "path": "..."}], "context": [{"repo": "...", "path": "..."}] }

Constraints:
- max 3 primary, 5 secondary, 8 context
- Use ONLY file paths that actually appear in the provided file trees
- Each entry must have "repo" matching one of the repo IDs from the file trees

## Doc content (${slug})

${docContent}

## File trees

${fileTrees.join('\n\n')}`;

  console.error(`Asking Claude (${config.validator.pass1Model}) for mapping suggestions...`);
  const message = await client.messages.create({
    model: config.validator.pass1Model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawResponse = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Extract JSON from the response
  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Could not extract JSON from Claude response:');
    console.error(rawResponse);
    process.exit(1);
  }

  // 5. Validate response against CodeTiersSchema
  let tiers;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    tiers = CodeTiersSchema.parse(parsed);
  } catch (err) {
    console.error('Claude response failed validation:', err);
    console.error('Raw response:', rawResponse);
    process.exit(1);
  }

  // 6. Print to stdout as JSON for human review
  const output = { [slug]: tiers };
  console.log(JSON.stringify(output, null, 2));
  console.error(`\nReview the above output and merge it into mappings/gutenberg-block-api.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
