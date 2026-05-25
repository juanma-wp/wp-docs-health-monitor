import { existsSync, readFileSync, writeFileSync } from 'fs';

const [, , existingPath, newPath] = process.argv;

if (!existingPath || !newPath) {
  console.error('Usage: node scripts/merge-history.mjs <existing-history-path> <new-entry-source-path>');
  process.exit(1);
}

const existing = existsSync(existingPath)
  ? JSON.parse(readFileSync(existingPath, 'utf-8'))
  : [];
const incoming = JSON.parse(readFileSync(newPath, 'utf-8'));

if (!Array.isArray(existing)) {
  throw new Error(`Expected existing history at ${existingPath} to be a JSON array.`);
}

if (!Array.isArray(incoming) || incoming.length === 0) {
  throw new Error(`Expected incoming history at ${newPath} to be a non-empty JSON array.`);
}

const newestLocalEntry = incoming[incoming.length - 1];
if (!newestLocalEntry || typeof newestLocalEntry.runId !== 'string' || newestLocalEntry.runId.length === 0) {
  throw new Error(`Expected incoming history at ${newPath} to contain an entry with a runId.`);
}

const merged = [newestLocalEntry, ...existing.filter(entry => entry?.runId !== newestLocalEntry.runId)];

writeFileSync(existingPath, JSON.stringify(merged, null, 2) + '\n');
console.log(`history.json updated — ${merged.length} total runs`);
