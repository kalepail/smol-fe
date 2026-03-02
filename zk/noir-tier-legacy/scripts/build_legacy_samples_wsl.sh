#!/usr/bin/env bash
set -euo pipefail

# Generates legacy UltraHonk artifacts compatible with `ultrahonk_rust_verifier` (bb v0.87.0).
# Intended to be run under WSL/Linux.
#
# Output:
# - artifacts/vk
# - artifacts/samples/*.json
# - artifacts/bundle.legacy.json

NOIR_VERSION="1.0.0-beta.9"
BB_VERSION="v0.87.0"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.nargo/bin:$HOME/.bb/bin:$PATH"

install_nargo() {
  if ! command -v noirup >/dev/null 2>&1; then
    echo "• installing noirup"
    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
  fi

  # Always pin the requested version (even if nargo already exists).
  echo "• selecting nargo $NOIR_VERSION"
  noirup -v "$NOIR_VERSION"
  export PATH="$HOME/.nargo/bin:$PATH"
  nargo --version
}

install_bb() {
  if command -v bb >/dev/null 2>&1; then return; fi
  echo "• installing bb $BB_VERSION"
  mkdir -p "$HOME/.bb/bin"
  url="https://github.com/AztecProtocol/aztec-packages/releases/download/${BB_VERSION}/barretenberg-amd64-linux.tar.gz"
  curl -L "$url" -o /tmp/bb.tar.gz
  tar -xzf /tmp/bb.tar.gz -C "$HOME/.bb/bin"
  chmod +x "$HOME/.bb/bin/bb"
  export PATH="$HOME/.bb/bin:$PATH"
}

install_nargo
install_bb

mkdir -p artifacts/samples

tiers=(
  "sprout|Sprout Threshold|0|42|11"
  "grower|Grower Threshold|100|220|22"
  "harvester|Harvester Threshold|1000|2200|33"
  "whale|Whale Threshold|10000|20000|44"
  "edge|Edge Threshold|100|100|55"
)

VK_OUT="artifacts/vk"
VK_WRITTEN="0"

for entry in "${tiers[@]}"; do
  IFS="|" read -r tier label threshold balance salt <<<"$entry"
  echo "► proving $tier (threshold=$threshold, balance=$balance, salt=$salt)"

  cat > Prover.toml <<EOF
threshold = "$threshold"
balance = "$balance"
salt = "$salt"
EOF

  nargo execute

  json="target/the_farm_noir_legacy.json"
  gz="target/the_farm_noir_legacy.gz"
  [ -f "$json" ] || (echo "missing $json" && exit 1)
  [ -f "$gz" ] || (echo "missing $gz" && exit 1)

  rm -rf target/proof target/public_inputs target/proof_fields.json target/vk target/vk_fields.json || true

  bb prove -b "$json" -w "$gz" -o target \
    --scheme ultra_honk --oracle_hash keccak --output_format bytes_and_fields

  if [ "$VK_WRITTEN" = "0" ]; then
    bb write_vk -b "$json" -o target \
      --scheme ultra_honk --oracle_hash keccak --output_format bytes_and_fields
    if [[ -d target/vk && -f target/vk/vk ]]; then
      mv target/vk/vk target/vk.tmp
      rmdir target/vk
      mv target/vk.tmp target/vk
    fi
    cp target/vk "$VK_OUT"
    VK_WRITTEN="1"
  fi

  node scripts/emit_sample_json.mjs "$tier" "$label" "target/proof" "target/public_inputs" > "artifacts/samples/${tier}.json"
done

# Create tampered invalid sample from edge.
node scripts/emit_invalid_sample_json.mjs artifacts/samples/edge.json > artifacts/samples/invalid.json

# Bundle JSON (consumed by the app as "legacy on-chain compatible" samples).
node scripts/emit_bundle_json.mjs "$VK_OUT" artifacts/samples > artifacts/bundle.legacy.json

echo "✅ legacy samples written under $ROOT/artifacts"
