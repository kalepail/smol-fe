import { kale, xlm } from '../utils/passkey-kit';

/**
 * Balance state using Svelte 5 runes
 */

export const balanceState = $state<{
  balance: bigint | null;
  xlmBalance: bigint | null;
  loading: boolean;
  lastUpdated: Date | null;
  transactionLock: boolean; // Prevents concurrent balance updates during transactions
}>({
  balance: null,
  xlmBalance: null,
  loading: false,
  lastUpdated: null,
  transactionLock: false,
});

/**
 * Acquire transaction lock to prevent concurrent balance updates
 * Returns true if lock was acquired, false if already locked
 */
export function acquireTransactionLock(): boolean {
  if (balanceState.transactionLock) {
    console.warn('[Balance] Transaction already in progress, lock not acquired');
    return false;
  }
  balanceState.transactionLock = true;
  return true;
}

/**
 * Release transaction lock
 */
export function releaseTransactionLock(): void {
  balanceState.transactionLock = false;
}

/**
 * Check if a transaction is currently in progress
 */
export function isTransactionInProgress(): boolean {
  return balanceState.transactionLock;
}

/**
 * Update KALE balance for a given address
 */
export async function updateContractBalance(address: string | null): Promise<void> {
  if (!address) {
    balanceState.balance = null;
    return;
  }

  // Skip update if transaction is in progress (will be updated after transaction completes)
  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping balance update - transaction in progress');
    return;
  }

  balanceState.loading = true;
  try {
    const { result } = await kale.get().balance({ id: address });
    balanceState.balance = result;
    balanceState.lastUpdated = new Date();
  } catch (error) {
    console.error('Failed to update KALE balance:', error);
    balanceState.balance = null;
  } finally {
    balanceState.loading = false;
  }
}

/**
 * Update XLM balance for a given address
 */
export async function updateXlmBalance(address: string | null): Promise<void> {
  if (!address) {
    balanceState.xlmBalance = null;
    return;
  }

  // Skip update if transaction is in progress (will be updated after transaction completes)
  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping XLM balance update - transaction in progress');
    return;
  }

  try {
    const { result } = await xlm.get().balance({ id: address });
    balanceState.xlmBalance = result;
    balanceState.lastUpdated = new Date();
  } catch (error) {
    console.error('Failed to update XLM balance:', error);
    balanceState.xlmBalance = null;
  }
}

/**
 * Update all balances (KALE + XLM) for a given address
 */
export async function updateAllBalances(address: string | null): Promise<void> {
  // Skip update if transaction is in progress
  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping all balances update - transaction in progress');
    return;
  }

  balanceState.loading = true;
  try {
    await Promise.all([
      updateContractBalance(address),
      updateXlmBalance(address),
    ]);
  } catch (error) {
    console.error('[Balance] Failed to update all balances:', error);
  } finally {
    balanceState.loading = false;
  }
}

/**
 * Get current KALE balance (read-only accessor)
 */
export function getBalance(): bigint | null {
  return balanceState.balance;
}

/**
 * Get current XLM balance (read-only accessor)
 */
export function getXlmBalance(): bigint | null {
  return balanceState.xlmBalance;
}

/**
 * Check if balance is loading
 */
export function isBalanceLoading(): boolean {
  return balanceState.loading;
}

/**
 * Reset all balances to null
 */
export function resetBalance(): void {
  balanceState.balance = null;
  balanceState.xlmBalance = null;
  balanceState.loading = false;
  balanceState.lastUpdated = null;
  balanceState.transactionLock = false;
}
