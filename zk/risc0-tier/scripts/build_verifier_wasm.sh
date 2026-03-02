#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack is required to build verifier-wasm."
  exit 1
fi

wasm-pack build verifier-wasm --target web --release --out-dir pkg
