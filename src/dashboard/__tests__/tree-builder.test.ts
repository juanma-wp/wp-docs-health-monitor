import { describe, it, expect } from 'vitest';
import { buildTree } from '../tree-builder.js';
import type { DocResult } from '../../types/results.js';

function makeDoc(overrides: Partial<DocResult> & { slug: string; parent: string | null; healthScore: number }): DocResult {
  return {
    title: overrides.slug,
    sourceUrl: 'https://example.com',
    status: overrides.healthScore >= 85 ? 'healthy' : overrides.healthScore >= 60 ? 'needs-attention' : 'critical',
    issues: [],
    positives: [],
    relatedCode: [],
    diagnostics: [],
    commitSha: 'a'.repeat(40),
    analyzedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildTree', () => {
  it('groups docs by parent', () => {
    const docs = [
      makeDoc({ slug: 'doc-a', parent: 'api', healthScore: 90 }),
      makeDoc({ slug: 'doc-b', parent: 'api', healthScore: 70 }),
      makeDoc({ slug: 'doc-c', parent: 'guides', healthScore: 80 }),
    ];
    const tree = buildTree(docs);
    expect(tree).toHaveLength(2);
    const api = tree.find(n => n.parent === 'api');
    expect(api?.docs).toHaveLength(2);
    const guides = tree.find(n => n.parent === 'guides');
    expect(guides?.docs).toHaveLength(1);
  });

  it('puts docs with parent null into "uncategorized"', () => {
    const docs = [
      makeDoc({ slug: 'doc-x', parent: null, healthScore: 50 }),
    ];
    const tree = buildTree(docs);
    expect(tree[0].parent).toBe('uncategorized');
    expect(tree[0].label).toBe('Uncategorized');
  });

  it('computes folderHealth as simple average', () => {
    const docs = [
      makeDoc({ slug: 'a', parent: 'grp', healthScore: 80 }),
      makeDoc({ slug: 'b', parent: 'grp', healthScore: 60 }),
    ];
    const [node] = buildTree(docs);
    expect(node.folderHealth).toBe(70);
  });

  it('assigns folderStatus correctly', () => {
    const healthy = [makeDoc({ slug: 'a', parent: 'g', healthScore: 90 })];
    const needsAttn = [makeDoc({ slug: 'b', parent: 'g', healthScore: 70 })];
    const critical = [makeDoc({ slug: 'c', parent: 'g', healthScore: 50 })];

    expect(buildTree(healthy)[0].folderStatus).toBe('healthy');
    expect(buildTree(needsAttn)[0].folderStatus).toBe('needs-attention');
    expect(buildTree(critical)[0].folderStatus).toBe('critical');
  });

  it('sorts named parents alphabetically, uncategorized last', () => {
    const docs = [
      makeDoc({ slug: 'u', parent: null, healthScore: 50 }),
      makeDoc({ slug: 'z', parent: 'zebra', healthScore: 90 }),
      makeDoc({ slug: 'a', parent: 'alpha', healthScore: 85 }),
    ];
    const tree = buildTree(docs);
    expect(tree[0].parent).toBe('alpha');
    expect(tree[1].parent).toBe('zebra');
    expect(tree[2].parent).toBe('uncategorized');
  });

  it('sorts docs within a group by healthScore ascending', () => {
    const docs = [
      makeDoc({ slug: 'high', parent: 'g', healthScore: 95 }),
      makeDoc({ slug: 'low', parent: 'g', healthScore: 30 }),
      makeDoc({ slug: 'mid', parent: 'g', healthScore: 60 }),
    ];
    const [node] = buildTree(docs);
    expect(node.docs[0].slug).toBe('low');
    expect(node.docs[1].slug).toBe('mid');
    expect(node.docs[2].slug).toBe('high');
  });
});
