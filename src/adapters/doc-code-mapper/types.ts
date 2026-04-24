import type { CodeTiers } from '../../types/mapping.js';

export interface DocCodeMapper {
  getCodeTiers(slug: string): CodeTiers;
}
