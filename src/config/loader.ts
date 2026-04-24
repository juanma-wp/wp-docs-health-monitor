import { readFile } from 'fs/promises';
import { ConfigSchema, type Config } from './schema.js';

export async function loadConfig(configPath: string): Promise<Config> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Could not read config file "${configPath}": ${(err as Error).message}`);
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid config file "${configPath}":\n${result.error.toString()}`);
  }
  return result.data;
}
