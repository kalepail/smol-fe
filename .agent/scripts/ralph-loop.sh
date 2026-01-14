#!/usr/bin/env bash
set -euo pipefail

# Generic Ralph loop driver. Configure via env vars so it works with Antigravity, Claude Code, etc.
# You provide:
#   PROMPT_FILE: file containing task prompt for the agent (required)
#   AGENT_CMD: command to run the agent (required) e.g. "antigravity run" or "claude" etc
#   VALIDATE_CMD: command(s) to validate success (required) e.g. "pnpm test && pnpm build"
# Optional:
#   MAX_ITERS (default 8)
#   REPORT_DIR (default .agent/_reports)

PROMPT_FILE="${PROMPT_FILE:-}"
AGENT_CMD="${AGENT_CMD:-}"
VALIDATE_CMD="${VALIDATE_CMD:-}"
MAX_ITERS="${MAX_ITERS:-8}"
REPORT_DIR="${REPORT_DIR:-.agent/_reports}"

if [[ -z "$PROMPT_FILE" || -z "$AGENT_CMD" || -z "$VALIDATE_CMD" ]]; then
  echo "Missing required env vars."
  echo "Example:"
  echo "  PROMPT_FILE=.agent/_reports/TASK_PROMPT.md \\"
  echo "  AGENT_CMD='antigravity run' \\"
  echo "  VALIDATE_CMD='pnpm -s test && pnpm -s build' \\"
  echo "  bash .agent/scripts/ralph-loop.sh"
  exit 1
fi

mkdir -p "$REPORT_DIR"
PROGRESS="$REPORT_DIR/RALPH_PROGRESS.md"
DIFFSTAT="$REPORT_DIR/RALPH_DIFFSTAT.txt"

if [[ ! -f "$PROGRESS" ]]; then
  cat > "$PROGRESS" <<EOF
# RALPH PROGRESS LOG
Start: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## Success Criteria (EDIT THIS)
- [ ] <criterion 1>
- [ ] <criterion 2>

## Validators
- VALIDATE_CMD: $VALIDATE_CMD
EOF
fi

echo "" >> "$PROGRESS"
echo "----" >> "$PROGRESS"
echo "Loop session: $(date -u +"%Y-%m-%dT%H:%M:%SZ")  max_iters=$MAX_ITERS" >> "$PROGRESS"

for ((i=1; i<=MAX_ITERS; i++)); do
  echo "" | tee -a "$PROGRESS"
  echo "## Iteration $i" | tee -a "$PROGRESS"
  echo "- time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" | tee -a "$PROGRESS"

  echo "- git status:" >> "$PROGRESS"
  git status --porcelain >> "$PROGRESS" || true

  echo "- running agent: $AGENT_CMD < $PROMPT_FILE" | tee -a "$PROGRESS"
  # NOTE: agent tools differ; this assumes the agent can read the prompt file content.
  # If your agent requires different invocation, wrap AGENT_CMD in a shell script.
  bash -lc "$AGENT_CMD \"$(cat "$PROMPT_FILE")\"" >> "$PROGRESS" 2>&1 || true

  echo "- diffstat:" | tee -a "$PROGRESS"
  git diff --stat > "$DIFFSTAT" || true
  cat "$DIFFSTAT" >> "$PROGRESS"

  echo "- running validators: $VALIDATE_CMD" | tee -a "$PROGRESS"
  if bash -lc "$VALIDATE_CMD" >> "$PROGRESS" 2>&1; then
    echo "- ✅ validators passed" | tee -a "$PROGRESS"
    echo "" | tee -a "$PROGRESS"
    echo "STOP CONDITION REACHED: validators passed. Verify success criteria + repro manually if needed." | tee -a "$PROGRESS"
    exit 0
  else
    echo "- ❌ validators failed" | tee -a "$PROGRESS"
    echo "- next: update hypothesis in $PROGRESS, adjust prompt, and continue" | tee -a "$PROGRESS"
  fi
done

echo "" | tee -a "$PROGRESS"
echo "HARD STOP: max iterations reached ($MAX_ITERS). Switch to /triage." | tee -a "$PROGRESS"
exit 2
