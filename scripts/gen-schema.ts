import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { RunResultsSchema } from '../src/types/results.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../examples/results.schema.json');

mkdirSync(dirname(outPath), { recursive: true });

const jsonSchema = zodToJsonSchema(RunResultsSchema, {
  name: 'RunResults',
  $refStrategy: 'none',
});

writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + '\n');
console.log(`Written: ${outPath}`);
