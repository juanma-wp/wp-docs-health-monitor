/**
 * AuditWriter — persists the AI re-ranker's per-file rationale, confidence,
 * and dropped-with-reason into a committed audit file alongside the canonical
 * mapping, and renders the same information to stdout for `--explain`.
 *
 * The audit file lives at `mappings/<site>.audit.json` and is keyed by slug,
 * mirroring the canonical mapping's structure. Each slug entry carries the
 * full `RerankResult` (primary / secondary / context with rationale +
 * confidence per kept file, plus a parallel `dropped` array with reason).
 *
 * The audit is treated as **generated** — a top-level `_comment` field on the
 * file warns against hand-editing and directs readers to re-run auto-map.
 *
 * The canonical `Mapping` schema in `src/types/mapping.ts` stays locked. The
 * audit is a side channel — runtime consumers (the validator pipeline) never
 * read it. That is why `MappingAuditSchema` lives here, not in `src/types/`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { z } from 'zod';

import { RerankResultSchema, type RerankResult } from './rerank.js';

// Bump when the on-disk envelope or the contained RerankResult shape changes.
export const AUDIT_FILE_VERSION = 1;

export const AUDIT_WARNING =
  'GENERATED FILE — do not hand-edit. Re-run scripts/auto-map.ts to regenerate.';

export const MappingAuditSchema = z.object({
  _comment: z.string().optional(),
  version:  z.literal(AUDIT_FILE_VERSION),
  audits:   z.record(z.string(), RerankResultSchema),
});
export type MappingAudit = z.infer<typeof MappingAuditSchema>;

export class AuditWriter {
  /**
   * Merge `result` into the audit file at `siteAuditPath` under `slug`.
   * Other slugs are preserved. A malformed or missing file is replaced with
   * a fresh envelope rather than throwing.
   */
  writeAudit(siteAuditPath: string, slug: string, result: RerankResult): void {
    const existing = this.loadExisting(siteAuditPath);
    existing[slug] = result;

    // Sort slug keys for deterministic output (no Set/Map iteration leakage).
    const sortedAudits: Record<string, RerankResult> = {};
    for (const k of Object.keys(existing).sort()) {
      sortedAudits[k] = existing[k];
    }

    const envelope: MappingAudit = {
      _comment: AUDIT_WARNING,
      version:  AUDIT_FILE_VERSION,
      audits:   sortedAudits,
    };

    mkdirSync(dirname(siteAuditPath), { recursive: true });
    writeFileSync(siteAuditPath, JSON.stringify(envelope, null, 2) + '\n');
  }

  /**
   * Render rationale per kept file and reason per dropped file as a string
   * for `--explain` stdout. Iteration order is fixed (primary → secondary →
   * context → dropped) so output is stable across runs on identical input.
   */
  formatExplain(result: RerankResult): string {
    const lines: string[] = [];
    lines.push('Kept files:');
    for (const tier of ['primary', 'secondary', 'context'] as const) {
      for (const f of result[tier]) {
        lines.push(`  [${tier}] ${f.repo}:${f.path} (confidence ${f.confidence.toFixed(2)})`);
        lines.push(`    rationale: ${f.rationale}`);
      }
    }

    if (result.dropped.length > 0) {
      lines.push('');
      lines.push('Dropped files:');
      for (const f of result.dropped) {
        lines.push(`  ${f.repo}:${f.path}`);
        lines.push(`    reason: ${f.reason}`);
      }
    }

    return lines.join('\n');
  }

  private loadExisting(path: string): Record<string, RerankResult> {
    if (!existsSync(path)) return {};
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return {};
    }
    const parsed = MappingAuditSchema.safeParse(raw);
    return parsed.success ? { ...parsed.data.audits } : {};
  }
}
