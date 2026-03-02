# Hackathon Mode — Testnet Game Hub Wiring

Last updated: 2026-02-19

## Overview

The ZK Dungeon ("Kale-Seed Vault") has two separate onchain paths:

1. **Passkey / Mainnet** — The existing flow. Uses `passkey-kit` to sign transactions against mainnet contracts (`TierVerifier`, `farm-attestations`, `ultrahonk-verifier`, `risc0-groth16-verifier`). This handles real ZK proof verification on-chain.

2. **Hackathon / Testnet** — New. Uses `@creit.tech/stellar-wallets-kit` (Freighter) to sign `start_game()` and `end_game()` calls against the hackathon game hub mock contract on Stellar Testnet. This satisfies the hackathon requirement that games must register sessions with the hub.

These two paths are **completely independent**. Both can run simultaneously in the same game session.

## Architecture

```
┌──────────────────────────────────┐
│  ZkDungeonGame.svelte            │
│                                  │
│  ┌───────────────┐ ┌───────────┐ │
│  │ Passkey Flow  │ │ Hackathon │ │
│  │ (mainnet)     │ │ Mode      │ │
│  │               │ │ (testnet) │ │
│  │ passkey-kit   │ │ SWK/      │ │
│  │ verify_and_   │ │ Freighter │ │
│  │ attest()      │ │           │ │
│  │ ultrahonk     │ │ start_    │ │
│  │ risc0         │ │ game()    │ │
│  │               │ │ end_      │ │
│  │               │ │ game()    │ │
│  └───────┬───────┘ └─────┬─────┘ │
│          │               │       │
│          ▼               ▼       │
│  Stellar Mainnet   Stellar       │
│  (CAU7NET7...)     Testnet       │
│                    (CB4VZAT2...) │
└──────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/components/labs/the-farm/dungeon/dungeonTestnetWallet.ts` | SWK wallet connection + testnet tx building/signing + `hubStartGame()`/`hubEndGame()` |
| `src/components/labs/the-farm/dungeon/ZkDungeonGame.svelte` | UI integration — hackathon toggle, wallet connect, hub status in HUD/ledger/victory |
| `src/components/labs/the-farm/dungeon/dungeonService.ts` | Original passkey-based `callStartGame()`/`callEndGame()` (unused by UI but kept for reference) |

## Game Hub Contract

- **Contract ID**: `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG`
- **Network**: Stellar Testnet (`https://soroban-testnet.stellar.org`)
- **Interface**: [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG)

### `start_game(game_id, session_id, player1, player2, player1_points, player2_points)`

| Param | Type | Description |
|-------|------|-------------|
| `game_id` | `Address` | Game contract address (we use the hub contract itself as placeholder) |
| `session_id` | `u32` | Random session ID generated per run |
| `player1` | `Address` | Player 1 testnet address (from SWK) |
| `player2` | `Address` | Player 2 address (or same as player1 for solo) |
| `player1_points` | `i128` | Starting points (0) |
| `player2_points` | `i128` | Starting points (0) |

### `end_game(session_id, player1_won)`

| Param | Type | Description |
|-------|------|-------------|
| `session_id` | `u32` | Same session ID from `start_game()` |
| `player1_won` | `bool` | Whether player 1 won (always `true` on completion) |

## How It Works (Step by Step)

### 1. Player enables Hackathon Mode

On the title screen, the player toggles "HACKATHON MODE (TESTNET GAME HUB)". This reveals a wallet connection button.

### 2. Player connects Freighter

Clicking "CONNECT TESTNET WALLET (FREIGHTER)" opens the SWK modal. The player selects Freighter (or another testnet wallet). Their testnet public key is stored in `testnetAddress`.

**Important**: Freighter must be configured for Stellar Testnet. The player needs testnet XLM (from friendbot) to pay fees.

### 3. Game starts → `start_game()` is called

When the player enters gameplay (via `startGameLocal()`), the code:
1. Generates a random `hackathonSessionId` (u32)
2. Calls `hubStartGame()` which builds, simulates, signs (via Freighter), and submits the tx
3. Stores the tx hash in `hubStartTxHash`
4. Shows "HUB: ACTIVE" badge in the HUD

If the call fails, the error is logged but gameplay continues. The ZK proof flow is unaffected.

### 4. Player completes dungeon → `end_game()` is called

When the player clicks "FINISH RUN" on the ledger screen, `finishRun()`:
1. Calls `hubEndGame()` with the same `hackathonSessionId`
2. Stores the tx hash in `hubEndTxHash`
3. Shows both tx hashes on the victory screen with testnet explorer links

### 5. TX Science Board

Both hub transactions appear in the TX Science Board on the ledger screen with `(TESTNET)` labels and correct testnet explorer links.

## Signing Flow

```
dungeonTestnetWallet.ts:

1. buildAndSimulateSwk()
   - Gets source account from testnet RPC
   - Builds Soroban contract call operation
   - Simulates transaction
   - Assembles with simulation results

2. signAndSubmitSwk()
   - Converts assembled tx to XDR
   - Calls SWK signTransaction() → opens Freighter popup
   - Submits signed tx to testnet RPC
   - Polls for confirmation (up to 30s)
```

## Testing Checklist

- [ ] Toggle hackathon mode on title screen
- [ ] Connect Freighter on testnet
- [ ] Verify testnet address displayed
- [ ] Start a solo game → check `start_game()` tx in console
- [ ] Complete all 3 rooms
- [ ] Click "FINISH RUN" → check `end_game()` tx in console
- [ ] Verify both tx hashes on victory screen
- [ ] Verify both tx hashes in TX Science Board
- [ ] Verify testnet explorer links work
- [ ] Verify passkey/mainnet flow still works independently

## Multiplayer Improvements

### Stale Player Detection

Added `pruneStaleRoster()` in `src/lib/dungeon/server/state.ts`:
- Players who haven't polled in 30 seconds are removed from the roster
- A system event is emitted: `"${name} disconnected (stale)"`
- This prevents the remaining player from being permanently blocked at gate floors

The pruning runs on every GET `/api/dungeon/rooms/[id]/events` poll.

## Funding a Testnet Wallet

```bash
# Fund via Stellar Friendbot
curl "https://friendbot.stellar.org?addr=YOUR_TESTNET_PUBLIC_KEY"
```

Or use the Stellar Lab: https://lab.stellar.org/account/fund?network=testnet
