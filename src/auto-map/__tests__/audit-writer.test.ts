import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  AuditWriter,
  MappingAuditSchema,
  AUDIT_WARNING,
} from '../audit-writer.js';
import type { RerankResult } from '../rerank.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpAuditPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'audit-writer-test-'));
  return join(dir, 'sample-site.audit.json');
}

const RESULT_A: RerankResult = {
  primary: [
    { repo: 'gutenberg', path: 'packages/blocks/src/api/registration.js', rationale: 'canonical impl', confidence: 0.95 },
  ],
  secondary: [
    { repo: 'gutenberg', path: 'packages/blocks/src/api/parser.js', rationale: 'parser', confidence: 0.85 },
  ],
  context: [
    { repo: 'gutenberg', path: 'packages/blocks/src/api/utils.ts', rationale: 'helpers', confidence: 0.75 },
  ],
  dropped: [
    { repo: 'gutenberg', path: 'packages/deprecated/src/index.ts', rationale: 'unrelated logger named `deprecated`' },
    { repo: 'gutenberg', path: 'schemas/json/theme.json',          rationale: 'cross-schema property collision (`name`)' },
  ],
};

const RESULT_B: RerankResult = {
  primary: [
    { repo: 'gutenberg', path: 'packages/blocks/src/api/serializer.js', rationale: 'serializer entry', confidence: 0.9 },
  ],
  secondary: [],
  context: [],
  dropped: [],
};

// ---------------------------------------------------------------------------
// MappingAuditSchema round-trip
// ---------------------------------------------------------------------------

describe('MappingAuditSchema', () => {
  it('round-trips through writeAudit + read + parse', () => {
    const writer = new AuditWriter();
    const path = tmpAuditPath();

    writer.writeAudit(path, 'block-metadata', RESULT_A);

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const parsed = MappingAuditSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.audits['block-metadata']).toEqual(RESULT_A);
    }
  });

  it('rejects an envelope missing the version field', () => {
    const bad = MappingAuditSchema.safeParse({ audits: { x: RESULT_A } });
    expect(bad.success).toBe(false);
  });

  it('rejects audit entries that fail RerankResultSchema (e.g. confidence > 1)', () => {
    const bad = MappingAuditSchema.safeParse({
      version: 1,
      audits: {
        x: {
          primary: [{ repo: 'r', path: 'p', rationale: 'r', confidence: 1.5 }],
          secondary: [], context: [], dropped: [],
        },
      },
    });
    expect(bad.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// writeAudit — file format + warning header
// ---------------------------------------------------------------------------

describe('AuditWriter.writeAudit', () => {
  it('writes a file with a top-level _comment warning against hand-editing', () => {
    const writer = new AuditWriter();
    const path = tmpAuditPath();
    writer.writeAudit(path, 'block-metadata', RESULT_A);

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(typeof raw._comment).toBe('string');
    expect(raw._comment).toBe(AUDIT_WARNING);
    expect(raw._comment).toMatch(/do not (hand-)?edit/i);
  });

  it('writes the version field and the slug-keyed audits map', () => {
    const writer = new AuditWriter();
    const path = tmpAuditPath();
    writer.writeAudit(path, 'block-metadata', RESULT_A);

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.audits).toBeDefined();
    expect(raw.audits['block-metadata']).toEqual(RESULT_A);
  });

  it('preserves prior slug entries when writing a different slug (merge, not overwrite)', () => {
    const writer = new AuditWriter();
    const path = tmpAuditPath();

    writer.writeAudit(path, 'slug-a', RESULT_A);
    writer.writeAudit(path, 'slug-b', RESULT_B);

    const parsed = MappingAuditSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
    expect(parsed.audits['slug-a']).toEqual(RESULT_A);
    expect(parsed.audits['slug-b']).toEqual(RESULT_B);
  });

  it('overwrites the same slug if rewritten', () => {
    const writer = new AuditWriter();
    const path = tmpAuditPath();

    writer.writeAudit(path, 'slug-a', RESULT_A);
    writer.writeAudit(path, 'slug-a', RESULT_B);

    const parsed = MappingAuditSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
    expect(parsed.audits['slug-a']).toEqual(RESULT_B);
    expect(Object.keys(parsed.audits)).toEqual(['slug-a']);
  });

  it('emits slug keys in deterministic (sorted) order', () => {
    const writer = new AuditWriter();
    const path = tmpAuditPath();

    writer.writeAudit(path, 'zeta',  RESULT_B);
    writer.writeAudit(path, 'alpha', RESULT_A);
    writer.writeAudit(path, 'mu',    RESULT_B);

    const text = readFileSync(path, 'utf-8');
    const idxAlpha = text.indexOf('"alpha"');
    const idxMu    = text.indexOf('"mu"');
    const idxZeta  = text.indexOf('"zeta"');
    expect(idxAlpha).toBeGreaterThan(0);
    expect(idxMu).toBeGreaterThan(idxAlpha);
    expect(idxZeta).toBeGreaterThan(idxMu);
  });

  it('treats a malformed existing audit file as empty (does not throw, fresh write replaces it)', () => {
    const writer = new AuditWriter();
    const path = tmpAuditPath();
    writeFileSync(path, '{ this is not valid json');

    expect(() => writer.writeAudit(path, 'slug-a', RESULT_A)).not.toThrow();
    const parsed = MappingAuditSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
    expect(parsed.audits['slug-a']).toEqual(RESULT_A);
  });

  it('creates the parent directory if it does not yet exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-mkdir-'));
    const path = join(dir, 'nested', 'sub', 'site.audit.json');
    const writer = new AuditWriter();
    writer.writeAudit(path, 'slug-a', RESULT_A);
    expect(existsSync(path)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatExplain — stdout renderer
// ---------------------------------------------------------------------------

describe('AuditWriter.formatExplain', () => {
  it('includes rationale per file (kept and dropped)', () => {
    const writer = new AuditWriter();
    const out = writer.formatExplain(RESULT_A);

    // Rationales (kept files)
    expect(out).toContain('canonical impl');
    expect(out).toContain('parser');
    expect(out).toContain('helpers');
    // Rationales (dropped files)
    expect(out).toContain('unrelated logger named `deprecated`');
    expect(out).toContain('cross-schema property collision (`name`)');
  });

  it('labels each kept file with its tier and confidence', () => {
    const writer = new AuditWriter();
    const out = writer.formatExplain(RESULT_A);

    expect(out).toMatch(/primary/i);
    expect(out).toMatch(/secondary/i);
    expect(out).toMatch(/context/i);
    expect(out).toContain('0.95');
    expect(out).toContain('0.85');
    expect(out).toContain('0.75');
  });

  it('renders kept files in fixed (primary → secondary → context) order', () => {
    const writer = new AuditWriter();
    const out = writer.formatExplain(RESULT_A);

    const idxPrimary   = out.indexOf('canonical impl');
    const idxSecondary = out.indexOf('parser');
    const idxContext   = out.indexOf('helpers');
    expect(idxPrimary).toBeGreaterThan(-1);
    expect(idxSecondary).toBeGreaterThan(idxPrimary);
    expect(idxContext).toBeGreaterThan(idxSecondary);
  });

  it('produces identical output for identical input (deterministic)', () => {
    const writer = new AuditWriter();
    const a = writer.formatExplain(RESULT_A);
    const b = writer.formatExplain(RESULT_A);
    expect(a).toBe(b);
  });

  it('omits the dropped-files block when no files were dropped', () => {
    const writer = new AuditWriter();
    const out = writer.formatExplain(RESULT_B);
    expect(out).not.toMatch(/dropped/i);
  });
});

