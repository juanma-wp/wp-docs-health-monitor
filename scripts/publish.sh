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

mkdir -p "$(dirname "$WORKTREE")"

if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch --quiet origin gh-pages:refs/remotes/origin/gh-pages
  git worktree add --force "$WORKTREE" origin/gh-pages
else
  git worktree add --orphan -b gh-pages "$WORKTREE"
fi

PUBLISH_PLAN_FILE="$WORKTREE/.publish-plan"

node --input-type=module - "$WORKTREE/data/history.json" "$HISTORY_PATH" >"$PUBLISH_PLAN_FILE" <<'NODE'
import { buildPublishPlan, readHistoryFile } from './scripts/merge-history.mjs';

const existingPath = process.argv[2];
const localPath = process.argv[3];

try {
  const existingHistory = readHistoryFile(existingPath, { allowMissing: true });
  const localHistory = readHistoryFile(localPath);
  const { latestLocalEntry, unpublishedLocalEntries } = buildPublishPlan(existingHistory, localHistory);

  process.stdout.write(`${latestLocalEntry.runId}\n`);
  for (const entry of unpublishedLocalEntries) {
    process.stdout.write(`${entry.runId}\n`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
NODE

mapfile -t PUBLISH_PLAN <"$PUBLISH_PLAN_FILE"
rm -f "$PUBLISH_PLAN_FILE"

LATEST_RUN_ID="${PUBLISH_PLAN[0]:-}"
RUN_IDS_TO_COPY=("${PUBLISH_PLAN[@]:1}")

if [[ -z "$LATEST_RUN_ID" ]]; then
  error "out/data/history.json must end with an entry containing a valid runId."
fi

for RUN_ID in "${RUN_IDS_TO_COPY[@]}"; do
  if [[ ! -d "$OUT_DIR/data/runs/$RUN_ID" ]]; then
    error "out/data/runs/$RUN_ID does not exist. Run npm run analyze first."
  fi
done

rsync -a --delete --exclude='.git' --exclude='data/' --exclude='runs/' "$OUT_DIR/" "$WORKTREE/"
touch "$WORKTREE/.nojekyll"

for RUN_ID in "${RUN_IDS_TO_COPY[@]}"; do
  mkdir -p "$WORKTREE/data/runs/$RUN_ID"
  cp -R "$OUT_DIR/data/runs/$RUN_ID/." "$WORKTREE/data/runs/$RUN_ID/"

  if [[ -d "$OUT_DIR/runs/$RUN_ID" ]]; then
    mkdir -p "$WORKTREE/runs/$RUN_ID"
    rsync -a --delete "$OUT_DIR/runs/$RUN_ID/" "$WORKTREE/runs/$RUN_ID/"
  fi
done

node scripts/merge-history.mjs "$WORKTREE/data/history.json" "$HISTORY_PATH"

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  printf 'No changes to publish.\n'
  exit 0
fi

git -C "$WORKTREE" commit -m "Deploy dashboard - $LATEST_RUN_ID"
git -C "$WORKTREE" push origin HEAD:gh-pages

printf 'Published %s to gh-pages.\n' "$LATEST_RUN_ID"
