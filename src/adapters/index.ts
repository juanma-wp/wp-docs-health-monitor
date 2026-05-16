import { join, basename } from 'path';
import { readFileSync } from 'fs';

import Anthropic from '@anthropic-ai/sdk';

import type { Config } from '../config/schema.js';
import type { DocSource } from './doc-source/types.js';
import type { CodeSource } from './code-source/types.js';
import type { DocCodeMapper } from './doc-code-mapper/types.js';
import type { Validator } from './validator/types.js';
import { ManifestUrlDocSource } from './doc-source/manifest-url.js';
import { GitCloneSource } from './code-source/git-clone.js';
import { ManualMapDocCodeMapper } from './doc-code-mapper/manual-map.js';
import { ClaudeValidator } from './validator/claude.js';

export class NotImplementedError extends Error {
  constructor(adapterType: string) {
    super(`Adapter "${adapterType}" is not implemented`);
    this.name = 'NotImplementedError';
  }
}

export function createDocSource(config: Config): DocSource {
  const { type, manifestUrl, parentSlug, sourceUrlBase, ignore } = config.docSource;
  if (type === 'manifest-url') {
    return new ManifestUrlDocSource({ manifestUrl, parentSlug, sourceUrlBase, ignore });
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

export function createValidator(config: Config): Validator {
  const { type, provider, apiKeyEnvVar, baseUrl, pass1Model, pass2Model, systemPromptExtension, temperature, samples } = config.validator;
  if (type === 'claude') {
    const keyEnvVar = apiKeyEnvVar ?? (provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY');
    const key = process.env[keyEnvVar];
    if (!key && (provider === 'openrouter' || apiKeyEnvVar)) {
      throw new Error(`Missing API key: set ${keyEnvVar} for validator.provider="${provider}"`);
    }
    const anthropicOptions: ConstructorParameters<typeof Anthropic>[0] = {};
    if (key) anthropicOptions.apiKey = key;
    if (baseUrl) {
      anthropicOptions.baseURL = baseUrl;
    } else if (provider === 'openrouter') {
      anthropicOptions.baseURL = 'https://openrouter.ai/api/v1/anthropic';
    }
    const anthropic = new Anthropic(anthropicOptions);
    let promptExtension: string | undefined;
    if (systemPromptExtension) {
      try {
        promptExtension = readFileSync(systemPromptExtension, 'utf-8');
      } catch (err) {
        throw new Error(`Could not read systemPromptExtension "${systemPromptExtension}": ${(err as Error).message}`);
      }
    }
    return new ClaudeValidator(pass1Model, pass2Model, anthropic, promptExtension, { temperature, samples });
  }
  throw new NotImplementedError(type);
}
