import type { Issue } from './types/results.js';

export type HealthResult = {
  healthScore: number;
  status: 'healthy' | 'needs-attention' | 'critical';
};

export function scoreDoc(issues: Issue[]): HealthResult {
  const critical = issues.filter(i => i.severity === 'critical').length;
  const major    = issues.filter(i => i.severity === 'major').length;
  const minor    = issues.filter(i => i.severity === 'minor').length;

  const healthScore = Math.max(0, Math.min(100, 100 - (critical * 15) - (major * 7) - (minor * 2)));

  const status =
    healthScore >= 85 ? 'healthy' :
    healthScore >= 60 ? 'needs-attention' :
    'critical';

  return { healthScore, status };
}
