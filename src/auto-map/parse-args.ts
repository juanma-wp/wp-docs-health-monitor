/**
 * Argument parsing for `scripts/auto-map.ts`. Lives here (not in the script
 * itself) so it can be unit-tested without invoking the script's top-level
 * `main()` side effects.
 */
import { resolve } from 'path';

export interface AutoMapArgs {
  // Empty string when --all is set; populated otherwise.
  slug:       string;
  // Batch mode: iterate every in-scope, non-ignored manifest entry.
  all:        boolean;
  // Batch mode: re-map every slug even if it's already in the mapping file.
  force:      boolean;
  configPath: string;
  write:      boolean;
  rerank:     boolean;
  explain:    boolean;
}

const USAGE =
  'Usage:\n' +
  '  npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write] [--no-rerank] [--explain]\n' +
  '  npx tsx scripts/auto-map.ts --all  [--config <path>] [--no-rerank] [--force]';

export function parseArgs(argv: string[]): AutoMapArgs {
  const args = argv.slice(2);
  let slug = '';
  let all = false;
  let force = false;
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
    } else if (args[i] === '--all') {
      all = true;
    } else if (args[i] === '--force') {
      force = true;
    } else if (!slug && !args[i].startsWith('--')) {
      slug = args[i];
    }
  }

  if (all && slug) {
    console.error('Usage error: cannot combine <slug> with --all (mutually exclusive).');
    console.error(USAGE);
    process.exit(1);
  }
  if (!all && !slug) {
    console.error(USAGE);
    process.exit(1);
  }

  // --all implies --write. Opting out of write makes batch mode useless;
  // the operator's intent is unambiguous.
  if (all) write = true;

  return { slug, all, force, configPath, write, rerank, explain };
}
