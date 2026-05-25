import { describe, it, expect } from 'vitest';
import { renderMetaIndex } from '../meta.js';
import type { SiteRegistry } from '../../types/meta.js';
import type { DashboardHistoryEntry } from '../templates/shared.js';

function entry(over: Partial<DashboardHistoryEntry> = {}): DashboardHistoryEntry {
  return {
    runId: '20260522-184702',
    timestamp: '2026-05-22T18:47:02.000Z',
    overallHealth: 99,
    docCount: 87,
    criticalIssues: 1,
    majorIssues: 12,
    minorIssues: 7,
    commitSha: '1642980abcdef',
    ...over,
  };
}

const registry: SiteRegistry = {
  generatedAt: '2026-05-25T00:00:00.000Z',
  sites: [
    { id: 'block-editor', name: 'BLOCK-EDITOR', dir: 'out-block-editor' },
    { id: 'theme',        name: 'THEME',        dir: 'out-theme' },
  ],
};

describe('renderMetaIndex', () => {
  it('renders one card per registered site with the latest run summary', () => {
    const histories = new Map<string, DashboardHistoryEntry[] | undefined>();
    histories.set('block-editor', [entry({ runId: '20260522-184702', overallHealth: 99 })]);
    histories.set('theme',        [entry({ runId: '20260522-190004', overallHealth: 98, docCount: 70, majorIssues: 16 })]);

    const html = renderMetaIndex(registry, histories);

    expect(html).toContain('WordPress Docs Health Monitor');
    expect(html).toContain('BLOCK-EDITOR');
    expect(html).toContain('THEME');
    expect(html).toContain('20260522-184702');
    expect(html).toContain('20260522-190004');
    expect(html).toContain('out-block-editor/index.html');
    expect(html).toContain('out-theme/index.html');
    expect(html).toContain('87 docs');
    expect(html).toContain('70 docs');
    expect(html).toContain('16 major');
    expect(html).toContain('Analyzed');
    expect(html).toContain('1642980');
  });

  it('shows a "no history found" placeholder when the histories entry is undefined', () => {
    const histories = new Map<string, DashboardHistoryEntry[] | undefined>();
    histories.set('block-editor', [entry()]);
    histories.set('theme',        undefined);

    const html = renderMetaIndex(registry, histories);
    expect(html).toContain('No history found.');
  });

  it('shows a "no runs yet" placeholder for an empty history', () => {
    const histories = new Map<string, DashboardHistoryEntry[] | undefined>();
    histories.set('block-editor', []);
    histories.set('theme',        [entry()]);

    const html = renderMetaIndex(registry, histories);
    expect(html).toContain('No runs yet.');
  });

  it('omits the Analyzed tag when commitSha is missing or too short', () => {
    const histories = new Map<string, DashboardHistoryEntry[] | undefined>();
    histories.set('block-editor', [entry({ commitSha: '' })]);
    histories.set('theme',        [entry({ commitSha: 'abc' })]);

    const html = renderMetaIndex(registry, histories);
    expect(html).not.toContain('Analyzed');
  });

  it('renders no previous-runs select when there is exactly one run', () => {
    const histories = new Map<string, DashboardHistoryEntry[] | undefined>();
    histories.set('block-editor', [entry()]);
    histories.set('theme',        [entry()]);

    const html = renderMetaIndex(registry, histories);
    expect(html).not.toContain('Jump to a previous run');
    expect(html).not.toContain('<select');
  });

  it('renders previous-runs select in descending-timestamp order, excluding the latest', () => {
    const histories = new Map<string, DashboardHistoryEntry[] | undefined>();
    histories.set('block-editor', [
      entry({ runId: '20260101-000000', timestamp: '2026-01-01T00:00:00.000Z' }),
      entry({ runId: '20260301-000000', timestamp: '2026-03-01T00:00:00.000Z' }),
      entry({ runId: '20260201-000000', timestamp: '2026-02-01T00:00:00.000Z' }),
    ]);
    histories.set('theme', [entry()]);

    const html = renderMetaIndex(registry, histories);
    expect(html).toContain('Jump to a previous run');
    // Latest is 20260301; it should be the card header, not in the select.
    const selectStart = html.indexOf('<select');
    const selectEnd = html.indexOf('</select>', selectStart);
    const selectHtml = html.slice(selectStart, selectEnd);
    expect(selectHtml).not.toContain('20260301-000000');
    // Older entries in descending order.
    const idxFeb = selectHtml.indexOf('20260201-000000');
    const idxJan = selectHtml.indexOf('20260101-000000');
    expect(idxFeb).toBeGreaterThan(-1);
    expect(idxJan).toBeGreaterThan(idxFeb);
    expect(selectHtml).toContain('out-block-editor/runs/20260201-000000/index.html');
    expect(selectHtml).toContain('out-block-editor/runs/20260101-000000/index.html');
  });
});
