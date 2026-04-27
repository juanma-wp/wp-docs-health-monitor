import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { ConfigSchema, type Config } from './schema.js';

// Deep merge: plain objects recurse, everything else (arrays, primitives) replaced by override.
function deepMerge(base: unknown, override: unknown): unknown {
  if (
    typeof base === 'object' && base !== null && !Array.isArray(base) &&
    typeof override === 'object' && override !== null && !Array.isArray(override)
  ) {
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, val] of Object.entries(override as Record<string, unknown>)) {
      result[key] = deepMerge(result[key], val);
    }
    return result;
  }
  return override;
}

export async function loadConfig(configPath: string): Promise<Config> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Could not read config file "${configPath}": ${(err as Error).message}`);
  }

  // Merge .dev.json override if present (e.g. foo.json → foo.dev.json)
  const devPath = configPath.replace(/\.json$/, '.dev.json');
  if (existsSync(devPath)) {
    try {
      const devRaw = JSON.parse(await readFile(devPath, 'utf-8'));
      raw = deepMerge(raw, devRaw);
      console.log(`[config] Merged dev overrides from ${devPath}`);
    } catch (err) {
      throw new Error(`Could not read dev config file "${devPath}": ${(err as Error).message}`);
    }
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid config file "${configPath}":\n${result.error.toString()}`);
  }
  return result.data;
}
