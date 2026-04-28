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
import { ToolUseValidator } from './validator/tool-use-validator.js';
import { AnthropicLLMClient } from './validator/anthropic-client.js';
import { OllamaLLMClient } from './validator/ollama-client.js';

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

function loadPromptExtension(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    return readFileSync(path, 'utf-8');
  } catch (err) {
    throw new Error(`Could not read systemPromptExtension "${path}": ${(err as Error).message}`);
  }
}

export function createValidator(config: Config): Validator {
  const { provider, pass1Model, pass2Model, systemPromptExtension } = config.validator;
  const promptExtension = loadPromptExtension(systemPromptExtension);

  if (provider === 'anthropic') {
    const client = new AnthropicLLMClient(new Anthropic());
    return new ToolUseValidator(pass1Model, pass2Model, client, promptExtension);
  }

  if (provider === 'ollama') {
    const client = new OllamaLLMClient(config.validator.baseUrl);
    return new ToolUseValidator(pass1Model, pass2Model, client, promptExtension);
  }

  throw new NotImplementedError((config.validator as { provider: string }).provider);
}
