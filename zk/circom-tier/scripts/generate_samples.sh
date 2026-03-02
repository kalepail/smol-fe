#!/usr/bin/env bash
set -eo pipefail
CARGO_BIN="/mnt/c/Users/Jeff/.cargo/bin"
SNARKJS="$(pwd)/node_modules/.bin/snarkjs"
export PATH="$CARGO_BIN:$PATH"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
OUT=artifacts/samples
mkdir -p "$OUT"

make_sample() {
  local name=$1 balance=$2 threshold=$3 salt=$4
  local commitment=$(BALANCE=$balance SALT=$salt node - <<'NODE'
const { poseidon } = require('circomlibjs');
const balance = BigInt(process.env.BALANCE);
const salt = BigInt(process.env.SALT);
const hash = poseidon([balance, salt]);
console.log(hash.toString());
NODE
  )
  cat > "$OUT/input_${name}.json" <<EOF
{"balance":"${balance}","threshold":"${threshold}","salt":"${salt}","commitment":"${commitment}"}
EOF
  node build/kale_tier_js/generate_witness.js build/kale_tier_js/kale_tier.wasm "$OUT/input_${name}.json" "$OUT/witness_${name}.wtns"
  "$SNARKJS" groth16 prove artifacts/kale_tier_final.zkey "$OUT/witness_${name}.wtns" "$OUT/proof_${name}.json" "$OUT/public_${name}.json"
}

make_sample sprout 500000000 0 123456789
make_sample grower 5000000000 1000000000 987654321
make_sample harvester 50000000000 10000000000 192837465
make_sample whale 500000000000 100000000000 314159265
make_sample edge 1000000000 1000000000 111111111

# Corrupt proof for invalid using node mutation
cp "$OUT/proof_edge.json" "$OUT/proof_invalid.json"
NODEFILE="$OUT/proof_invalid.json" node - <<'NODE'
const fs=require('fs');
const file=process.env.NODEFILE;
const data=JSON.parse(fs.readFileSync(file,'utf8'));
if(Array.isArray(data.pi_a)&&data.pi_a.length>0){data.pi_a[0]='0'+data.pi_a[0];}
fs.writeFileSync(file,JSON.stringify(data,null,2));
NODE
cp "$OUT/public_edge.json" "$OUT/public_invalid.json"
NODEPUB="$OUT/public_invalid.json" node - <<'NODE'
const fs=require('fs');
const file=process.env.NODEPUB;
const data=JSON.parse(fs.readFileSync(file,'utf8'));
if(Array.isArray(data) && data.length>0){data[1] = (BigInt(data[1]) + 1n).toString();}
fs.writeFileSync(file,JSON.stringify(data,null,2));
NODE

