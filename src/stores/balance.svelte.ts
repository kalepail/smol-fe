/**
 * Balance state actions using Svelte 5 runes
 * Includes SDK-heavy balance fetching.
 * Uses DYNAMIC IMPORTS to keep initial chunks light.
 */

import { balanceState } from './balance.state.svelte';

// Re-export state and getters
export * from './balance.state.svelte';

/**
 * Acquire transaction lock to prevent concurrent balance updates
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

  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping balance update - transaction in progress');
    return;
  }

  balanceState.loading = true;
  try {
    // DYNAMIC IMPORT: Keep Stellar SDK out of main bundle
    const { kale } = await import('../utils/passkey-kit');
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

  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping XLM balance update - transaction in progress');
    return;
  }

  try {
    // DYNAMIC IMPORT
    const { xlm } = await import('../utils/passkey-kit');
    const { result } = await xlm.get().balance({ id: address });
    balanceState.xlmBalance = result;
    balanceState.lastUpdated = new Date();
  } catch (error) {
    console.error('Failed to update XLM balance:', error);
    balanceState.xlmBalance = null;
  }
}

/**
 * Update USDC balance for a given address
 */
export async function updateUsdcBalance(address: string | null): Promise<void> {
  if (!address) {
    balanceState.usdcBalance = null;
    return;
  }

  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping USDC balance update - transaction in progress');
    return;
  }

  try {
    // DYNAMIC IMPORT
    const { usdc } = await import('../utils/passkey-kit');
    const { result } = await usdc.get().balance({ id: address });
    balanceState.usdcBalance = result;
    balanceState.lastUpdated = new Date();
  } catch (error) {
    console.error('Failed to update USDC balance:', error);
    balanceState.usdcBalance = null;
  }
}

/**
 * Update all balances (KALE + XLM) for a given address
 */
export async function updateAllBalances(address: string | null): Promise<void> {
  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping all balances update - transaction in progress');
    return;
  }

  balanceState.loading = true;
  try {
    await Promise.all([
      updateContractBalance(address),
      updateXlmBalance(address),
      updateUsdcBalance(address),
    ]);
  } catch (error) {
    console.error('[Balance] Failed to update all balances:', error);
  } finally {
    balanceState.loading = false;
  }
}

/**
 * Reset all balances to null
 */
export function resetBalance(): void {
  balanceState.balance = null;
  balanceState.xlmBalance = null;
  balanceState.usdcBalance = null;
  balanceState.loading = false;
  balanceState.lastUpdated = null;
  balanceState.transactionLock = false;
}
