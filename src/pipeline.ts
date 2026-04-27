import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

import pLimit from 'p-limit';

import type { Config } from './config/schema.js';
import type { RunResults, DocResult } from './types/results.js';
import type { DocFetchResult, Doc } from './adapters/doc-source/types.js';
import { createDocSource, createCodeSources, createDocCodeMapper, createValidator } from './adapters/index.js';
import { scoreDoc } from './health-scorer.js';
import { PRICE_INPUT_PER_MTOK, PRICE_OUTPUT_PER_MTOK, type CostAccumulator } from './adapters/validator/claude.js';

function formatRunId(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

function computeOverallHealth(docResults: DocResult[]): number {
  if (docResults.length === 0) return 100;
  const sum = docResults.reduce((acc, d) => acc + d.healthScore, 0);
  return Math.round(sum / docResults.length);
}

function logCostSummary(runId: string, docResults: DocResult[], cost: CostAccumulator): void {
  const allIssues = docResults.flatMap(d => d.issues);
  const critical = allIssues.filter(i => i.severity === 'critical').length;
  const major    = allIssues.filter(i => i.severity === 'major').length;
  const minor    = allIssues.filter(i => i.severity === 'minor').length;
  const overall  = computeOverallHealth(docResults);

  const estimatedCost =
    (cost.inputTokens  * PRICE_INPUT_PER_MTOK  / 1_000_000) +
    (cost.outputTokens * PRICE_OUTPUT_PER_MTOK / 1_000_000);

  console.log(
    `Run complete: ${docResults.length} docs · ${critical} critical · ${major} major · ${minor} minor · overall health: ${overall}`,
  );
  console.log(
    `Estimated cost: $${estimatedCost.toFixed(2)} (input: ${cost.inputTokens.toLocaleString()} tokens · output: ${cost.outputTokens.toLocaleString()} tokens)`,
  );
}

export async function runPipeline(config: Config): Promise<RunResults> {
  const docSource   = createDocSource(config);
  const codeSources = createCodeSources(config);
  const mapper      = createDocCodeMapper(config, codeSources);
  const validator   = createValidator(config);

  // Kick off warm-up concurrently with doc fetching — don't await separately.
  // Uses allSettled so a clone failure doesn't abort the pipeline.
  const warmupPromise = Promise.allSettled(Object.values(codeSources).map(cs => cs.getCommitSha()));

  const [fetchResults] = await Promise.all([
    docSource.fetchDocs(),
    warmupPromise,
  ]);

  const docs   = fetchResults.filter((r): r is Extract<DocFetchResult, { ok: true }>  => r.ok).map(r => r.doc as Doc);
  const failed = fetchResults.filter((r): r is Extract<DocFetchResult, { ok: false }> => !r.ok);

  const limit = pLimit(3);
  const docResults: DocResult[] = [];

  // Process successful docs concurrently (p-limit 3)
  const docTasks = docs.map(doc =>
    limit(async (): Promise<DocResult> => {
      let codeTiers;
      try {
        codeTiers = mapper.getCodeTiers(doc.slug);
      } catch (err) {
        // MappingError or similar — record per-doc, do not crash the run
        const { healthScore, status } = scoreDoc([]);
        return {
          slug:        doc.slug,
          title:       doc.title,
          parent:      doc.parent,
          sourceUrl:   doc.sourceUrl,
          healthScore,
          status,
          issues:      [],
          positives:   [],
          relatedCode: [],
          diagnostics: [String(err)],
          commitSha:   '',
          analyzedAt:  new Date().toISOString(),
        };
      }

      return validator.validateDoc(doc, codeTiers, codeSources);
    }),
  );

  docResults.push(...await Promise.all(docTasks));

  // Append diagnostic results for failed fetches
  for (const f of failed) {
    docResults.push({
      slug:        f.slug,
      title:       f.title,
      parent:      null,
      sourceUrl:   f.sourceUrl,
      healthScore: 0,
      status:      'critical',
      issues:      [],
      positives:   [],
      relatedCode: [],
      diagnostics: [f.diagnostic],
      commitSha:   '',
      analyzedAt:  new Date().toISOString(),
    });
  }

  const now = new Date();
  const runId = formatRunId(now);

  const allIssues = docResults.flatMap(d => d.issues);
  const totals = {
    docs:           docResults.length,
    healthy:        docResults.filter(d => d.status === 'healthy').length,
    needsAttention: docResults.filter(d => d.status === 'needs-attention').length,
    critical:       docResults.filter(d => d.status === 'critical').length,
    issues: {
      total:    allIssues.length,
      critical: allIssues.filter(i => i.severity === 'critical').length,
      major:    allIssues.filter(i => i.severity === 'major').length,
      minor:    allIssues.filter(i => i.severity === 'minor').length,
    },
  };

  const overallHealth = computeOverallHealth(docResults);

  const runResults: RunResults = {
    runId,
    timestamp:     now.toISOString(),
    overallHealth,
    totals,
    docs: docResults,
  };

  // Write output files
  const outputDir = config.outputDir;
  try {
    const runDir = join(outputDir, 'data', 'runs', runId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'results.json'), JSON.stringify(runResults, null, 2) + '\n');

    // Append to history.json
    const historyPath = join(outputDir, 'data', 'history.json');
    let history: unknown[] = [];
    if (existsSync(historyPath)) {
      try {
        history = JSON.parse(readFileSync(historyPath, 'utf-8')) as unknown[];
      } catch {
        history = [];
      }
    }
    const commitSha = docResults.find(d => d.commitSha)?.commitSha ?? '';
    history.push({ runId, timestamp: now.toISOString(), commitSha, overallHealth, totals });
    mkdirSync(dirname(historyPath), { recursive: true });
    writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
  } catch (err) {
    console.warn(`[pipeline] Could not write output files: ${String(err)}`);
  }

  // Log cost summary if the validator exposes cost info
  const costAccumulator = (validator as { costAccumulator?: CostAccumulator }).costAccumulator;
  if (costAccumulator) {
    logCostSummary(runId, docResults, costAccumulator);
  }

  return runResults;
}

