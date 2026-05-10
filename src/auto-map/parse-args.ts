/**
 * Argument parsing for `scripts/auto-map.ts`. Lives here (not in the script
 * itself) so it can be unit-tested without invoking the script's top-level
 * `main()` side effects.
 */
import { resolve } from 'path';

export interface AutoMapArgs {
  slug:       string;
  configPath: string;
  write:      boolean;
  rerank:     boolean;
  explain:    boolean;
}

export function parseArgs(argv: string[]): AutoMapArgs {
  const args = argv.slice(2);
  let slug = '';
  let configPath = resolve('config/gutenberg-block-api.json');
  let write = false;
  let rerank = true;
  let explain = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--write') {
      write = true;
    } else if (args[i] === '--no-rerank') {
      rerank = false;
    } else if (args[i] === '--explain') {
      explain = true;
    } else if (!slug && !args[i].startsWith('--')) {
      slug = args[i];
    }
  }

  if (!slug) {
    console.error(
      'Usage: npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write] [--no-rerank] [--explain]',
    );
    process.exit(1);
  }

  return { slug, configPath, write, rerank, explain };
}
