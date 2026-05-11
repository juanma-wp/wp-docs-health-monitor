import type { CodeFile } from '../types/mapping.js';
import type { CodeSource } from '../adapters/code-source/types.js';
import type { ExtractedSchema } from './types.js';

export type { ExtractedSchema } from './types.js';

// Cap is generous because schemas are authoritative and frequently end with
// the top-level `required` array — truncating loses critical evidence.
// gutenberg's block.json is ~44k; raise as needed for larger schemas.
const MAX_SCHEMA_CHARS = 80_000;
const SCHEMA_EXTS = new Set(['json']);

export function isSchemaFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return SCHEMA_EXTS.has(ext);
}

export async function extractSchemasFromFiles(
  files: CodeFile[],
  codeSources: Record<string, CodeSource>,
): Promise<ExtractedSchema[]> {
  const results: ExtractedSchema[] = [];

  for (const file of files) {
    if (!isSchemaFile(file.path)) continue;

    const source = codeSources[file.repo];
    if (!source) continue;

    try {
      const content = await source.readFile(file.path);
      if (content.length > MAX_SCHEMA_CHARS) {
        results.push({
          repo:      file.repo,
          path:      file.path,
          content:   content.slice(0, MAX_SCHEMA_CHARS),
          truncated: true,
        });
      } else {
        results.push({ repo: file.repo, path: file.path, content, truncated: false });
      }
    } catch {
      // Skip unreadable files — callers handle missing results
    }
  }

  return results;
}

export function formatSchemasAsText(schemas: ExtractedSchema[]): string {
  if (schemas.length === 0) return '';
  return schemas
    .map(s => {
      const header = `### [${s.repo}] ${s.path}${s.truncated ? '  (truncated)' : ''}`;
      return `${header}\n\`\`\`json\n${s.content}\n\`\`\``;
    })
    .join('\n\n');
}
