<script lang="ts">
    import { userState } from "../../stores/user.svelte";
    import ArtistResults from "../artist/ArtistResults.svelte";

    // Mock ID for development
    const MOCK_CID = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ2KKA";
    const MOCK_KID = "mock_key";

    // Determine address to show: Real user ID or Mock ID if in mock mode
    let viewAddress = $derived(
        userState.keyId === MOCK_KID ? MOCK_CID : userState.contractId,
    );
</script>

<div class="w-full min-h-screen pt-20 pb-24 px-4 bg-[#121212]">
    {#if !viewAddress}
        <div
            class="flex flex-col justify-center items-center py-20 text-gray-400 font-pixel"
        >
            <p class="text-xl mb-2">🔐 Not Signed In</p>
            <p class="text-sm mb-4">Please sign in to view your creations</p>
        </div>
    {:else}
        <!-- 
          Reuse the exact same component as the Public Artist Page.
          ArtistResults handles data fetching, visualization, header, and grid.
      -->
        <ArtistResults address={viewAddress} />
    {/if}
</div>
