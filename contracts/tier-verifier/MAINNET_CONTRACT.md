# Tier Verifier Contract — MAINNET DEPLOYED ✅

**DO NOT DELETE** — This contract handles all ZK tier verification for Proof of Farm.

## Contract Details

| Field | Value |
|-------|-------|
| **Contract ID** | `CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M` |
| **Network** | Stellar Mainnet |
| **Entry Point** | `verify_and_attest` |

## Links

- [Stellar Expert Contract](https://stellar.expert/explorer/public/contract/CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M)
- [Stellar Lab](https://lab.stellar.org/r/mainnet/contract/CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M)

## Contract Functions

```rust
// Initialize (call once after deploy)
initialize(admin: Address, vkey: VerificationKey)

// Verify Groth16 proof on-chain (BN254 host functions) and store attestation
verify_and_attest(farmer: Address, tier: u32, commitment: BytesN<32>, proof: Groth16Proof) -> bool

// Lookup attestation
get_attestation(farmer: Address) -> Option<TierAttestation>

// Admin operations
update_vkey(vkey: VerificationKey)
set_admin(new_admin: Address)
upgrade(new_wasm_hash: BytesN<32>)

// Generic verifier (no storage writes)
verify_groth16(public_inputs: Vec<BytesN<32>>, proof: Groth16Proof) -> bool

// Legacy attestation (no cryptographic verification; kept for migration)
attest_tier(farmer: Address, tier: u32, commitment: BytesN<32>, proof_hash: BytesN<32>) -> bool
```

## Upgrade Instructions

1. Build new WASM: `stellar contract build`
2. Install new WASM: `stellar contract install --wasm <new.wasm> --source tier-verifier-deployer --rpc-url https://mainnet.sorobanrpc.com --network-passphrase "Public Global Stellar Network ; September 2015"`
3. Call upgrade: 
```bash
stellar contract invoke \
  --id CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M \
  --source tier-verifier-deployer \
  --rpc-url https://mainnet.sorobanrpc.com \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  -- upgrade --new_wasm_hash <NEW_HASH>
```
