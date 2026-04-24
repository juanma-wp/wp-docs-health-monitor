import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigSchema, type Config } from './schema.js';

export async function loadConfig(configPath: string): Promise<Config> {
  const absolutePath = resolve(configPath);
  const raw = await readFile(absolutePath, 'utf-8');
  const json = JSON.parse(raw) as unknown;
  return ConfigSchema.parse(json);
}
