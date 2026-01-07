<script lang="ts">
    import { userState } from "../stores/user.svelte";
    import { verifyPastPurchases } from "../services/api/verifyUpgrades";

    let checkedAddress = $state<string | null>(null);

    $effect(() => {
        const address = userState.contractId;

        if (address && address !== checkedAddress) {
            checkedAddress = address;
            verifyPastPurchases(address);
        }
    });
</script>
