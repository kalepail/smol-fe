#!/usr/bin/env bash
set -euo pipefail

# Generates VK + a few sample proofs for the dungeon role-gate circuit.
# Intended for WSL/Linux.

NOIR_VERSION="1.0.0-beta.9"
BB_VERSION="v0.87.0"

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
  nargo --version >&2
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

mkdir -p artifacts/samples

cases=(
  "0|0|11"
  "1|1|22"
  "2|2|33"
  "3|3|44"
)

VK_OUT="artifacts/vk"
VK_WRITTEN="0"

for entry in "${cases[@]}"; do
  IFS="|" read -r required_role role salt <<<"$entry"
  echo "? proving required_role=$required_role role=$role salt=$salt" >&2

  cat > Prover.toml <<EOF
required_role = "$required_role"
role = "$role"
salt = "$salt"
EOF

  nargo execute >&2

  json="target/dungeon_role_noir_legacy.json"
  gz="target/dungeon_role_noir_legacy.gz"
  [ -f "$json" ] || (echo "missing $json" >&2 && exit 1)
  [ -f "$gz" ] || (echo "missing $gz" >&2 && exit 1)

  rm -rf target/proof target/public_inputs target/proof_fields.json target/vk target/vk_fields.json || true

  bb prove -b "$json" -w "$gz" -o target \
    --scheme ultra_honk --oracle_hash keccak --output_format bytes_and_fields >&2

  if [ "$VK_WRITTEN" = "0" ]; then
    bb write_vk -b "$json" -o target \
      --scheme ultra_honk --oracle_hash keccak --output_format bytes_and_fields >&2
    if [[ -d target/vk && -f target/vk/vk ]]; then
      mv target/vk/vk target/vk.tmp
      rmdir target/vk
      mv target/vk.tmp target/vk
    fi
    cp target/vk "$VK_OUT"
    VK_WRITTEN="1"
  fi

  node scripts/emit_sample_json.mjs "role" "Dungeon Role Gate" "target/proof" "target/public_inputs" > "artifacts/samples/req${required_role}_role${role}.json"
done

# Bundle JSON (for app docs/tooling)
node scripts/emit_bundle_json.mjs "$VK_OUT" artifacts/samples > artifacts/bundle.legacy.json

echo "? legacy artifacts written under $ROOT/artifacts" >&2
