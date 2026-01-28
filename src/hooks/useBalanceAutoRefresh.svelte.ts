import { onMount } from "svelte";
import { userState } from "../stores/user.state.svelte";
import { updateAllBalances, isTransactionInProgress } from "../stores/balance.svelte";

/**
 * Hook to automatically refresh balances when:
 * 1. The component mounts (and user is authenticated)
 * 2. The window regains focus (visibilitychange)
 * 3. The user logs in (reactive to userState.contractId)
 */
export function useBalanceAutoRefresh() {
    // 1. Reactive effect to fetch on auth change
    $effect(() => {
        if (userState.contractId && !isTransactionInProgress()) {
            // Slight delay to allow any pending state to settle
            setTimeout(() => {
                updateAllBalances(userState.contractId);
            }, 100);
        }
    });

    onMount(() => {
        // 2. Handle visibility change (tab focus)
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible" && userState.contractId) {
                console.log("[Balance] Window focused, refreshing balances...");
                updateAllBalances(userState.contractId);
            }
        };

        // 3. Handle window focus (sometimes visibilitychange isn't enough)
        const handleFocus = () => {
            if (userState.contractId) {
                // Debounce slightly to avoid double-firing with visibilitychange
                if (!isTransactionInProgress()) {
                    updateAllBalances(userState.contractId);
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleFocus);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleFocus);
        };
    });
}
