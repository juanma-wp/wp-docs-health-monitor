import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

export const RUN_ID_PATTERN = /^\d{8}-\d{6}$/;

function assertHistoryEntry(entry, pathLabel) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Expected every history entry in ${pathLabel} to be an object.`);
  }

  if (typeof entry.runId !== 'string' || !RUN_ID_PATTERN.test(entry.runId)) {
    throw new Error(`Expected every history entry in ${pathLabel} to contain a valid runId.`);
  }
}

function dedupeAppendOrder(history) {
  const deduped = new Map();

  for (const entry of history) {
    deduped.delete(entry.runId);
    deduped.set(entry.runId, entry);
  }

  return [...deduped.values()];
}

function dedupeNewestFirst(history) {
  const seen = new Set();
  const deduped = [];

  for (const entry of history) {
    if (seen.has(entry.runId)) {
      continue;
    }
    seen.add(entry.runId);
    deduped.push(entry);
  }

  return deduped;
}

export function readHistoryFile(path, options = {}) {
  const { allowMissing = false } = options;

  if (!existsSync(path)) {
    if (allowMissing) {
      return [];
    }
    throw new Error(`History file does not exist: ${path}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected history at ${path} to be a JSON array.`);
  }

  for (const entry of parsed) {
    assertHistoryEntry(entry, path);
  }

  return parsed;
}

export function buildPublishPlan(existingHistory, localHistory) {
  if (localHistory.length === 0) {
    throw new Error('Expected local history to contain at least one run.');
  }

  const publishedHistory = dedupeNewestFirst(existingHistory);
  const dedupedLocalHistory = dedupeAppendOrder(localHistory);
  const publishedRunIds = new Set(publishedHistory.map(entry => entry.runId));
  const unpublishedLocalEntries = dedupedLocalHistory.filter(entry => !publishedRunIds.has(entry.runId));

  return {
    latestLocalEntry: dedupedLocalHistory[dedupedLocalHistory.length - 1],
    unpublishedLocalEntries,
    mergedHistory: [...unpublishedLocalEntries.slice().reverse(), ...publishedHistory],
  };
}

const [, scriptPath, existingPath, newPath] = process.argv;

if (scriptPath && resolve(scriptPath) === fileURLToPath(import.meta.url)) {
  if (!existingPath || !newPath) {
    console.error('Usage: node scripts/merge-history.mjs <existing-history-path> <new-entry-source-path>');
    process.exit(1);
  }

  const existing = readHistoryFile(existingPath, { allowMissing: true });
  const incoming = readHistoryFile(newPath);
  const { mergedHistory, unpublishedLocalEntries } = buildPublishPlan(existing, incoming);

  writeFileSync(existingPath, JSON.stringify(mergedHistory, null, 2) + '\n');
  console.log(`history.json updated — ${mergedHistory.length} total runs (${unpublishedLocalEntries.length} newly published)`);
}
