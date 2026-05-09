/**
 * Argument parsing for `scripts/auto-map.ts`. Lives here (not in the script
 * itself) so it can be unit-tested without invoking the script's top-level
 * `main()` side effects.
 */
import { resolve } from 'path';

export interface AutoMapArgs {
  slug:            string;
  configPath:      string;
  write:           boolean;
  rerank:          boolean;
  explain:         boolean;
  review:          boolean;
  // `--force-regenerate`: explicit escape hatch that overrides the
  // skip-on-review protection introduced in #84. The flag itself is the
  // deliberate verb; no extra confirmation prompt is gated behind it.
  forceRegenerate: boolean;
}

export function parseArgs(argv: string[]): AutoMapArgs {
  const args = argv.slice(2);
  let slug = '';
  let configPath = resolve('config/gutenberg-block-api.json');
  let write = false;
  let rerank = true;
  let explain = false;
  let review = false;
  let forceRegenerate = false;

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
    } else if (args[i] === '--review') {
      review = true;
    } else if (args[i] === '--force-regenerate') {
      forceRegenerate = true;
    } else if (!slug && !args[i].startsWith('--')) {
      slug = args[i];
    }
  }

  if (!slug) {
    console.error(
      'Usage: npx tsx scripts/auto-map.ts <slug> [--config <path>] [--write] [--no-rerank] [--explain] [--review] [--force-regenerate]',
    );
    process.exit(1);
  }

  // --review needs the audit (rationale + confidence per kept file) which
  // only the AI re-ranker produces. --no-rerank means no audit, so the
  // combination is rejected up-front rather than producing empty output.
  if (review && !rerank) {
    console.error(
      'Error: --review cannot be used with --no-rerank. The flagged subset is derived from re-rank confidence; --no-rerank produces no audit. Drop one of the two flags.',
    );
    process.exit(2);
  }

  // --review implies --write (the human-review loop lands the auto-mapping
  // immediately and surfaces the flagged subset on top).
  if (review) write = true;

  return { slug, configPath, write, rerank, explain, review, forceRegenerate };
}
