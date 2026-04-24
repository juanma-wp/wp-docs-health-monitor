import { readFileSync } from 'fs';
import { ZodError } from 'zod';

import { MappingSchema } from '../../types/mapping.js';
import type { CodeTiers, Mapping } from '../../types/mapping.js';
import type { CodeSource } from '../code-source/types.js';
import type { DocCodeMapper } from './types.js';

export class MappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MappingError';
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ManualMapDocCodeMapper implements DocCodeMapper {
  private readonly mapping: Mapping;

  constructor(mappingPath: string, codeSources: Record<string, CodeSource>) {
    // Read and parse the mapping file
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(mappingPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Failed to read mapping file "${mappingPath}": ${err}`);
    }

    // Validate against MappingSchema — throws ZodError if invalid
    this.mapping = MappingSchema.parse(raw);

    // Cross-validate all CodeFile.repo values against known codeSources
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
    if (tiers === undefined) {
      const available = Object.keys(this.mapping).sort().join(', ');
      throw new MappingError(
        `no mapping found for slug "${slug}".\nAvailable slugs: ${available}`
      );
    }
    return tiers;
  }
}
