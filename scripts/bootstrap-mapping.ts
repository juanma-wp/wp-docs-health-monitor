#!/usr/bin/env tsx
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../src/config/loader.js';
import { ManifestEntrySchema, CodeTiersSchema } from '../src/types/index.js';
import { createCodeSources } from '../src/adapters/index.js';

const args = process.argv.slice(2);
const slugIndex = args.findIndex((a) => !a.startsWith('--'));
const slug = slugIndex >= 0 ? args[slugIndex] : undefined;
const configIndex = args.indexOf('--config');
const configPath = configIndex >= 0 ? args[configIndex + 1] : 'config/gutenberg-block-api.json';

if (!slug) {
  console.error('Usage: npx tsx scripts/bootstrap-mapping.ts <slug> [--config <path>]');
  process.exit(1);
}

async function main() {
  const config = await loadConfig(configPath);

  const manifestRes = await fetch(config.docSource.manifestUrl);
  if (!manifestRes.ok) throw new Error(`Failed to fetch manifest: HTTP ${manifestRes.status}`);
  const rawEntries = await manifestRes.json() as unknown[];

  const entries = rawEntries
    .map((raw) => {
      const withAbsolute = {
        ...(raw as Record<string, unknown>),
        markdown_source: new URL(
          (raw as Record<string, string>).markdown_source,
          config.docSource.manifestUrl
        ).href,
      };
      return ManifestEntrySchema.safeParse(withAbsolute);
    })
    .filter((r) => r.success)
    .map((r) => r.data!);

  const entry = entries.find((e) => e.slug === slug);
  if (!entry) {
    console.error(`Slug "${slug}" not found in manifest`);
    process.exit(1);
  }

  const docRes = await fetch(entry.markdown_source);
  if (!docRes.ok) throw new Error(`Failed to fetch doc: HTTP ${docRes.status}`);
  const docContent = await docRes.text();

  const codeSources = await createCodeSources(config);

  const fileTrees: string[] = [];
  for (const [repoId, source] of Object.entries(codeSources)) {
    const files = await source.listDir('.');
    fileTrees.push(`# ${repoId}\n${files.join('\n')}`);
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Given this Block API Reference doc and these repo file trees, which files are most relevant for understanding the APIs described? Return only a JSON object matching this shape: { primary: [{repo, path}], secondary: [{repo, path}], context: [{repo, path}] } — max 3 primary, 5 secondary, 8 context. Use only file paths that actually appear in the provided file trees.

## Doc content
${docContent}

## File trees
${fileTrees.join('\n\n')}`,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON found in response');
    process.exit(1);
  }

  const tiers = CodeTiersSchema.parse(JSON.parse(jsonMatch[0]));
  const output = { [slug as string]: tiers };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
