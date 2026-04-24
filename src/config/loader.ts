import { readFileSync } from 'fs';
import { ConfigSchema } from './schema.js';
import type { Config } from './schema.js';

export function loadConfig(path: string): Config {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  return ConfigSchema.parse(raw);
}
