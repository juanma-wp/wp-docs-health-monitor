import type { DocResult } from '../types/results.js';

export type TreeNode = {
  parent: string;
  label: string;
  docs: DocResult[];
  folderHealth: number;
  folderStatus: 'healthy' | 'needs-attention' | 'critical';
};

function folderStatusFromScore(score: number): TreeNode['folderStatus'] {
  if (score >= 85) return 'healthy';
  if (score >= 60) return 'needs-attention';
  return 'critical';
}

export function buildTree(docs: DocResult[]): TreeNode[] {
  const groups = new Map<string, DocResult[]>();

  for (const doc of docs) {
    const key = doc.parent ?? 'uncategorized';
    const group = groups.get(key);
    if (group) {
      group.push(doc);
    } else {
      groups.set(key, [doc]);
    }
  }

  const nodes: TreeNode[] = [];
  for (const [parent, groupDocs] of groups) {
    const sorted = [...groupDocs].sort((a, b) => (a.healthScore ?? -1) - (b.healthScore ?? -1));
    const analyzed = groupDocs.filter(d => d.healthScore !== null);
    const avg = analyzed.length > 0
      ? analyzed.reduce((sum, d) => sum + (d.healthScore as number), 0) / analyzed.length
      : 100;
    nodes.push({
      parent,
      label: parent === 'uncategorized' ? 'Uncategorized' : parent,
      docs: sorted,
      folderHealth: Math.round(avg),
      folderStatus: folderStatusFromScore(avg),
    });
  }

  nodes.sort((a, b) => {
    if (a.parent === 'uncategorized') return 1;
    if (b.parent === 'uncategorized') return -1;
    return a.parent.localeCompare(b.parent);
  });

  return nodes;
}
