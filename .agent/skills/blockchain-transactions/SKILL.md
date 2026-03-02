---
name: blockchain-transactions
description: Stellar/Soroban transaction patterns for Smol FE. Use when working with swaps, payments, passkeys, or any blockchain interactions.
---

# Blockchain Transactions Skill

## 1. Address Types 🔑

| Type | Prefix | Example | Usage |
|------|--------|---------|-------|
| **G Address** | `G...` | `GABC...XYZ` | Traditional Stellar account |
| **C Address** | `C...` | `CABC...XYZ` | Soroban smart contract / PasskeyKit wallet |

**On Smol:**
- Users ALWAYS have C addresses (PasskeyKit smart wallets)
- G addresses are only used as recipients in Send mode

## 2. Transaction Flows 🔄

### Swap (C → C)
```
User C Address → Aggregator Contract → Same C Address receives output
```
- Use `buildSwapTransactionForCAddress()` from `swap-builder.ts`
- Invokes Soroswap aggregator directly (API doesn't support C addresses)
- Sign with `account.get().sign()` (WebAuthn)

### Send (C → G)
```
User C Address → Token Transfer → External G Address
```
- Use `sac.get().transfer()` from `passkey-kit.ts`
- Recipient can be any valid Stellar address

## 3. Key Files 📁

| File | Purpose |
|------|---------|
| `src/utils/passkey-kit.ts` | PasskeyKit initialization, `send()`, `account`, `sac` |
| `src/utils/swap-builder.ts` | Direct Soroswap aggregator invocation for C addresses |
| `src/utils/soroswap.ts` | Soroswap API client (`getQuote`, `buildTransaction`, `sendTransaction`) |
| `src/utils/base.ts` | RPC helpers, `getLatestSequence()` |

## 4. PasskeyKit Signing 🔐

```typescript
const signedTx = await account.get().sign(tx, {
    rpId: getDomain(window.location.hostname),  // e.g., "smol.xyz"
    keyId: userState.keyId,                     // Credential ID
    expiration: sequence + 60                   // Ledger expiration
});
```

**Internals:**
- Uses Secp256r1 (P-256) curve, NOT ed25519
- Browser shows biometric prompt
- Signature converted: DER → compact + low-S normalization
- Smart contract verifies on-chain

## 5. Transaction Submission 📤

### Primary: OZ Relayer (Sponsored Fees)
```typescript
await send(signedTx, turnstileToken);
// Endpoint: https://channels.openzeppelin.com
// Requires Turnstile token in 'X-Turnstile-Response' header
```

### Fallback: Soroswap Direct (User Pays ~0.0001 XLM)
```typescript
await sendTransaction(signedTx.toXDR(), false);
// Endpoint: https://api.soroswap.finance/send
// No Turnstile required
```

## 6. Soroswap Aggregator Contract 🔀

**Contract ID (Mainnet):** `CAYP3UWLJM7ZPTUKL6R6BFGTRWLZ46LRKOXTERI2K6BIJAWGYY62TXTO`

```rust
fn swap_exact_tokens_for_tokens(
    from: Address,           // C address
    amount_in: i128,         // Stroops (7 decimals)
    amount_out_min: i128,    // Slippage protection
    distribution: Vec<DexDistribution>,  // Routing from /quote
    deadline: u64            // Unix timestamp
) -> i128;
```

**DexDistribution:**
```rust
struct DexDistribution {
    protocol_id: u32,   // 0=Soroswap, 1=Phoenix, 2=Aqua, 3=Comet
    path: Vec<Address>, // Token path
    parts: u32          // Weight for this route
}
```

## 7. Unified Transaction Helper 🚀

**Pattern**: ALWAYS use `signSendAndVerify` from `src/utils/transaction-helpers.ts` for high-level flows.

```typescript
const result = await signSendAndVerify({
    contractId: AGGREGATOR_CONTRACT,
    functionName: "swap_exact_tokens_for_tokens",
    args: [...invokeArgs],
    userContractId: currentContractId,
    userKeyId: currentKeyId,
    turnstileToken: token
});
```

**Benefits**:
- Automatic Turnstile handling.
- Automatic Polling for ledger inclusion.
- Built-in Simulation checks.

## 8. Common Patterns 🎯

### Get Latest Ledger Sequence
```typescript
import { getLatestSequence } from "../utils/base";
const sequence = await getLatestSequence();
```

### Token Contract IDs
```typescript
const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const KALE = "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV";
```

### Amounts (Stroops)
```typescript
// Human → Stroops
const stroops = Math.floor(amount * 10_000_000);

// Stroops → Human
const human = Number(stroops) / 10_000_000;
```

## 8. Troubleshooting 🔧

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid version byte. expected 48, got 16` | API doesn't support C addresses | Use `buildSwapTransactionForCAddress()` |
| Turnstile 401 | Sitekey domain not allowed | Add domain in Cloudflare Turnstile dashboard |
| `SecurityError: RP ID invalid` | rpId mismatch | Use `getDomain(window.location.hostname)` |
| `Simulation failed` | Transaction would fail on-chain | Check balances, paths, amounts |
