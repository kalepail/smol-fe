# Labs Integrity (ZK + Stellar TX)

Last updated: 2026-02-19

This doc is the reviewer-facing "truth table" for `/labs` and everything reachable forward from it. If something is demo-only, it is explicitly marked as such.

## Labs Route Map (SSOT)

The Labs hub is the single source of truth:

- `/labs` -> `src/pages/labs/index.astro` (renders `labs/registry.json`)

Forward links from the registry (and their entrypoints):

- `/labs/roulette` -> `src/pages/labs/roulette.astro`
- `/labs/quiz` -> `src/pages/labs/quiz.astro`
- `/labs/waveform` -> `src/pages/labs/waveform.astro`
- `/labs/swapper` -> `src/pages/labs/swapper.astro`
- `/labs/kale-or-fail` -> `src/pages/labs/kale-or-fail.astro`
- `/labs/stream-pay` -> `src/pages/labs/stream-pay.astro`
- `/labs/smol-hero` -> `src/pages/labs/smol-hero.astro`
- `/labs/lastframe` -> `src/pages/labs/lastframe.astro`
- `/labs/the-farm` -> `src/pages/labs/the-farm.astro`
- `/labs/the-vip` -> `src/pages/labs/the-vip/index.astro`

Forward links inside those pages:

- `/labs/the-farm/zkdungeon` -> `src/pages/labs/the-farm/zkdungeon.astro`
- `/labs/the-vip/commons` -> `src/pages/labs/the-vip/commons/index.astro`
- `/labs/the-vip/lumenauts` -> `src/pages/labs/the-vip/lumenauts/index.astro`

Legacy redirects (kept to avoid broken links):

- `/zkdungeon` -> 301 -> `/labs/the-farm/zkdungeon` (`src/pages/zkdungeon.astro`)
- `/zkdungeon/play` -> 302 -> `/labs/the-farm/zkdungeon` (`src/pages/zkdungeon/play.astro`)

## Priority Pages (Reviewer Notes)

### 1) The Farm

Route:

- `/labs/the-farm`

Key files:

- `src/pages/labs/the-farm.astro`
- `src/components/labs/the-farm/TheFarmCore.svelte`
- `src/components/labs/the-farm/zkProof.ts` (Circom proving + on-chain submit)
- `src/lib/the-farm/verifiers/noir.ts` (Noir local verify)
- `src/lib/the-farm/verifiers/risc0.ts` (RISC0 local verify)
- `src/lib/the-farm/attest/publishAttestationMainnet.ts` (digest record tx)

ZK status:

- Circom: Groth16/BN254 tier proof.
  - Local: generated in-browser via `snarkjs` (and can be verified locally with the vkey).
  - On-chain: YES. Calls `tier-verifier.verify_and_attest` which runs BN254 pairing checks on-chain.
- Noir (UltraHonk): local verification only (bb.js).
  - On-chain: YES (when configured). Uses `farm-attestations.verify_ultrahonk_and_attest` (or `verify_ultrahonk_vk_and_attest`), which delegates proof verification to an upgradeable `ultrahonk-verifier` Soroban contract (VK stored on-chain).
    - Current constraint: the Soroban verifier supports the legacy `bb v0.87.0` UltraHonk proof/VK format.
      - ZK Dungeon Room 2 uses a legacy Noir circuit at `zk/noir-dungeon-role-legacy` and (in DEV) a local prover service (`scripts/local-prover-server.mjs`) to generate proofs bound to the run inputs.
      - The VK digest and sample bundle live at `src/data/dungeon/noir_ultrahonk_role_legacy_bundle.json` (VK_ID `NOIR_ROLE_V1`).
    - Local verification in the Farm UI uses modern `@aztec/bb.js` and is still cryptographically real, but those proofs are not currently on-chain verifiable by the legacy Soroban verifier.
  - Optional on-chain record: YES (digest-only record in `farm-attestations`, not cryptographic verification).
