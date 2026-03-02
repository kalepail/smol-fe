# Farm Attestations (Mainnet)

Soroban contract for THE FARM mainnet attestations. The contract stores only digest-level data and never stores proofs.

## Interface

```text
init_admin(admin)
admin() -> Address
set_admin(new_admin)
upgrade(new_wasm_hash)
attest(owner, system, tier, statement_hash, verifier_hash) -> u64
get(owner, system, tier) -> Option<AttestationRecord>
has(owner, system, tier, statement_hash) -> bool
```

`attest` requirements:
- `owner.require_auth()` is enforced.
- Emits an `attest` event with owner/system/tier and digest values.
- Persists one record per `(owner, system, tier)`.

Upgradeability:
- `init_admin(admin)` is auth-gated and can be called only once.
- Only `admin` can call `set_admin` and `upgrade`.
- `upgrade` updates contract wasm hash in place; proof digests remain in contract storage.

## Mainnet Deploy

Required environment:
- `PUBLIC_MAINNET_RPC_URL`
- `STELLAR_MAINNET_SECRET_KEY`
- `CONTRACT_ADMIN_ADDRESS`
- optional `PUBLIC_MAINNET_NETWORK_PASSPHRASE` (defaults to mainnet passphrase)

```bash
bash contracts/farm-attestations/scripts/deploy_mainnet.sh
```

The script prints:

```text
FARM_ATTESTATIONS_CONTRACT_ID_MAINNET=<CONTRACT_ID>
```

## Mainnet Invoke

Required environment:
- `PUBLIC_MAINNET_RPC_URL`
- `PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET`
- `STELLAR_MAINNET_SECRET_KEY`
- `OWNER_ADDRESS`
- `SYSTEM_SYMBOL`
- `TIER_SYMBOL`
- `STATEMENT_HASH_HEX` (64 hex chars)
- `VERIFIER_HASH_HEX` (64 hex chars)

```bash
bash contracts/farm-attestations/scripts/invoke_attest_mainnet.sh
```

## Mainnet Upgrade

Required environment:
- `PUBLIC_MAINNET_RPC_URL`
- `PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET`
- `STELLAR_MAINNET_SECRET_KEY`
- optional `PUBLIC_MAINNET_NETWORK_PASSPHRASE` (defaults to mainnet passphrase)

```bash
bash contracts/farm-attestations/scripts/upgrade_mainnet.sh
```
