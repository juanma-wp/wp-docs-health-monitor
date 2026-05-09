/**
 * SuggestedMappingWriter — persists auto-map's would-be CodeTiers output for
 * reviewed slugs into a committed side file at `mappings/<site>.suggested.json`.
 *
 * Auto-map runs are infrequent (quarterly to annually); the side file is an
 * annual review prompt for the operator — "here is what auto-map currently
 * believes for slugs you previously hand-curated" — not a weekly delta. The
 * canonical `Mapping` in `mappings/<site>.json` is unchanged on a reviewed
 * slug; the side file carries the candidate.
 *
 * File format is intentionally minimal: a flat `Record<string, CodeTiers>`
 * keyed by slug, fully overwritten on every write. No envelope, no version —
 * the .suggested.json suffix and the .json side-by-side with the canonical
 * mapping convey provenance.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import type { CodeTiers } from '../types/mapping.js';

export class SuggestedMappingWriter {
  /**
   * Read the slug→tiers map from `path`. Missing or malformed files are
   * treated as empty rather than throwing.
   */
  read(path: string): Record<string, CodeTiers> {
    if (!existsSync(path)) return {};
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return {};
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, CodeTiers>;
  }

  /**
   * Replace `slug`'s entry with `tiers`. Other slugs are preserved. Creates
   * the file (and parent directory) when absent.
   */
  upsert(path: string, slug: string, tiers: CodeTiers): void {
    const existing = this.read(path);
    existing[slug] = tiers;
    this.writeSorted(path, existing);
  }

  /**
   * Delete `slug`'s entry. No-op when the slug is absent or the file is
   * missing. When removing the last slug, the file is left as `{}\n` rather
   * than deleted — keeps diffs stable when a reviewed slug is regenerated.
   */
  remove(path: string, slug: string): void {
    if (!existsSync(path)) return;
    const existing = this.read(path);
    if (!(slug in existing)) return;
    delete existing[slug];
    this.writeSorted(path, existing);
  }

  private writeSorted(path: string, entries: Record<string, CodeTiers>): void {
    const sorted: Record<string, CodeTiers> = {};
    for (const k of Object.keys(entries).sort()) {
      sorted[k] = entries[k];
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(sorted, null, 2) + '\n');
  }
}
