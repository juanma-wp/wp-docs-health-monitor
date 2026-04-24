/**
 * verify-ingestion.ts — verifies the ingestion pipeline works end-to-end
 *
 * Usage:
 *   npx tsx scripts/verify-ingestion.ts
 *
 * Expected output:
 *   Docs fetched: 10
 *   Failed: 0
 *   (followed by 10 lines of slug  primary: repo:path, ...)
 */

import { loadConfig } from '../src/config/loader.js';
import { runPipeline } from '../src/pipeline.js';

const config = await loadConfig('config/gutenberg-block-api.json');
const results = await runPipeline(config);
console.log(`Docs fetched: ${results.docs.length}`);
console.log(`Failed: ${results.docs.filter(d => d.diagnostics.length > 0).length}`);
