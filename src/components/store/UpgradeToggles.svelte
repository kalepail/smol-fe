<script lang="ts">
    import { userState } from "../../stores/user.state.svelte";
    import {
        upgradesState,
        enabledState,
        toggleUpgrade,
    } from "../../stores/upgrades.svelte.ts";

    // Fetch artist's actual badge ownership from API
    let artistBadges = $state<{
        premiumHeader: boolean;
        goldenKale: boolean;
        showcaseReel: boolean;
        vibeMatrix: boolean;
    }>({
        premiumHeader: false,
        goldenKale: false,
        showcaseReel: false,
        vibeMatrix: false,
    });
    let syncing = $state(false);

    $effect(() => {
        const address = userState.contractId;
        if (address) {
            fetch(`/api/artist/badges/${address}`)
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    if (data) {
                        artistBadges = data;
                    } else {
                        // Fallback to local state when API unavailable (No Cloudflare yet)
                        artistBadges = {
                            premiumHeader: upgradesState.premiumHeader,
                            goldenKale: upgradesState.goldenKale,
                            showcaseReel: upgradesState.showcaseReel,
                            vibeMatrix: upgradesState.vibeMatrix,
                        };
                    }
                })
                .catch(() => {
                    // Network error - fallback to local state
                    artistBadges = {
                        premiumHeader: upgradesState.premiumHeader,
                        goldenKale: upgradesState.goldenKale,
                        showcaseReel: upgradesState.showcaseReel,
                        vibeMatrix: upgradesState.vibeMatrix,
                    };
                });
        }
    });

    async function handleToggle(
        key: "premiumHeader" | "goldenKale" | "showcaseReel" | "vibeMatrix",
    ) {
        // Toggle locally first for instant feedback
        toggleUpgrade(key);

        // Sync to server for public visibility
        syncing = true;
        try {
            const token = document.cookie
                .split("; ")
                .find((row) => row.startsWith("smol_token="))
                ?.split("=")[1];

            if (token) {
                await fetch(`${import.meta.env.PUBLIC_API_URL}/prefs`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        premiumHeaderEnabled: enabledState.premiumHeader,
                        goldenKaleEnabled: enabledState.goldenKale,
                        showcaseReelEnabled: enabledState.showcaseReel,
                        vibeMatrixEnabled: enabledState.vibeMatrix,
                    }),
                });
            }
        } catch (e) {
            console.error("[UpgradeToggles] Failed to sync preferences", e);
        } finally {
            syncing = false;
        }
    }
</script>

{#if artistBadges.premiumHeader || artistBadges.goldenKale || artistBadges.showcaseReel || artistBadges.vibeMatrix}
    <div
        class="w-full max-w-2xl mx-auto mt-12 border-4 border-white/20 bg-black/50 p-4"
    >
        <h3
            class="text-white text-sm uppercase tracking-widest mb-4 text-center font-bold"
        >
            Your Unlocks
        </h3>

        <div class="space-y-3">
            {#if artistBadges.premiumHeader}
                <label
                    class="flex items-center justify-between p-3 border-2 border-white/10 hover:border-[#9ae600]/50 cursor-pointer transition-colors"
                >
                    <span class="text-white text-xs uppercase tracking-wider"
                        >[PREMIUM_HEADER]</span
                    >
                    <button
                        onclick={() => handleToggle("premiumHeader")}
                        class="w-12 h-6 rounded-full border-2 transition-colors relative {enabledState.premiumHeader
                            ? 'bg-[#9ae600] border-[#9ae600]'
                            : 'bg-white/10 border-white/30'}"
                    >
                        <div
                            class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform {enabledState.premiumHeader
                                ? 'translate-x-6'
                                : 'translate-x-0.5'}"
                        ></div>
                    </button>
                </label>
            {/if}

            {#if artistBadges.goldenKale}
                <label
                    class="flex items-center justify-between p-3 border-2 border-white/10 hover:border-amber-500/50 cursor-pointer transition-colors"
                >
                    <span class="text-white text-xs uppercase tracking-wider"
                        >[GOLDEN_KALE]</span
                    >
                    <button
                        onclick={() => handleToggle("goldenKale")}
                        class="w-12 h-6 rounded-full border-2 transition-colors relative {enabledState.goldenKale
                            ? 'bg-amber-500 border-amber-500'
                            : 'bg-white/10 border-white/30'}"
                    >
                        <div
                            class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform {enabledState.goldenKale
                                ? 'translate-x-6'
                                : 'translate-x-0.5'}"
                        ></div>
                    </button>
                </label>
            {/if}

            {#if artistBadges.showcaseReel}
                <label
                    class="flex items-center justify-between p-3 border-2 border-white/10 hover:border-[#BF953F]/50 cursor-pointer transition-colors"
                >
                    <span class="text-white text-xs uppercase tracking-wider"
                        >[SHOWCASE_REEL]</span
                    >
                    <button
                        onclick={() => handleToggle("showcaseReel")}
                        class="w-12 h-6 rounded-full border-2 transition-colors relative {enabledState.showcaseReel
                            ? 'bg-[#BF953F] border-[#BF953F]'
                            : 'bg-white/10 border-white/30'}"
                    >
                        <div
                            class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform {enabledState.showcaseReel
                                ? 'translate-x-6'
                                : 'translate-x-0.5'}"
                        ></div>
                    </button>
                </label>
            {/if}
            {#if artistBadges.vibeMatrix}
                <label
                    class="flex items-center justify-between p-3 border-2 border-white/10 hover:border-[#d836ff]/50 cursor-pointer transition-colors"
                >
                    <span class="text-white text-xs uppercase tracking-wider"
                        >[VIBE_MATRIX]</span
                    >
                    <button
                        onclick={() => handleToggle("vibeMatrix")}
                        class="w-12 h-6 rounded-full border-2 transition-colors relative {enabledState.vibeMatrix
                            ? 'bg-[#d836ff] border-[#d836ff]'
                            : 'bg-white/10 border-white/30'}"
                    >
                        <div
                            class="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform {enabledState.vibeMatrix
                                ? 'translate-x-6'
                                : 'translate-x-0.5'}"
                        ></div>
                    </button>
                </label>
            {/if}
        </div>

        <p
            class="text-white/40 text-[8px] uppercase tracking-widest text-center mt-3"
        >
            Toggle to show/hide on your profile
        </p>
    </div>
{/if}
