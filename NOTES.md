# Mainnet Passkey-Kit Validation Notes

## Inputs (Verified)
| Key | Value | Source |
|-----|-------|--------|
| Relayer URL | `https://channels.openzeppelin.com` | Default in passkey-kit.ts |
| Relayer API Key | `a16f33c9-...` (redacted) | User provided, stored in CF secrets |
| Network | Public Global Stellar Network ; September 2015 | wrangler.toml |
| RPC URL | `https://rpc.ankr.com/stellar_soroban` | wrangler.toml |
| XLM SAC Contract | `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` | User provided |
| passkey-kit version | `^0.12.0` | package.json |
| stellar-sdk version | `^14.4.3` | package.json |

---

## Upstream Delta Table (Launchtube → OZ Relayer)

| Category | Removed (Launchtube) | Added (OZ Relayer) |
|----------|---------------------|-------------------|
| **Package** | N/A (never direct dep) | `@openzeppelin/relayer-plugin-channels` |
| **Auth** | JWT-based | Bearer API Key |
| **Env Vars** | `LAUNCHTUBE_URL`, `LAUNCHTUBE_JWT` | `PUBLIC_CHANNELS_BASE_URL`, `PUBLIC_CHANNELS_API_KEY` |
| **Submission** | `LaunchTube.send(tx)` | `send(txn)` via XDR POST |
| **Endpoint** | `/submit` (hypothetical) | `POST /` with `{xdr}` body |
| **Headers** | `Authorization: Bearer <jwt>` | `Authorization: Bearer <apiKey>` |
| **Error Format** | Unknown | `{code, details, message}` |
| **Fee Sponsorship** | Unknown | Supports fee-bump via Relayer config |

---

## B1: Launchtube Search Results (rg)

**Active Code References: NONE** ✅

Only found in documentation/cache files:
- `AGENTS.md:32` - Documentation reference (legacy error message)
- `SMOL_ECOSYSTEM_CACHE.md` - Old ecosystem cache (env var docs)
- `universal-smols.jsonSnapshot.json` - Historical error in song prompts

**Conclusion**: Codebase is clean. No active Launchtube logic remains.

---

## B2: passkey-kit Usage Map (20 files)

| File | Imports |
|------|---------|
| `src/utils/passkey-kit.ts` | Core (PasskeyKit, SACClient, send) |
| `src/utils/mint.ts` | `account` |
| `src/hooks/useAuthentication.ts` | `account, send` |
| `src/hooks/useKaleTransfer.ts` | `kale, account, send` |
| `src/hooks/useMixtapePurchase.ts` | `account, send` |
| `src/hooks/useMixtapeSupport.ts` | `account, kale, send, sac` |
| `src/hooks/useTradeExecution.ts` | `account, send` |
| `src/hooks/useMixtapeMinting.ts` | `account` |
| `src/components/Account.svelte` | `account, kale, send` |
| `src/components/artist/TipArtistModal.svelte` | `account, kale, send` |
| `src/components/labs/SwapperCore.svelte` | `account, sac` |
| + 9 more (sac for balance queries) |

## TX Submission Call Graph (Current)

```
User Action (Tip/Swap/Mint)
    ↓
Component (Account.svelte, TipArtistModal.svelte, etc.)
    ↓
account.sign(tx, {rpId, keyId, expiration})  ← Passkey signing
    ↓
send(tx)  ← src/utils/passkey-kit.ts
    ↓
fetch(relayerUrl, {method: POST, body: {xdr}, headers: {Authorization}})
    ↓
OZ Relayer Channels
    ↓
Stellar Mainnet
```

---

## Phase Checklist
- [x] A1: DeepWiki passkey-kit interrogation
- [x] A2: DeepWiki OZ Relayer docs
- [x] A3: Upstream delta table (DONE - see above)
- [x] B1: rg for launchtube references → CLEAN
- [x] B2: Locate all passkey-kit usage → 20 files
- [x] B3: Build validation (pnpm check passed)
- [ ] B4: Add dev diagnostics
- [x] C1: Create test harness (`scripts/canary/balance-check.mjs`)
- [x] C2: Preflight simulation → RPC connectivity confirmed
- [ ] C3-C4: Canary tx submission + on-chain verification
- [ ] D1-D4: App flow validation
- [ ] E1-E2: Upstream match check
- [ ] G1-G3: XLM balance display
- [ ] H1-H5: Soroswap swapper

---

## Canary Wallet (To Be Created)
- Address: TBD (C...)
- Funder: TBD (G...)
- Purpose: Isolated testing, no real user funds

---

## References
- [Stellar Asset Contract (SAC)](https://developers.stellar.org/docs/tokens/stellar-asset-contract)
- [OZ Relayer Stellar Sponsored TX Guide](https://docs.openzeppelin.com/relayer/1.3.x/guides/stellar-sponsored-transactions-guide)
- [passkey-kit repo](https://github.com/kalepail/passkey-kit)
- [Soroswap Wrapping Classic Assets](https://docs.soroswap.finance/additional-resources/05-tutorial/summary/01-wrapping-stellar-classic-assets)
