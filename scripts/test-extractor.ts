import { extractSymbolsFromSource, formatSymbolsAsText } from '../src/extractors/typescript.js';
import { readFileSync } from 'fs';

const filePath = process.argv[2] ?? './tmp/gutenberg-trunk/packages/blocks/src/api/registration.ts';
const repoRelPath = filePath.replace('./tmp/gutenberg-trunk/', '');

const content = readFileSync(filePath, 'utf-8');
const symbols = extractSymbolsFromSource(content, repoRelPath);

console.log(formatSymbolsAsText([{ repo: 'gutenberg', path: repoRelPath, symbols }]));
console.log(`\n→ ${symbols.length} symbols extracted`);
