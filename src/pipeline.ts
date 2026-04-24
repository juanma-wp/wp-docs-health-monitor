import type { Config } from './config/schema.js';
import type { RunResults, DocResult } from './types/results.js';
import type { DocFetchResult, Doc } from './adapters/doc-source/types.js';
import { createDocSource, createCodeSources, createDocCodeMapper } from './adapters/index.js';

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

export async function runPipeline(config: Config): Promise<RunResults> {
  const docSource   = createDocSource(config);
  const codeSources = createCodeSources(config);
  const mapper      = createDocCodeMapper(config, codeSources);

  const fetchResults = await docSource.fetchDocs();
  const docs  = fetchResults.filter((r): r is Extract<DocFetchResult, { ok: true }>  => r.ok).map(r => r.doc as Doc);
  const failed = fetchResults.filter((r): r is Extract<DocFetchResult, { ok: false }> => !r.ok);

  // Log ingestion summary + build per-doc results (validator stub)
  const docResults: DocResult[] = [];
  for (const doc of docs) {
    let mappingDiagnostic: string | null = null;
    try {
      const tiers = mapper.getCodeTiers(doc.slug);
      console.log(`${doc.slug}  primary: ${tiers.primary.map(f => `${f.repo}:${f.path}`).join(', ')}`);
    } catch (err) {
      // MappingError or similar — record per-doc, do not crash the run
      mappingDiagnostic = String(err);
    }

    // Validator stub — replaced by Issue juanma-wp/wp-docs-health-monitor#3
    docResults.push({
      slug: doc.slug,
      title: doc.title,
      parent: doc.parent,
      sourceUrl: doc.sourceUrl,
      healthScore: 0,
      status: 'critical' as const,
      issues: [],
      positives: [],
      relatedCode: [],
      diagnostics: mappingDiagnostic ? [mappingDiagnostic] : [],
      commitSha: '',
      analyzedAt: new Date().toISOString(),
    });
  }

  // Append diagnostic results for failed fetches
  for (const f of failed) {
    docResults.push({
      slug: f.slug,
      title: f.title,
      parent: null,
      sourceUrl: f.sourceUrl,
      healthScore: 0,
      status: 'critical',
      issues: [],
      positives: [],
      relatedCode: [],
      diagnostics: [f.diagnostic],
      commitSha: '',
      analyzedAt: new Date().toISOString(),
    });
  }

  const now = new Date();

  return {
    runId:         formatRunId(now),
    timestamp:     now.toISOString(),
    overallHealth: 0,
    totals: {
      docs:           docResults.length,
      healthy:        0,
      needsAttention: 0,
      critical:       docResults.length,
      issues: {
        total:    0,
        critical: 0,
        major:    0,
        minor:    0,
      },
    },
    docs: docResults,
  };
}

