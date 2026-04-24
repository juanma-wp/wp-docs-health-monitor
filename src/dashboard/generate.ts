import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { RunResultsSchema, type RunResults } from '../types/results.js';
import { buildTree } from './tree-builder.js';
import { renderIndex } from './templates/index.js';
import { renderDoc } from './templates/doc.js';
import { renderFolder } from './templates/folder.js';

export async function generate(results: RunResults, outDir: string): Promise<void> {
  RunResultsSchema.parse(results);

  await mkdir(join(outDir, 'doc'), { recursive: true });
  await mkdir(join(outDir, 'folder'), { recursive: true });

  const tree = buildTree(results.docs);

  await writeFile(join(outDir, 'index.html'), renderIndex(results, tree), 'utf-8');

  for (const doc of results.docs) {
    await writeFile(join(outDir, 'doc', `${doc.slug}.html`), renderDoc(doc), 'utf-8');
  }

  for (const node of tree) {
    await writeFile(join(outDir, 'folder', `${node.parent}.html`), renderFolder(node), 'utf-8');
  }
}
