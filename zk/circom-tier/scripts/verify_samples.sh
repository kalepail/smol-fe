#!/usr/bin/env bash
set -eo pipefail
CARGO_BIN="/mnt/c/Users/Jeff/.cargo/bin"
SNARKJS="$(pwd)/node_modules/.bin/snarkjs"
export PATH="$CARGO_BIN:$PATH"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
VK=artifacts/verification_key.json
OUT=artifacts/samples
for n in sprout grower harvester whale edge; do
  echo "== verifying $n =="
  "$SNARKJS" groth16 verify "$VK" "$OUT/public_${n}.json" "$OUT/proof_${n}.json"
done
echo "== verifying invalid (should fail) =="
set +e
"$SNARKJS" groth16 verify "$VK" "$OUT/public_invalid.json" "$OUT/proof_invalid.json" && exit 1
exit 0
