---
name: labs-game-mechanics
description: Architecture, resilience, and deployment standards for Smol Labs experiments. Enforces local-first state loops, batched blockchain settlement, and robust asset/retry patterns.
---

# Smol Labs — Game Mechanics & Resilience Protocol

## 1. TL;DR
This skill encapsulates the learnings from the **Kale or Fail** experiment. It defines the standard for building interactive, blockchain-integrated games in the Smol ecosystem.
- **Loop**: Optimistic Local State → Batched Blockchain Settlement.
- **Resilience**: Never trust the Relay/RPC. wrap *everything* in `withRetry`.
- **Assets**: Strict scaling standards (`scale=32` vs `scale=800`).
- **Security**: Identity management via `.env` only.

## 2. The Architecture: Optimistic Game Loop

### Local-First State
Users demand instant feedback. Do not await blockchain confirmations for game actions.
- **Swipe/Action**: Update local variable immediately (e.g., `currentIndex++`).
- **Visuals**: Trigger confetti/animations immediately.
- **Store**: Push the action to a queue (e.g., `batchQueue.push(action)`).

### Batched Settlement
Never send 1 transaction per action. It is slow, expensive, and annoying.
- **Threshold**: Settle when queue hits `N` (e.g., 5 items) or on Game Over.
- **Contract**: Use a **Batch Smart Contract** that takes arrays (`[to]`, `[amount]`) and requires only **ONE** user signature.
- **UX**: Show "Polishing Kale..." or flavor text while settling.

## 3. Resilience Protocol (The "Retry" Rule)

The network (Relayer, RPC) is hostile and intermittent. Failures are normal.
- **Rule**: `src/utils/retry.ts` is mandatory for all chain interactions.
- **Pattern**:
  ```typescript
  await withRetry(async () => {
    return await aggregator.send(batchedTx);
  });
  ```
- **Backoff**: Use exponential backoff (1s, 2s, 4s) to survive temporary congestion.

## 4. Asset Standards (The "Scale" Rule)

Backend image generation is expensive. requesting huge images crashes servers.
- **Pixel Art**: Use `?scale=32` (scales 1px → 32px). This creates crisp, large-enough assets.
- **High-Def**: Use `?scale=32` as "HD".
- **Forbidden**: `?scale=800` (Requesting 800x magnification). This causes 500/503 errors.

## 5. Audio/Visual Coherence

Visuals and Audio must sync, but not collide.
- **Global Player**: If the game has music, **PAUSE** the global `GlobalPlayer` explicitly on mount.
- **Ambient**: Use blurred, desaturated copies of album art for background ambiance (`opacity-30`, `blur-3xl`).
- **Particles**: `canvas-confetti` must be dynamically imported (client-side only).

## 6. Deployment & Security

### Identity Management
- **Never** commit `secret_key` or `mnemonic` to git.
- **Deployer Identity**: Store in `.config/stellar/identity` AND backup to `.env` (`BATCH_DEPLOYER_MNEMONIC`).
- **Env Validation**: Use `astro.config.mjs` to polyfill `self: 'globalThis'` for Stellar SDK compatibility.

### Watcher Pattern
- Use `scripts/watch-deploy.js` to auto-deploy to Cloudflare Pages on git commit.
- If it hangs or fails, kill the process and check `wrangler` output manually.

## 7. Checklist for New Games
1. [ ] **Contract**: Does it support batching?
2. [ ] **Retry**: Is `withRetry` wrapping the send?
3. [ ] **Assets**: Are images using `scale=32`?
4. [ ] **Audio**: Does it handle `GlobalPlayer` conflict?
5. [ ] **Keys**: Is the deployer secure in `.env`?
