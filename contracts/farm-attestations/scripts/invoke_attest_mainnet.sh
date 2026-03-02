#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

: "${PUBLIC_MAINNET_RPC_URL:?Missing PUBLIC_MAINNET_RPC_URL}"
: "${PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET:?Missing PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET}"
: "${STELLAR_MAINNET_SECRET_KEY:?Missing STELLAR_MAINNET_SECRET_KEY}"
: "${OWNER_ADDRESS:?Missing OWNER_ADDRESS}"
: "${SYSTEM_SYMBOL:?Missing SYSTEM_SYMBOL}"
: "${TIER_SYMBOL:?Missing TIER_SYMBOL}"
: "${STATEMENT_HASH_HEX:?Missing STATEMENT_HASH_HEX}"
: "${VERIFIER_HASH_HEX:?Missing VERIFIER_HASH_HEX}"

NETWORK_PASSPHRASE="${PUBLIC_MAINNET_NETWORK_PASSPHRASE:-Public Global Stellar Network ; September 2015}"

if ! [[ "$STATEMENT_HASH_HEX" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "STATEMENT_HASH_HEX must be 32-byte hex (64 chars)"
  exit 1
fi

if ! [[ "$VERIFIER_HASH_HEX" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "VERIFIER_HASH_HEX must be 32-byte hex (64 chars)"
  exit 1
fi

stellar contract invoke \
  --id "$PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET" \
  --source "$STELLAR_MAINNET_SECRET_KEY" \
  --rpc-url "$PUBLIC_MAINNET_RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- \
  attest \
  --owner "$OWNER_ADDRESS" \
  --system "$SYSTEM_SYMBOL" \
  --tier "$TIER_SYMBOL" \
  --statement_hash "$STATEMENT_HASH_HEX" \
  --verifier_hash "$VERIFIER_HASH_HEX"
