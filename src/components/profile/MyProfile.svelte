<script lang="ts">
    import { userState } from "../../stores/user.svelte";
    import ArtistResults from "../artist/ArtistResults.svelte";

    // Check if we have a contract ID (user address)
    const address = $derived(userState.contractId);
</script>

<div class="w-full min-h-screen pt-4 pb-24">
    {#if address}
        <!-- Render ArtistResults as if viewing the user's own artist page -->
        <ArtistResults {address} />
    {:else}
        <div
            class="flex flex-col items-center justify-center min-h-[50vh] text-center p-8"
        >
            <div class="text-4xl mb-4">🔐</div>
            <h2 class="text-2xl font-bold text-lime-400 mb-2">
                Login Required
            </h2>
            <p class="text-gray-400 max-w-md">
                Please connect your wallet to view your profile and manage your
                smols.
            </p>
        </div>
    {/if}
</div>
