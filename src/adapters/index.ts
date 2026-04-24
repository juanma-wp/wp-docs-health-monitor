import { join } from 'node:path';
import type { Config } from '../config/schema.js';
import type { DocSource } from './doc-source/types.js';
import { ManifestUrlDocSource } from './doc-source/manifest-url.js';
import type { CodeSource } from './code-source/types.js';
import { GitCloneCodeSource } from './code-source/git-clone.js';
import type { DocCodeMapper } from './doc-code-mapper/types.js';
import { ManualMapDocCodeMapper } from './doc-code-mapper/manual-map.js';

export class NotImplementedError extends Error {
  constructor(adapterType: string) {
    super(`Adapter "${adapterType}" is not implemented`);
    this.name = 'NotImplementedError';
  }
}

export function createDocSource(config: Config): DocSource {
  if (config.docSource.type === 'manifest-url') {
    return new ManifestUrlDocSource(config.docSource);
  }
  throw new NotImplementedError(config.docSource.type);
}

export async function createCodeSources(
  config: Config,
): Promise<Record<string, CodeSource>> {
  const sources: Record<string, CodeSource> = {};
  for (const sourceConfig of config.codeSources) {
    if (sourceConfig.type === 'git-clone') {
      const repoSlug = sourceConfig.url
        .split('/')
        .pop()!
        .replace(/\.git$/, '');
      const cacheDir = join('tmp', `${repoSlug}-${sourceConfig.ref}`);
      const source = new GitCloneCodeSource(sourceConfig.url, sourceConfig.ref, cacheDir);
      await source.init();
      sources[sourceConfig.id] = source;
    } else {
      throw new NotImplementedError((sourceConfig as { type: string }).type);
    }
  }
  return sources;
}

export function createDocCodeMapper(
  config: Config,
  codeSources: Record<string, CodeSource>,
): DocCodeMapper {
  if (config.docCodeMapper.type === 'manual-map') {
    return new ManualMapDocCodeMapper(config.docCodeMapper.mappingPath, codeSources);
  }
  throw new NotImplementedError(config.docCodeMapper.type);
}
