#!/usr/bin/env bash
set -eo pipefail
CARGO_BIN="/mnt/c/Users/Jeff/.cargo/bin"
CIRCOM="$CARGO_BIN/circom.exe"
export PATH="$CARGO_BIN:$PATH"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
mkdir -p build

"$CIRCOM" circuits/kale_tier.circom --r1cs --wasm --sym -o build