- RISC0 receipt: local verification only (WASM verifier).
  - On-chain: YES (Groth16 bridge) for ZK Dungeon Room 3.
    - The dungeon uses a *Groth16/BN254 proof of a RISC0 receipt* and verifies it on-chain using the `farm-attestations` VK registry (`verify_groth16_and_attest`, VK_ID `R0G16V1`).
  - Optional on-chain record: YES (digest-only record in `farm-attestations.attest`).

Proof artifacts:

- Circom runtime artifacts served from:
  - `public/zk/tier_proof.wasm`
  - `public/zk/tier_proof.zkey`
  - `public/zk/verification_key.json`
- Noir verifier bundle:
  - `src/data/the-farm/noir.bundle.json` (gzip base64 bytecode + sample proofs)
- RISC0 verifier wasm:
  - `zk/risc0-tier/verifier-wasm/pkg/*`

Stellar TX status:

- Circom on-chain verify uses a real Soroban contract call built + simulated via Stellar RPC, then signed/sent through the repo’s PasskeyKit relayer flow:
  - Build + simulate: `@stellar/stellar-sdk/minimal` + `rpc.Server.simulateTransaction()`
  - Assemble: `rpc.assembleTransaction()`
  - Sign + send: `src/utils/transaction-helpers.ts` (PasskeyKit + relayer)
- Noir/RISC0 "publish record" uses a real Soroban tx to `farm-attestations.attest` (digest-only statement record).
- ZK Dungeon Room 2 (Noir) and Room 3 (RISC0) can also perform **real mainnet on-chain verification** when the local prover service is running:
  - Production: configure a prover service URL (server-side) and run the prover service separately:
    - Set `PROVER_URL` (and optionally `PROVER_API_KEY`) in your Cloudflare Pages environment.
    - The frontend calls `/api/dungeon/prover/*` which proxies to the prover service without exposing secrets.
  - Local dev: run prover locally: `node scripts/local-prover-server.mjs`
    - Requirements: WSL + Docker + Rust toolchain in WSL. First-time RISC0 Groth16 proving can take several minutes (it builds and runs a Dockerized prover).
  - Room 2: `farm-attestations.verify_ultrahonk_vk_and_attest` (VK_ID `NOIR_ROLE_V1`), passkey-signed.
  - Room 3: `farm-attestations.verify_groth16_and_attest` (VK_ID `R0G16V1`), passkey-signed.

### 2) THE VIP

Routes:

- `/labs/the-vip`
- `/labs/the-vip/commons`
- `/labs/the-vip/lumenauts`

Key files:

- `src/pages/labs/the-vip/index.astro`
- `src/pages/labs/the-vip/commons/index.astro`
- `src/pages/labs/the-vip/lumenauts/index.astro`
- `src/components/vip/VipApp.svelte`
- `src/components/vip/VipChat.svelte`
- `src/pages/api/vip/*` (in-memory relay + auth endpoints)
- `src/lib/vip/server/*` (SEP-10 auth + eligibility checks)

Integrity model (what is real):

- ZK: none.
- Auth: real SEP-10 challenge signing.
  - Server creates challenge XDR via `WebAuth.buildChallengeTx`.
  - Client wallet signs challenge XDR via Stellar Wallets Kit `signTransaction`.
  - Server verifies signers via `WebAuth.verifyChallengeTxSigners`.
- Eligibility: real Horizon checks:
  - `commons`: account exists.
  - `lumenauts`: earliest account transaction must be before the configured cutoff timestamp.
- E2EE: real WebCrypto (AES-GCM + per-sender key rotation; signatures for tamper detection).
- On-chain TX: none. The VIP does not submit transactions; it is a sign-only auth gate + ciphertext relay.

Config:

- `VIP_SERVER_SECRET` is required outside DEV (DEV uses an ephemeral keypair).

### 3) LastFrame

Route:

- `/labs/lastframe`

Key files:

- `src/pages/labs/lastframe.astro`
- `src/components/labs/LastFrame.svelte`

