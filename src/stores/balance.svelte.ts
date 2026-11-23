import { logger } from '../utils/logger';

/**
 * KALE balance for the signed-in wallet.
 *
 * Reads go through the batched `getLedgerEntries` reader (one tiny ledger-key
 * read, coalesced with any other balance reads in the same tick) instead of a
 * `simulateTransaction` per call. 15s client SWR; `force` after a mint, swap,
 * transfer or collect. A failed read sets `error` and keeps `balance: null` —
 * it is never coerced to 0.
 */

const FRESH_MS = 15_000;

export const balanceState = $state<{
  balance: bigint | null;
  loading: boolean;
  error: boolean;
  address: string | null;
  checkedAt: number;
}>({
  balance: null,
  loading: false,
  error: false,
  address: null,
  checkedAt: 0,
});

let inflight: { address: string; token: object; promise: Promise<void> } | null = null;

export async function updateContractBalance(
  address: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  if (balanceState.address !== address) {
    // Account switch: never show another wallet's balance.
    balanceState.address = address;
    balanceState.balance = null;
    balanceState.error = false;
    balanceState.checkedAt = 0;
  }
  const fresh = balanceState.balance !== null && Date.now() - balanceState.checkedAt < FRESH_MS;
  if (fresh && !opts.force) return;
  if (inflight?.address === address && !opts.force) return inflight.promise;

  balanceState.loading = true;
  const token = {};
  const promise = (async () => {
    try {
      const { getBatchSACBalances, knownBalance } = await import('../utils/batchLedgerEntries');
      const [result] = await getBatchSACBalances([
        { tokenContractId: import.meta.env.PUBLIC_KALE_SAC_ID, holderAddress: address },
      ]);
      if (balanceState.address !== address) return; // late response for a previous wallet
      const value = knownBalance(result);
      if (value === null) {
        balanceState.error = true;
        balanceState.balance = null;
      } else {
        balanceState.error = false;
        balanceState.balance = value;
        balanceState.checkedAt = Date.now();
      }
    } catch (error) {
      logger.error('balance', 'Failed to update KALE balance:', error);
      if (balanceState.address === address) {
        balanceState.error = true;
        balanceState.balance = null;
      }
    } finally {
      if (balanceState.address === address) balanceState.loading = false;
      if (inflight?.token === token) inflight = null;
    }
  })();
  inflight = { address, token, promise };
  return promise;
}

/** Seed from another batched read (e.g. the mixtape snapshot) without a new RPC. */
export function setKnownKaleBalance(address: string, balance: bigint): void {
  balanceState.address = address;
  balanceState.balance = balance;
  balanceState.error = false;
  balanceState.checkedAt = Date.now();
}

export function getBalance(): bigint | null {
  return balanceState.balance;
}

export function isBalanceLoading(): boolean {
  return balanceState.loading;
}

export function resetBalance(): void {
  balanceState.balance = null;
  balanceState.loading = false;
  balanceState.error = false;
  balanceState.address = null;
  balanceState.checkedAt = 0;
}
