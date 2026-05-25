/**
 * verify-ingestion.ts — verifies the ingestion pipeline works end-to-end
 *
 * Usage:
 *   npx tsx scripts/verify-ingestion.ts --config <path>
 *
 * Expected output:
 *   Docs fetched: N
 *   Failed: 0
 */

import { loadConfig } from '../src/config/loader.js';
import { runPipeline } from '../src/pipeline.js';

const args = process.argv.slice(2);
const configIdx = args.indexOf('--config');
const configPath = configIdx >= 0 ? args[configIdx + 1] : null;

if (!configPath) {
  console.error('Usage: npx tsx scripts/verify-ingestion.ts --config <path>');
  process.exit(1);
}

const config = await loadConfig(configPath);
const results = await runPipeline(config);
console.log(`Docs fetched: ${results.docs.length}`);
console.log(`Failed: ${results.docs.filter(d => d.diagnostics.length > 0).length}`);
