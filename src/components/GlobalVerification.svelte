<script lang="ts">
    import { userState } from "../stores/user.svelte";
    import { verifyPastPurchases } from "../services/api/verifyUpgrades";
    import { validateAndRevertTheme, preferences } from "../stores/preferences.svelte";
    import { upgradesState } from "../stores/upgrades.svelte";

    let checkedAddress = $state<string | null>(null);

    $effect(() => {
        const address = userState.contractId;

        if (address && address !== checkedAddress) {
            checkedAddress = address;
            verifyPastPurchases(address).then(() => {
                // After upgrades are verified, validate theme eligibility
                // This ensures any localStorage-edited goldenKale flag is validated
                validateAndRevertTheme(
                    userState,
                    upgradesState,
                    preferences.unlockedThemes
                );
            });
        }
    });

    // Also validate theme on logout or upgrade state changes
    $effect(() => {
        // Re-validate whenever upgrades or user state changes
        validateAndRevertTheme(
            userState,
            upgradesState,
            preferences.unlockedThemes
        );
    });
</script>
