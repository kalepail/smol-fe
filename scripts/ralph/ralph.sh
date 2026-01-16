#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRD="$ROOT/scripts/ralph/prd.json"
PROMPT="$ROOT/scripts/ralph/prompt.md"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

BRANCH="$(jq -r '.branchName' "$PRD")"
if [[ -z "$BRANCH" || "$BRANCH" == "null" ]]; then
  echo "ERROR: scripts/ralph/prd.json missing branchName" >&2
  exit 1
fi

cd "$ROOT"

# Ensure git repo
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not a git repo"; exit 1; }

# Checkout branch
CURRENT="$(git branch --show-current)"
if [[ "$CURRENT" != "$BRANCH" ]]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
  else
    git checkout -b "$BRANCH"
  fi
fi

# Prefer Amp if installed, else fail loudly (no silent no-op)
if ! command -v amp >/dev/null 2>&1; then
  echo "ERROR: amp CLI not found. Install Amp, then re-run." >&2
  echo "Tip: If you're using another agent runner, feed it scripts/ralph/prompt.md + prd.json + progress.txt." >&2
  exit 1
fi

echo "Running Ralph on branch: $BRANCH"
echo "PRD: $PRD"
echo "Prompt: $PROMPT"

# Create an Amp thread using the prompt file (Amp supports reading prompt text via stdin)
amp run --prompt-file "$PROMPT"
