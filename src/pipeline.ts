import { createDocSource, createCodeSources, createDocCodeMapper } from './adapters/index.js';
import type { Config } from './config/schema.js';
import type { DocResult, RunResults } from './types/index.js';
import type { DocFetchResult } from './adapters/doc-source/types.js';

export async function runPipeline(config: Config): Promise<RunResults> {
  const docSource = createDocSource(config);
  const codeSources = await createCodeSources(config);
  const mapper = createDocCodeMapper(config, codeSources);

  const fetchResults = await docSource.fetchDocs();
  const docs = fetchResults.filter((r) => r.ok).map((r) => (r as Extract<DocFetchResult, { ok: true }>).doc);
  const failed = fetchResults.filter((r) => !r.ok);

  for (const doc of docs) {
    const tiers = mapper.getCodeTiers(doc.slug);
    console.log(`${doc.slug}  primary: ${tiers.primary.map((f) => `${f.repo}:${f.path}`).join(', ')}`);
  }

  const docResults: DocResult[] = docs.map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    parent: doc.parent,
    sourceUrl: doc.sourceUrl,
    healthScore: 0,
    status: 'critical' as const,
    issues: [],
    positives: [],
    relatedCode: [],
    diagnostics: [],
    commitSha: '',
    analyzedAt: new Date().toISOString(),
  }));

  for (const f of failed) {
    const fail = f as Extract<DocFetchResult, { ok: false }>;
    docResults.push({
      slug: fail.slug,
      title: fail.title,
      sourceUrl: fail.sourceUrl,
      healthScore: 0,
      status: 'critical',
      issues: [],
      positives: [],
      relatedCode: [],
      diagnostics: [fail.diagnostic],
      commitSha: '',
      analyzedAt: new Date().toISOString(),
    });
  }

  const now = new Date();
  const runId = now
    .toISOString()
    .replace(/\D/g, '')
    .slice(0, 15)
    .replace(/(\d{8})(\d{6})/, '$1-$2');

  return {
    runId,
    timestamp: now.toISOString(),
    overallHealth: 0,
    totals: {
      docs: docResults.length,
      healthy: 0,
      needsAttention: 0,
      critical: docResults.length,
      issues: { total: 0, critical: 0, major: 0, minor: 0 },
    },
    docs: docResults,
  };
}
