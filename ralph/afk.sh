#!/usr/bin/env bash
# AFK Ralph — autonomous loop in a Sandcastle-managed Docker sandbox.
#
# Invoke via:
#   ./ralph/afk.sh <maxIterations>
#
# `tsx --env-file=.env` auto-loads ANTHROPIC_API_KEY and GH_TOKEN from the
# repo-root .env (raw values, not op:// references — see CLAUDE.local.md).
# .sandcastle/main.ts forwards both into the Docker container via
# docker({ env }).
#
# Pre-reqs (one-time):
#   - Docker Desktop running on the host
#   - `npx sandcastle docker build-image --image-name sandcastle:wp-docs-health`
#   - root-level .env contains ANTHROPIC_API_KEY=... and GH_TOKEN=...
#     (the GH_TOKEN PAT needs `repo` scope so the sandbox can push branches
#     and open PRs)

set -euo pipefail

ITERS="${1:-3}"

if [[ ! -f .env ]]; then
  echo ".env not found at repo root. See CLAUDE.local.md for the analyzer/Ralph .env format." >&2
  exit 2
fi

for required in GH_TOKEN RALPH_ASSIGNEE; do
  if ! grep -q "^${required}=" .env; then
    echo "${required}= line missing from .env." >&2
    case "$required" in
      GH_TOKEN)       echo "  Add a PAT with repo scope so the sandbox can push branches and open PRs." >&2 ;;
      RALPH_ASSIGNEE) echo "  Add RALPH_ASSIGNEE=<github-username> — Ralph picks up open ready-for-agent issues assigned to that user." >&2 ;;
    esac
    exit 2
  fi
done

exec npx tsx --env-file=.env .sandcastle/main.ts "$ITERS"
