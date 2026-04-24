import { readFileSync } from 'node:fs';
import { MappingSchema } from '../../types/index.js';
import type { CodeTiers, Mapping } from '../../types/index.js';
import type { CodeSource } from '../code-source/types.js';
import type { DocCodeMapper } from './types.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class MappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MappingError';
  }
}

export class ManualMapDocCodeMapper implements DocCodeMapper {
  private mapping: Mapping;

  constructor(
    mappingPath: string,
    codeSources: Record<string, CodeSource>,
  ) {
    const raw = readFileSync(mappingPath, 'utf-8');
    const json = JSON.parse(raw) as unknown;
    this.mapping = MappingSchema.parse(json);

    const knownRepos = Object.keys(codeSources);
    for (const [slug, tiers] of Object.entries(this.mapping)) {
      const allFiles = [...tiers.primary, ...tiers.secondary, ...tiers.context];
      for (const file of allFiles) {
        if (!knownRepos.includes(file.repo)) {
          throw new ConfigError(
            `mapping file references unknown repo "${file.repo}" in slug "${slug}".\nKnown repos: ${knownRepos.join(', ')}`
          );
        }
      }
    }
  }

  getCodeTiers(slug: string): CodeTiers {
    const tiers = this.mapping[slug];
    if (!tiers) {
      const available = Object.keys(this.mapping).sort().join(', ');
      throw new MappingError(
        `no mapping found for slug "${slug}".\nAvailable slugs: ${available}`
      );
    }
    return tiers;
  }
}
