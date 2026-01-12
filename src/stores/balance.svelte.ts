import { kale } from '../utils/passkey-kit';

/**
 * Balance state using Svelte 5 runes
 */

export const balanceState = $state<{
  balance: bigint | null;
  loading: boolean;
}>({
  balance: null,
  loading: false,
});

/**
 * Update contract balance for a given address
 */
export async function updateContractBalance(address: string | null): Promise<void> {
  if (!address) {
    balanceState.balance = null;
    return;
  }
  balanceState.loading = true;
  try {
    const { result } = await kale.balance({ id: address });
    balanceState.balance = result;
  } catch (error) {
    console.error('Failed to update contract balance:', error);
    balanceState.balance = null;
  } finally {
    balanceState.loading = false;
  }
}

/**
 * Get current balance (read-only accessor)
 */
export function getBalance(): bigint | null {
  return balanceState.balance;
}

/**
 * Check if balance is loading
 */
export function isBalanceLoading(): boolean {
  return balanceState.loading;
}

/**
 * Reset balance to null
 */
export function resetBalance(): void {
  balanceState.balance = null;
  balanceState.loading = false;
}
