<script lang="ts">
    import { userState } from "../stores/user.svelte.ts";
    import { verifyPastPurchases } from "../services/api/verifyUpgrades";
    import {
        validateAndRevertTheme,
        preferences,
    } from "../stores/preferences.svelte.ts";
    import { upgradesState } from "../stores/upgrades.svelte.ts";
    import { StrKey } from "@stellar/stellar-sdk";

    let checkedAddress = $state<string | null>(null);
    let lastValidatedState = $state<string>("");

    $effect(() => {
        const address = userState.contractId;

        // Validate address before calling API
        if (address && address !== checkedAddress) {
            // Additional validation: ensure it's a valid contract address
            const trimmed = address.trim();
            if (!trimmed || !StrKey.isValidContract(trimmed)) {
                console.warn(
                    "[GlobalVerification] Invalid or empty contract address, skipping verification",
                );
                return;
            }

            checkedAddress = address;
            verifyPastPurchases(address).then(() => {
                // After upgrades are verified, validate theme eligibility
                const currentState = `${address}-${JSON.stringify(upgradesState)}-${JSON.stringify(preferences.unlockedThemes)}`;
                if (currentState !== lastValidatedState) {
                    lastValidatedState = currentState;
                    validateAndRevertTheme(
                        userState,
                        upgradesState,
                        preferences.unlockedThemes,
                    );
                }
            });
        }
    });

    // Validate theme on upgrade state or unlocked themes changes (but NOT on user logout to prevent duplicate)
    $effect(() => {
        // Only validate if we have a checked address (user is logged in)
        if (checkedAddress && userState.contractId) {
            const currentState = `${userState.contractId}-${JSON.stringify(upgradesState)}-${JSON.stringify(preferences.unlockedThemes)}`;
            if (currentState !== lastValidatedState) {
                lastValidatedState = currentState;
                validateAndRevertTheme(
                    userState,
                    upgradesState,
                    preferences.unlockedThemes,
                );
            }
        }
    });
</script>
