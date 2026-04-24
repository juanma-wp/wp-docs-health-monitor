import type { CodeTiers } from '../../types/index.js';

export interface DocCodeMapper {
  getCodeTiers(slug: string): CodeTiers;
}
