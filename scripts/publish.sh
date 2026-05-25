#!/usr/bin/env bash

set -euo pipefail

error() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  error "publish.sh must be run from inside a git repository."
fi

cd "$ROOT"

OUT_DIR="$ROOT/out"
WORKTREE="$ROOT/tmp/gh-pages"
HISTORY_PATH="$OUT_DIR/data/history.json"

cleanup() {
  if git worktree list --porcelain | grep -Fq "worktree $WORKTREE"; then
    git worktree remove --force "$WORKTREE"
  fi
}

trap cleanup EXIT

if [[ ! -d "$OUT_DIR" ]]; then
  error "out/ directory does not exist. Run npm run analyze first."
fi

if [[ ! -f "$HISTORY_PATH" ]]; then
  error "out/data/history.json does not exist. Run npm run analyze first."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  error "Git working tree is dirty. Commit or stash changes before publishing."
fi

RUN_ID="$(
  node --input-type=module -e "
    import { readFileSync } from 'fs';

    const historyPath = process.argv[1];
    let history;
    try {
      history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    } catch (error) {
      console.error(\`Error: out/data/history.json is not valid JSON: \${error.message}\`);
      process.exit(1);
    }

    if (!Array.isArray(history) || history.length === 0) {
      console.error('Error: out/data/history.json must be a non-empty JSON array.');
      process.exit(1);
    }

    const newestLocalEntry = history[history.length - 1];
    const runId = newestLocalEntry?.runId;
    if (typeof runId !== 'string' || !/^\\d{8}-\\d{6}$/.test(runId)) {
      console.error('Error: out/data/history.json must end with an entry containing a valid runId.');
      process.exit(1);
    }

    process.stdout.write(runId);
  " "$HISTORY_PATH"
)"

if [[ ! -d "$OUT_DIR/data/runs/$RUN_ID" ]]; then
  error "out/data/runs/$RUN_ID does not exist. Run npm run analyze first."
fi

mkdir -p "$(dirname "$WORKTREE")"

if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch --quiet origin gh-pages:refs/remotes/origin/gh-pages
  git worktree add --force "$WORKTREE" origin/gh-pages
else
  git worktree add --orphan -b gh-pages "$WORKTREE"
fi

rsync -a --delete --exclude='.git' --exclude='data/' "$OUT_DIR/" "$WORKTREE/"
touch "$WORKTREE/.nojekyll"

mkdir -p "$WORKTREE/data/runs/$RUN_ID"
cp -R "$OUT_DIR/data/runs/$RUN_ID/." "$WORKTREE/data/runs/$RUN_ID/"

node scripts/merge-history.mjs "$WORKTREE/data/history.json" "$HISTORY_PATH"

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  printf 'No changes to publish.\n'
  exit 0
fi

git -C "$WORKTREE" commit -m "Deploy dashboard — $RUN_ID"
git -C "$WORKTREE" push origin HEAD:gh-pages

printf 'Published %s to gh-pages.\n' "$RUN_ID"
