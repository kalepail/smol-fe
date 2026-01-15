---
name: defi-streaming-mechanics
description: Best practices for implementing audio payment streams, batching, and session keys on Stellar/Soroban.
---

# DeFi Streaming Mechanics & Limitations

When building streaming payment applications (Pay-Per-Second, Jukeboxes) on Stellar, specific protocol constraints must be respected.

## 1. Transaction Batching Limits
Stellar transactions are limited to **100 Operations** per transaction.
- **Problem**: If a user listens to 150 unique songs in a session, a single "Cash Out" transaction trying to pay 150 artists will fail.
- **Solution**:
    - **Session Limits**: Enforce a maximum number of unique payees per session (e.g., 50 songs).
    - **Chunking**: If settlement > 100 ops, break it into multiple sequential transactions (UX: User signs 2-3 times).

## 2. Session Keys (Ephemeral Signers)
Passkeys (WebAuthn) require biometric interaction for every signature. This breaks "Per-Second" streaming UX.
- **Pattern**:
    1.  **Authorize**: User signs *one* transaction to add a temporary Ed25519 key (Session Key) as a signer to their Smart Wallet (SAC).
    2.  **Stream**: The browser allows the Session Key to sign recurring `payment` or `state_update` ops in the background without prompts.
    3.  **Revoke**: Session Key has a generic expiration or is removed on "Eject".

## 3. Escrow & Forfeiture
To ensure "Charged Regardless" behavior (Anti-gaming):
- **Deposit Model**: User must deposit funds *before* consumption.
- **Forfeiture**: If a user disconnects without a valid "Close Ticket" signature, the Deposit remains in the contract.
    - **Burn**: Funds are eventually swept/burned after a timeout.
    - **Artist Payment**: In this Client-Side-Only architecture, **Artists do NOT get paid** if the user disconnects abruptly. (No listening proof is submitted).
    - *Fix*: Detailed accounting would require a centralized "Tick Server", which reduces decentralization.


## 4. Implementation Checklist
- [ ] **Limit Loop**: Ensure `played_songs.length` does not exceed `MAX_OPS` (safe limit: 50).
- [ ] **Gas Estimation**: Ensure Deposit covers not just the Stream Cost but also the `Rent/Gas` for the Settlement Tx.
- [ ] **Dust**: Handle cases where `time_listened` < 1 second (Micro-payments below minimum granularity).