Integrity model:

- ZK: none.
- Stellar TX: none.
- Everything is local (client-only media processing).

## Contract Inventory (Labs-Relevant)

1. Tier Verifier (`contracts/tier-verifier`)

- Contract ID (mainnet): `CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M` (also in `src/components/labs/the-farm/zkTypes.ts`)
- Purpose: on-chain Groth16/BN254 verification for the Farm tier proof circuit.
- Called by: `/labs/the-farm` (Circom flow).
- Methods used:
  - `verify_and_attest(farmer, tier, commitment, proof)`
  - `get_attestation(farmer)` (read path)

2. Farm Attestations (`contracts/farm-attestations`)

- Contract ID (mainnet): defaults to `CDVJZSMI5KSRK7T6D6GGYVB6UPFCDQLAZAYRGXVJKDBOHLAZOPHHX2FR` (override via `PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET`)
- Purpose: statement record registry.
  - Baseline: digest-only records via `attest` (no proof verification).
  - Upgraded: optional *universal Groth16/BN254* on-chain verification via admin-registered verification keys (VK registry).
- Bridge: optional UltraHonk on-chain verification via a configured external `ultrahonk-verifier` contract.
- Called by: `/labs/the-farm` (Noir/RISC0 record flow), `/labs/the-farm/zkdungeon` (Room 2 Noir UltraHonk on-chain verify bridge; Room 3 RISC0 Groth16 on-chain verify, when VK registry is enabled).
- Methods used:
  - `attest(owner, system, tier, statement_hash, verifier_hash)`
  - (optional) `register_groth16_vk(vk_id, vk)` (admin)
  - (optional) `verify_groth16_and_attest(...)` (owner-auth + on-chain verify + record)
  - (optional) `set_ultrahonk_verifier(verifier)` (admin)
  - (optional) `verify_ultrahonk_and_attest(...)` (owner-auth + on-chain verify bridge + record)

3. Batch Transfer (`contracts/batch-transfer`)

- Contract ID (mainnet, hard-coded): `src/utils/batch-transfer.ts`
- Purpose: multi-recipient token transfers in a single Soroban call.
- Called by: `/labs/kale-or-fail`, `/labs/stream-pay`.
- Methods used:
  - `batch_transfer(token, from, recipients, amounts)`

4. RISC0 Groth16 Receipt Verifier (`contracts/risc0-groth16-verifier`)

- Contract ID (mainnet): `PUBLIC_RISC0_GROTH16_VERIFIER_CONTRACT_ID_MAINNET` (env-config; must be deployed)
- Purpose: on-chain BN254 Groth16 verification for a RISC0 Groth16 receipt proof (STARK-to-SNARK output).
- Called by: `/labs/the-farm/zkdungeon` (Room 3 on-chain receipt verify step, passkey-signed).
- Methods used:
  - `verify_and_attest(owner, claim_digest, public_inputs, proof)`
  - `get_attestation(owner)` (read path, optional)

5. UltraHonk Verifier (`contracts/ultrahonk-verifier`)

- Contract ID (mainnet): written to `deployed-ultrahonk-verifier-id.txt` after deployment (must be deployed + configured)
- Purpose: on-chain Noir UltraHonk proof verification (VK stored on-chain; upgradeable).
- Called by: `farm-attestations.verify_ultrahonk_and_attest` (bridge strategy)
- Methods used:
  - `set_vk(vk_bytes)` (admin)
  - `verify_proof(public_inputs, proof_bytes)` (on-chain verify)

## Quick Reviewer Checklist

1. Run:
   - `pnpm check`
   - `pnpm build`
   - `pnpm test:e2e`
2. Click through:
   - `/labs` -> all cards
   - `/labs/the-farm` -> Circom/Noir/RISC0 tabs
   - `/labs/the-farm/zkdungeon`
   - `/labs/the-vip` -> Commons/Lumenauts
   - `/labs/lastframe`
