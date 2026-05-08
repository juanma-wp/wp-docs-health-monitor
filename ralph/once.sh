#!/usr/bin/env bash
# HITL Ralph — same prompt, NO sandbox. You watch the agent in your terminal,
# approve permission prompts, and stop it if it goes off track.
#
# Use this on the first 1-2 runs against a new issue type to debug the prompt.
# Once you trust the loop, switch to ./ralph/afk.sh.
#
# Invoke via:
#   ./ralph/once.sh
#
# (The host `claude` CLI uses your Claude Code subscription / login — no
# ANTHROPIC_API_KEY needed for HITL mode.)

set -euo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH. Install Claude Code first (https://claude.ai/install)." >&2
  exit 2
fi

# Build the resolved prompt by piping through dryrun.sh — same expansion logic,
# single source of truth.
resolved_prompt=$(./ralph/dryrun.sh)

# Pipe the resolved prompt to claude in interactive mode (default).
echo "$resolved_prompt" | claude
