#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

if command -v rg >/dev/null 2>&1; then
  search() { rg -n "$@"; }
  search_i() { rg -n -i "$@"; }
else
  search() {
    local pattern="$1"
    shift
    grep -RInE "$pattern" "$@"
  }
  search_i() {
    local pattern="$1"
    shift
    grep -RInEi "$pattern" "$@"
  }
fi

FARM_FLOW_PATHS=(
  "src/components/labs/the-farm"
  "src/lib/the-farm"
  "src/data/the-farm"
)

paths=()
for p in "${FARM_FLOW_PATHS[@]}"; do
  if [ -e "$p" ]; then
    paths+=("$p")
  fi
done

if [ ${#paths[@]} -eq 0 ]; then
  echo "no THE FARM flow paths found"
  exit 1
fi

if search_i "console\\.[a-z]+\\(.*(proof|witness|salt|balance|publicSignals|receipt|seal)" "${paths[@]}"; then
  echo "FAIL: proof material logging detected"
  exit 1
fi

if search "(localStorage|sessionStorage)" "${paths[@]}"; then
  echo "FAIL: storage usage detected in THE FARM flow"
  exit 1
fi

VERIFIER_PATH="src/lib/the-farm/verifiers"
if [ -d "$VERIFIER_PATH" ]; then
  if search "(fetch\\(|XMLHttpRequest|WebSocket|\\.open\\(|\\.send\\()" "$VERIFIER_PATH"; then
    echo "FAIL: network calls detected in local verification modules"
    exit 1
  fi
fi

echo "PASS: no leaks/no storage/no verifier network calls"
