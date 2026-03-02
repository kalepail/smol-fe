#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO_ROOT=$(cd "$ROOT/../.." && pwd)
cd "$ROOT"

mkdir -p "$REPO_ROOT/src/data/the-farm"
cp "artifacts/bundle.json" "$REPO_ROOT/src/data/the-farm/noir.bundle.json"
