/**
 * Pure balance state using Svelte 5 runes
 * No SDK dependencies.
 */

export const balanceState = $state<{
    balance: bigint | null;
    xlmBalance: bigint | null;
    usdcBalance: bigint | null;
    loading: boolean;
    lastUpdated: Date | null;
    transactionLock: boolean; // Prevents concurrent balance updates during transactions
}>({
    balance: null,
    xlmBalance: null,
    usdcBalance: null,
    loading: false,
    lastUpdated: null,
    transactionLock: false,
});

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
 * Get current USDC balance (read-only accessor)
 */
export function getUsdcBalance(): bigint | null {
    return balanceState.usdcBalance;
}

/**
 * Check if balance is loading
 */
export function isBalanceLoading(): boolean {
    return balanceState.loading;
}
