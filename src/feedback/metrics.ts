import type { JoinedIssueFeedback } from './store.js';

// ---------------------------------------------------------------------------
// Precision metrics over reviewed findings. Written to
// feedback/<site>/metrics.json by `feedback apply` so the trend is
// inspectable per site across runs — the measurable half of the loop
// (the calibration block is the actuating half).
// ---------------------------------------------------------------------------

export type VerdictCounts = {
  truePositive:             number;
  falsePositive:            number;
  duplicate:                number;
  needsEditorialJudgement:  number;
  pending:                  number;
};

export type RunMetrics = {
  runId:     string;
  counts:    VerdictCounts;
  // TP / (TP + FP). Duplicates and editorial-judgement entries are excluded
  // from both sides — they are neither correct nor incorrect detections.
  // Null when nothing decisive was reviewed.
  precision: number | null;
};

export type FeedbackMetrics = {
  site:        string;
  generatedAt: string;
  runs:        RunMetrics[];
  cumulative:  {
    counts:    VerdictCounts;
    precision: number | null;
    // FP concentration by issue type / severity — the signal for WHERE the
    // next prompt or context improvement should aim.
    byType:     Record<string, { truePositive: number; falsePositive: number }>;
    bySeverity: Record<string, { truePositive: number; falsePositive: number }>;
  };
};

function emptyCounts(): VerdictCounts {
  return { truePositive: 0, falsePositive: 0, duplicate: 0, needsEditorialJudgement: 0, pending: 0 };
}

function tally(counts: VerdictCounts, verdict: JoinedIssueFeedback['verdict']): void {
  switch (verdict) {
    case 'true-positive':             counts.truePositive++; break;
    case 'false-positive':            counts.falsePositive++; break;
    case 'duplicate':                 counts.duplicate++; break;
    case 'needs-editorial-judgement': counts.needsEditorialJudgement++; break;
    case 'pending':                   counts.pending++; break;
  }
}

function precisionOf(counts: VerdictCounts): number | null {
  const decisive = counts.truePositive + counts.falsePositive;
  return decisive === 0 ? null : counts.truePositive / decisive;
}

export function computeMetrics(site: string, joined: JoinedIssueFeedback[], now: Date = new Date()): FeedbackMetrics {
  const byRun = new Map<string, VerdictCounts>();
  const cumulative = emptyCounts();
  const byType: FeedbackMetrics['cumulative']['byType'] = {};
  const bySeverity: FeedbackMetrics['cumulative']['bySeverity'] = {};

  for (const entry of joined) {
    let runCounts = byRun.get(entry.runId);
    if (!runCounts) {
      runCounts = emptyCounts();
      byRun.set(entry.runId, runCounts);
    }
    tally(runCounts, entry.verdict);
    tally(cumulative, entry.verdict);

    if (entry.verdict === 'true-positive' || entry.verdict === 'false-positive') {
      const t = (byType[entry.issue.type] ??= { truePositive: 0, falsePositive: 0 });
      const s = (bySeverity[entry.issue.severity] ??= { truePositive: 0, falsePositive: 0 });
      const key = entry.verdict === 'true-positive' ? 'truePositive' as const : 'falsePositive' as const;
      t[key]++;
      s[key]++;
    }
  }

  const runs: RunMetrics[] = [...byRun.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([runId, counts]) => ({ runId, counts, precision: precisionOf(counts) }));

  return {
    site,
    generatedAt: now.toISOString(),
    runs,
    cumulative: { counts: cumulative, precision: precisionOf(cumulative), byType, bySeverity },
  };
}
