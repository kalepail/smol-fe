#!/usr/bin/env bash
set -eo pipefail
CARGO_BIN="/mnt/c/Users/Jeff/.cargo/bin"
SNARKJS="$(pwd)/node_modules/.bin/snarkjs"
export PATH="$CARGO_BIN:$PATH"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
mkdir -p artifacts
PTAU=artifacts/pot12_final.ptau
if [ ! -f "$PTAU" ]; then
  "$SNARKJS" powersoftau new bn128 12 artifacts/pot12_0000.ptau -v
  "$SNARKJS" powersoftau contribute artifacts/pot12_0000.ptau artifacts/pot12_0001.ptau --name="dev" -v -e="auto-entropy-1"
  "$SNARKJS" powersoftau prepare phase2 artifacts/pot12_0001.ptau "$PTAU" -v
fi
"$SNARKJS" groth16 setup build/kale_tier.r1cs "$PTAU" artifacts/kale_tier_0000.zkey
"$SNARKJS" zkey contribute artifacts/kale_tier_0000.zkey artifacts/kale_tier_final.zkey --name="dev2" -v -e="auto-entropy-2"
"$SNARKJS" zkey export verificationkey artifacts/kale_tier_final.zkey artifacts/verification_key.json
