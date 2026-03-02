#!/usr/bin/env bash
set -euo pipefail

# Proves a single legacy UltraHonk instance for the dungeon role-gate circuit.
# Usage:
#   ./scripts/prove_one_wsl.sh <required_role_u64> <role_u64> <salt_field>
# Prints a JSON blob to stdout (compatible with emit_sample_json.mjs).

NOIR_VERSION="1.0.0-beta.9"
BB_VERSION="v0.87.0"

required_role="${1:?required_role}"
role="${2:?role}"
salt="${3:?salt}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.nargo/bin:$HOME/.bb/bin:$PATH"

install_nargo() {
  if ! command -v noirup >/dev/null 2>&1; then
    echo "? installing noirup" >&2
    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
  fi

  echo "? selecting nargo $NOIR_VERSION" >&2
  noirup -v "$NOIR_VERSION" >&2
  export PATH="$HOME/.nargo/bin:$PATH"
}

install_bb() {
  if command -v bb >/dev/null 2>&1; then return; fi
  echo "? installing bb $BB_VERSION" >&2
  mkdir -p "$HOME/.bb/bin"
  url="https://github.com/AztecProtocol/aztec-packages/releases/download/${BB_VERSION}/barretenberg-amd64-linux.tar.gz"
  curl -L "$url" -o /tmp/bb.tar.gz >&2
  tar -xzf /tmp/bb.tar.gz -C "$HOME/.bb/bin"
  chmod +x "$HOME/.bb/bin/bb"
  export PATH="$HOME/.bb/bin:$PATH"
}

install_nargo
install_bb

cat > Prover.toml <<EOF
required_role = "$required_role"
role = "$role"
salt = "$salt"
EOF

# Build witness
nargo execute >&2

json="target/dungeon_role_noir_legacy.json"
gz="target/dungeon_role_noir_legacy.gz"
[ -f "$json" ] || (echo "missing $json" >&2 && exit 1)
[ -f "$gz" ] || (echo "missing $gz" >&2 && exit 1)

rm -rf target/proof target/public_inputs target/proof_fields.json target/vk target/vk_fields.json || true

# Produce proof + public inputs bytes
bb prove -b "$json" -w "$gz" -o target \
  --scheme ultra_honk --oracle_hash keccak --output_format bytes_and_fields >&2

node scripts/emit_sample_json.mjs "role" "Dungeon Role Gate" "target/proof" "target/public_inputs"
