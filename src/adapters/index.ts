import { join, basename } from 'path';

import type { Config } from '../config/schema.js';
import type { DocSource } from './doc-source/types.js';
import type { CodeSource } from './code-source/types.js';
import type { DocCodeMapper } from './doc-code-mapper/types.js';
import { ManifestUrlDocSource } from './doc-source/manifest-url.js';
import { GitCloneSource } from './code-source/git-clone.js';
import { ManualMapDocCodeMapper } from './doc-code-mapper/manual-map.js';

export class NotImplementedError extends Error {
  constructor(adapterType: string) {
    super(`Adapter "${adapterType}" is not implemented`);
    this.name = 'NotImplementedError';
  }
}

export function createDocSource(config: Config): DocSource {
  const { type, manifestUrl, parentSlug, sourceUrlBase } = config.docSource;
  if (type === 'manifest-url') {
    return new ManifestUrlDocSource({ manifestUrl, parentSlug, sourceUrlBase });
  }
  throw new NotImplementedError(type);
}

export function createCodeSources(config: Config): Record<string, CodeSource> {
  const sources: Record<string, CodeSource> = {};
  for (const [id, cs] of Object.entries(config.codeSources)) {
    if (cs.type === 'git-clone') {
      const repoSlug = basename(cs.repoUrl.replace(/\.git$/, ''));
      const cacheDir = join('tmp', `${repoSlug}-${cs.ref}`);
      sources[id] = new GitCloneSource(cs.repoUrl, cs.ref, cacheDir);
    } else {
      throw new NotImplementedError((cs as { type: string }).type);
    }
  }
  return sources;
}

export function createDocCodeMapper(config: Config, codeSources: Record<string, CodeSource>): DocCodeMapper {
  return new ManualMapDocCodeMapper(config.mappingPath, codeSources);
}
