import { logger } from '../utils/logger';
import { syncUserAuthFromCookie, userState } from './user.svelte';
import { bumpLedgerSession } from '../utils/ledgerSession';
import { createBalanceCore, READ_ABORTED, type BalanceState } from './balanceCore';

/**
 * KALE balance for the signed-in wallet (coordination logic: `balanceCore.ts`).
 *
 * Reads go through the batched `getLedgerEntries` reader (one tiny ledger-key
 * read, coalesced with any other balance reads in the same tick and shared
 * with any identical key already in flight) instead of a `simulateTransaction`
 * per call. 15s client SWR; `force` after a mint, swap, transfer or collect,
 * and on Refresh — a forced read never joins an older in-flight request.
 *
 * - A failed read sets `error`. It never fabricates `0n`: with no previous
 *   value `balance` stays `null`; a failed refresh keeps the last real value.
 * - A refresh keeps the current value visible (`loading` is the only signal).
 * - The shell auto-loads with `ensureContractBalance` (deferred so a page's own
 *   batched snapshot goes first and the KALE key rides along with it). A page
 *   that will read the KALE key claims the load up front (`claimKaleBalanceLoad`).
 * - Results from other readers are sequenced: take a ticket with
 *   `beginKaleBalanceRead` BEFORE starting, then publish with
 *   `setKnownKaleBalance` / `setKaleBalanceError` passing `{ seq }`.
 */

export const balanceState = $state<BalanceState>({
  balance: null,
  loading: false,
  error: false,
  address: null,
  checkedAt: 0,
});

/**
 * The current page attempt: bumped on every client-side navigation, so a
 * failed read is attributed to the page that made it. Registered at module
 * load, i.e. before the header's own `astro:after-swap` listener.
 */
let pageAttempt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('astro:after-swap', () => {
    pageAttempt++;
  });
}

const core = createBalanceCore(balanceState, {
  readKale: async (address, { fresh, isCurrent }) => {
    const { getBatchSACBalances, knownBalance } = await import('../utils/batchLedgerEntries');
    // Signed out / switched while the transport module loaded: send nothing.
    if (!isCurrent()) return READ_ABORTED;
    const [result] = await getBatchSACBalances(
      [{ tokenContractId: import.meta.env.PUBLIC_KALE_SAC_ID, holderAddress: address }],
      { fresh }
    );
    return knownBalance(result);
  },
  activeWallet: () => userState.contractId,
  onSessionChange: bumpLedgerSession,
  validateSession: (address) => {
    syncUserAuthFromCookie();
    return userState.contractId === address;
  },
  onError: (error) => logger.error('balance', 'Failed to update KALE balance:', error),
  page: () => pageAttempt,
});

export function updateContractBalance(address: string, opts: { force?: boolean } = {}): Promise<void> {
  return core.update(address, opts);
}

/**
 * Background auto-load for the signed-in shell. A no-op when the balance is
 * fresh, already loading, already scheduled, or owned by a page's snapshot.
 * With `deferMs`, waits before reading so page islands hydrating at the same
 * time can claim the load first; the live session is re-validated right
 * before dispatch.
 */
export function ensureContractBalance(
  address: string,
  opts: { deferMs?: number; awaitPageOwner?: boolean } = {}
): void {
  core.ensure(address, opts);
}

/**
 * A page island that reads the KALE key in its own batched snapshot mounted
 * (e.g. the mixtape detail view). While one is registered the shell never
 * holds on its behalf; it claims for itself. Returns unregister.
 */
export function registerKalePageOwner(): () => void {
  return core.registerPageOwner();
}

/** Left a page-owner route before its island claimed, or the island failed to load. */
export function releaseKalePageHold(): void {
  core.releasePageHold();
}

/**
 * Synchronously take ownership of `address`'s KALE load for a page-level
 * batched read that includes the KALE key. Returns an idempotent release.
 */
export function claimKaleBalanceLoad(address: string): () => void {
  return core.claim(address);
}

/** Sequencing ticket for an external read; take it BEFORE the read starts. */
export function beginKaleBalanceRead(address: string): number {
  return core.beginRead(address);
}

/**
 * Seed from another batched read (e.g. the mixtape snapshot) without a new RPC.
 * Refused for any wallet other than the active one, or when a newer result
 * (`seq`) already landed.
 */
export function setKnownKaleBalance(address: string, balance: bigint, opts: { seq?: number } = {}): boolean {
  return core.setKnown(address, balance, opts);
}

/** Publish a failed external KALE read so the shell doesn't re-read the same key. */
export function setKaleBalanceError(address: string, opts: { seq?: number } = {}): boolean {
  return core.setError(address, opts);
}

export function resetBalance(): void {
  core.reset();
}
