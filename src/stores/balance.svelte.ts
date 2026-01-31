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

// --- INTERNAL HELPERS (No state/locking logic) ---

async function _fetchKale(address: string): Promise<bigint | null> {
  const { kale } = await import('../utils/passkey-kit');
  const { result } = await (await kale.get()).balance({ id: address });
  return result;
}

async function _fetchXlm(address: string): Promise<bigint | null> {
  const { xlm } = await import('../utils/passkey-kit');
  const { result } = await (await xlm.get()).balance({ id: address });
  return result;
}

async function _fetchUsdc(address: string): Promise<bigint | null> {
  const { usdc } = await import('../utils/passkey-kit');
  const { result } = await (await usdc.get()).balance({ id: address });
  return result;
}

// --- EXPORTED ACTIONS ---

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
    const result = await _fetchKale(address);
    balanceState.balance = result;
    balanceState.lastUpdated = new Date();
    // console.log('[Balance] KALE updated:', result);
  } catch (error) {
    console.error('[Balance] Failed to update KALE balance:', error);
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

  // NOTE: We don't typically show a global loader for just XLM updates
  try {
    const result = await _fetchXlm(address);
    balanceState.xlmBalance = result;
    balanceState.lastUpdated = new Date();
  } catch (error) {
    console.error('[Balance] Failed to update XLM balance:', error);
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
    const result = await _fetchUsdc(address);
    balanceState.usdcBalance = result;
    balanceState.lastUpdated = new Date();
  } catch (error) {
    console.error('[Balance] Failed to update USDC balance:', error);
    balanceState.usdcBalance = null;
  }
}

/**
 * Update all balances (KALE + XLM + USDC) for a given address
 * Handles loading state globally for the batch operation.
 */
export async function updateAllBalances(address: string | null): Promise<void> {
  if (!address) {
    console.warn('[Balance] updateAllBalances called with null address');
    return;
  }

  if (balanceState.transactionLock) {
    console.log('[Balance] Skipping all balances update - transaction in progress');
    return;
  }

  console.log('[Balance] Updating all balances for:', address.slice(0, 4));
  balanceState.loading = true;

  try {
    // Run fetches in parallel using internal helpers to avoid individual loading state updates
    const [kaleRes, xlmRes, usdcRes] = await Promise.allSettled([
      _fetchKale(address),
      _fetchXlm(address),
      _fetchUsdc(address)
    ]);

    // Apply Results
    if (kaleRes.status === 'fulfilled') {
      balanceState.balance = kaleRes.value;
    } else {
      console.error('[Balance] KALE fetch failed:', kaleRes.reason);
      balanceState.balance = null;
    }

    if (xlmRes.status === 'fulfilled') {
      balanceState.xlmBalance = xlmRes.value;
    } else {
      console.error('[Balance] XLM fetch failed:', xlmRes.reason);
      balanceState.xlmBalance = null;
    }

    if (usdcRes.status === 'fulfilled') {
      balanceState.usdcBalance = usdcRes.value;
    } else {
      console.error('[Balance] USDC fetch failed:', usdcRes.reason);
      balanceState.usdcBalance = null;
    }

    balanceState.lastUpdated = new Date();
    // console.log('[Balance] All updated.');

  } catch (error) {
    console.error('[Balance] Critical error in updateAllBalances:', error);
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

