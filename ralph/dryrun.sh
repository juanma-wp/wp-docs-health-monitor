#!/usr/bin/env bash
# Print the resolved Ralph prompt to stdout WITHOUT invoking Claude.
# Use this to verify the issue filter, prompt expansion, and wording before
# spending tokens on a real run.
#
# Invoke via:
#   ./ralph/dryrun.sh
#
# Reads RALPH_ASSIGNEE from .env so the host-side prompt resolution matches
# what Sandcastle does inside the container.

set -euo pipefail

REPO="juanma-wp/wp-docs-health-monitor"

# Load .env (raw values per CLAUDE.local.md). `set -a` exports anything
# sourced; `set +a` restores normal behaviour.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [[ -z "${RALPH_ASSIGNEE:-}" ]]; then
  echo "RALPH_ASSIGNEE is not set. Add RALPH_ASSIGNEE=<github-username> to .env." >&2
  exit 2
fi

issues=$(gh issue list --repo "$REPO" --state open --assignee "$RALPH_ASSIGNEE" --label ready-for-agent \
  --json number,title,body,labels,comments \
  --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]')

commits=$(git log --oneline -10)
branch=$(git rev-parse --abbrev-ref HEAD)

# Substitute Sandcastle's `!`cmd`` shell expansion lines and {{KEY}}
# placeholders. Per-line bash loop avoids awk -v's newline limitations.
while IFS= read -r line; do
  case "$line" in
    '!`gh issue list'*)      printf '%s\n' "$issues"  ;;
    '!`git log --oneline'*)  printf '%s\n' "$commits" ;;
    '!`git rev-parse'*)      printf '%s\n' "$branch"  ;;
    *)                       printf '%s\n' "${line//\{\{ASSIGNEE\}\}/$RALPH_ASSIGNEE}" ;;
  esac
done < .sandcastle/prompt.md
