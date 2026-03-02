#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

: "${PUBLIC_MAINNET_RPC_URL:?Missing PUBLIC_MAINNET_RPC_URL}"
: "${PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET:?Missing PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET}"
: "${STELLAR_MAINNET_SECRET_KEY:?Missing STELLAR_MAINNET_SECRET_KEY}"

NETWORK_PASSPHRASE="${PUBLIC_MAINNET_NETWORK_PASSPHRASE:-Public Global Stellar Network ; September 2015}"

stellar contract build

WASM_PATH="target/wasm32v1-none/release/farm_attestations.wasm"
if [ ! -f "$WASM_PATH" ]; then
  WASM_PATH="target/wasm32-unknown-unknown/release/farm_attestations.wasm"
fi

if [ ! -f "$WASM_PATH" ]; then
  echo "Missing compiled WASM at expected paths."
  exit 1
fi

WASM_HASH=$(
  stellar contract upload \
    --wasm "$WASM_PATH" \
    --source "$STELLAR_MAINNET_SECRET_KEY" \
    --rpc-url "$PUBLIC_MAINNET_RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE"
)

echo "UPGRADE_WASM_HASH=$WASM_HASH"

stellar contract invoke \
  --id "$PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET" \
  --source "$STELLAR_MAINNET_SECRET_KEY" \
  --rpc-url "$PUBLIC_MAINNET_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- \
  upgrade \
  --new_wasm_hash "$WASM_HASH"

echo "UPGRADE_APPLIED=1"
