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
  // Batch mode preview: print the planned slug list and exit without
  // building indexes or invoking the LLM. Free and fast — used to sanity-check
  // scope before paying for a `*`-wide re-rank batch.
  dryRun:     boolean;
  configPath: string;
  write:      boolean;
  rerank:     boolean;
  explain:    boolean;
}

const USAGE =
  'Usage:\n' +
  '  npx tsx scripts/auto-map.ts <slug> --config <path> [--write] [--no-rerank] [--explain]\n' +
  '  npx tsx scripts/auto-map.ts --all  --config <path> [--no-rerank] [--force] [--dry-run]';

export function parseArgs(argv: string[]): AutoMapArgs {
  const args = argv.slice(2);
  let slug = '';
  let all = false;
  let force = false;
  let dryRun = false;
  let configPath: string | null = null;
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
    } else if (args[i] === '--dry-run') {
      dryRun = true;
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
  if (!configPath) {
    console.error('Usage error: --config is required.');
    console.error(USAGE);
    process.exit(1);
  }
  if (dryRun && !all) {
    // Single-slug mode without `--write` already previews to stdout without
    // touching disk — no need for a separate dry-run flag there.
    console.error('Usage error: --dry-run only applies in batch mode (--all). For single-slug, omit --write to preview.');
    console.error(USAGE);
    process.exit(1);
  }

  // --all implies --write. Opting out of write makes batch mode useless;
  // the operator's intent is unambiguous. --dry-run is the exception: it
  // exits before touching disk, so --write is meaningless under dry-run.
  if (all && !dryRun) write = true;

  return { slug, all, force, dryRun, configPath, write, rerank, explain };
}
