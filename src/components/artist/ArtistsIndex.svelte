<script lang="ts">
    import { onMount } from "svelte";
    import { userState } from "../../stores/user.svelte.ts";
    import { isUpgradeActive } from "../../stores/upgrades.svelte.ts";
    import { getVIPAccess } from "../../utils/vip";
    import { API_URL } from "../../utils/apiUrl";
    import type { Smol } from "../../types/domain";
    import { safeFetchSmols } from "../../services/api/smols";

    // VIP addresses managed in src/utils/vip.ts

    interface Artist {
        address: string;
        count: number;
        latestSmol: Smol;
        recentSmols: Smol[]; // Up to 20 for showcase reel
    }

    // No more props - we fetch live data on mount!
    let sortMode = $state<"fresh" | "top">("fresh");
    let artistMap = $state(new Map<string, Artist>());
    let isLoading = $state(true);

    const sortedArtists = $derived.by(() => {
        const list = Array.from(artistMap.values());
        if (sortMode === "fresh") {
            return list.sort((a, b) => {
                const dateA = new Date(a.latestSmol.Created_At || 0).getTime();
                const dateB = new Date(b.latestSmol.Created_At || 0).getTime();
                return dateB - dateA;
            });
        } else {
            return list.sort((a, b) => b.count - a.count);
        }
    });

    function timeAgo(dateString: string) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (seconds < 60) return "Just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    }

    // Build artist map from smols (stores up to 20 recent for showcase)
    function aggregateArtists(smols: Smol[]) {
        const map = new Map<string, Artist>();

        // Sort by date first (newest first)
        const sortedSmols = [...smols].sort((a, b) => {
            const dateA = new Date(a.Created_At || 0).getTime();
            const dateB = new Date(b.Created_At || 0).getTime();
            return dateB - dateA;
        });

        sortedSmols.forEach((smol) => {
            if (!smol.Address) return;

            let entry = map.get(smol.Address);

            if (!entry) {
                entry = {
                    address: smol.Address,
                    count: 1,
                    latestSmol: smol,
                    recentSmols: [smol],
                };
                map.set(smol.Address, entry);
            } else {
                entry.count++;
                // Keep up to 40 most recent for showcase reel (increased for "more art")
                const limit = hasShowcase(smol.Address || "") ? 40 : 20;
                if (entry.recentSmols.length < limit) {
                    entry.recentSmols.push(smol);
                }
            }
        });

        // Ensure even count for showcase artists to maintain seamless 2-column loop
        map.forEach((artist) => {
            if (
                hasShowcase(artist.address) &&
                artist.recentSmols.length % 2 !== 0
            ) {
                // Remove last item if odd to keep layout aligned
                artist.recentSmols.pop();
            }
        });

        return map;
    }

    // Check if artist has showcase reel (VIP config + purchased upgrades)
    function hasShowcase(address: string): boolean {
        // 1. VIP Configuration (Manual granular grants)
        const vip = getVIPAccess(address);
        if (vip?.showcaseReel) return true;

        // 2. Check if this is the logged-in user and they have the upgrade enabled
        if (
            userState.contractId === address &&
            isUpgradeActive("showcaseReel")
        ) {
            return true;
        }

        return false;
    }

    onMount(async () => {
        try {
            const smols = await safeFetchSmols();
            artistMap = aggregateArtists(smols);
        } catch (e) {
            // console.error("[Artists] Failed to fetch smols:", e);
        } finally {
            isLoading = false;
        }
    });
</script>

<div class="mb-10 flex flex-col items-center justify-center gap-4">
    <div class="flex bg-white/5 p-1 rounded-lg border border-white/10">
        <button
            onclick={() => (sortMode = "fresh")}
            class="px-4 py-1.5 rounded-md text-xs font-pixel tracking-widest transition-all {sortMode ===
            'fresh'
                ? 'bg-lime-500 text-black font-bold'
                : 'text-white/40 hover:text-white'}"
        >
            Fresh Drops
        </button>
        <button
            onclick={() => (sortMode = "top")}
            class="px-4 py-1.5 rounded-md text-xs font-pixel tracking-widest transition-all {sortMode ===
            'top'
                ? 'bg-lime-500 text-black font-bold'
                : 'text-white/40 hover:text-white'}"
        >
            Top Artists
        </button>
    </div>

    {#if isLoading}
        <span
            class="text-[10px] text-lime-500/50 font-pixel animate-pulse tracking-[0.2em]"
            >Syncing live activity...</span
        >
    {/if}
</div>

<div
    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8"
>
    {#each sortedArtists as artist (artist.address)}
        <a
            href={`/artist/${artist.address}`}
            class="group relative rounded-2xl transition-all duration-300 block"
        >
            {#if hasShowcase(artist.address)}
                <!-- Robinhood Gold Ripple Layers (Lighter/Champagne) -->
                <div
                    class="absolute -inset-1 rounded-2xl bg-[#F5E3A1]/25 blur-sm animate-[ripple_2s_ease-out_infinite]"
                ></div>
                <div
                    class="absolute -inset-1 rounded-2xl bg-[#F7E7CE]/20 blur-md animate-[ripple_2s_ease-out_0.5s_infinite]"
                ></div>
                <div
                    class="absolute -inset-1 rounded-2xl bg-[#FFF9E3]/15 blur-lg animate-[ripple_2s_ease-out_1s_infinite]"
                ></div>
            {/if}

            <!-- Main Card Container -->
            <div
                class="relative rounded-2xl overflow-hidden transition-all duration-300 {hasShowcase(
                    artist.address,
                )
                    ? 'p-[1.5px] bg-gradient-to-br from-[#BF953F] via-[#FCF6BA] to-[#AA771C] shadow-[0_0_20px_rgba(245,227,161,0.2)]'
                    : 'bg-[#1a1a1a] border border-white/5 hover:border-lime-500/30 hover:shadow-[0_0_30px_rgba(132,204,22,0.1)]'}"
            >
                <div
                    class="relative w-full h-full rounded-[calc(1rem-1.5px)] overflow-hidden bg-[#1a1a1a]"
                >
                    {#if hasShowcase(artist.address)}
                        <!-- Inner Shine Overlay (Robinhood Gold Style) -->
                        <div
                            class="absolute inset-0 z-40 pointer-events-none"
                            style="box-shadow: inset 0 0 20px rgba(245,227,161,0.2), inset 0 0 40px rgba(255,249,227,0.1);"
                        ></div>
                    {/if}
                    <div
                        class="aspect-square w-full overflow-hidden bg-black relative"
                    >
                        {#if hasShowcase(artist.address) && artist.recentSmols.length >= 4}
                            <!-- SHOWCASE REEL: Animated 2-column slideshow -->
                            <div class="absolute inset-0 overflow-hidden">
                                <div
                                    class="flex flex-wrap w-full animate-showcase"
                                    style="height: 200%;"
                                >
                                    {#each [...artist.recentSmols, ...artist.recentSmols] as smol}
                                        <div class="w-1/2 aspect-square">
                                            <img
                                                src={`${API_URL}/image/${smol.Id}.png`}
                                                alt="art"
                                                class="w-full h-full object-cover pixelated"
                                                loading="lazy"
                                            />
                                        </div>
                                    {/each}
                                </div>
                            </div>
                            <!-- Golden Kale Badge (Top Right) -->
                            <div class="absolute top-2 right-2 z-20">
                                <div class="relative group/badge">
                                    <img
                                        src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                                        class="w-8 h-8 filter sepia-[100%] saturate-[400%] brightness-[1.2] contrast-[1.2] hue-rotate-[5deg] drop-shadow-[2px_2px_0px_rgba(180,140,0,1)] transition-transform group-hover/badge:scale-110"
                                        style="image-rendering: pixelated;"
                                        alt="Golden Kale"
                                    />
                                    <!-- Three Sparkles ✨ -->
                                    <div
                                        class="absolute -top-1 -right-2 text-[10px] text-[#FCF6BA] animate-ping opacity-90 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                                        style="animation-duration: 2s;"
                                    >
                                        ✦
                                    </div>
                                    <div
                                        class="absolute bottom-0 -left-2 text-[8px] text-[#FCF6BA] animate-ping delay-300 opacity-80"
                                        style="animation-duration: 2.2s;"
                                    >
                                        ✦
                                    </div>
                                    <div
                                        class="absolute -top-1 -left-1 text-[5px] text-[#FCF6BA] animate-pulse delay-700 opacity-70"
                                    >
                                        ✦
                                    </div>
                                </div>
                            </div>

                            <!-- Vignette Inner Shine Overlay -->
                            <div
                                class="absolute inset-0 z-10 pointer-events-none rounded-2xl"
                                style="box-shadow: inset 0 0 30px rgba(0,0,0,0.4);"
                            ></div>
                        {:else}
                            <!-- Standard Single Image -->
                            <img
                                src={`${API_URL}/image/${artist.latestSmol.Id}.png`}
                                class="w-full h-full object-cover pixelated transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                                style="transform: translateZ(0); -webkit-transform: translateZ(0);"
                                loading="lazy"
                                alt={`Artist ${artist.address}`}
                            />
                        {/if}

                        <!-- Metadata Overlay -->
                        <div
                            class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity"
                        ></div>

                        <div
                            class="absolute bottom-2 left-3 right-3 flex justify-between items-end"
                        >
                            <div
                                class="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] text-white/70 font-pixel border border-white/10 tracking-tighter"
                            >
                                {artist.count} Tracks
                            </div>
                        </div>
                    </div>

                    <div
                        class="p-4 transition-all duration-300 {hasShowcase(
                            artist.address,
                        )
                            ? 'bg-gradient-to-br from-[#BF953F] via-[#FCF6BA] to-[#AA771C] border-t border-white/40 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]'
                            : 'bg-gradient-to-b from-[#1a1a1a] to-[#111]'}"
                    >
                        {#if hasShowcase(artist.address)}
                            <!-- Bezel Specular Reflection Sweep -->
                            <div
                                class="absolute inset-0 z-0 overflow-hidden pointer-events-none"
                            >
                                <div
                                    class="absolute inset-0 w-[200%] -translate-x-full animate-[shimmer_4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg]"
                                ></div>
                            </div>
                            <!-- Top Bezel Edge (Brightest) -->
                            <div
                                class="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-white/20 via-white/60 to-white/20"
                            ></div>
                            <!-- Bottom Edge Depth -->
                            <div
                                class="absolute inset-x-0 bottom-0 h-[1px] bg-black/20"
                            ></div>
                        {/if}
                        <h3
                            class="font-pixel text-xs font-bold truncate transition-colors mb-2 {hasShowcase(
                                artist.address,
                            )
                                ? 'text-black/80 group-hover:text-black'
                                : 'text-white/90 group-hover:text-lime-400'}"
                        >
                            {artist.address.slice(
                                0,
                                4,
                            )}...{artist.address.slice(-4)}
                        </h3>

                        <div class="flex items-center justify-between">
                            <span
                                class="text-[9px] tracking-[0.15em] font-pixel {hasShowcase(
                                    artist.address,
                                )
                                    ? 'text-black/40'
                                    : 'text-white/30'}">Latest</span
                            >
                            <span
                                class="text-[10px] font-pixel font-medium {hasShowcase(
                                    artist.address,
                                )
                                    ? 'text-black/70'
                                    : 'text-lime-500/80'}"
                                >{timeAgo(
                                    artist.latestSmol.Created_At || "",
                                )}</span
                            >
                        </div>
                    </div>

                    <!-- Glow effect on hover (for non-showcase) -->
                    {#if !hasShowcase(artist.address)}
                        <div
                            class="absolute inset-0 border border-lime-500/0 group-hover:border-lime-500/20 rounded-2xl transition-all pointer-events-none"
                        ></div>
                    {:else}
                        <!-- Glossy Overlay for Showcase -->
                        <div
                            class="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 pointer-events-none rounded-2xl"
                        ></div>
                    {/if}
                </div>
            </div></a
        >
    {/each}
</div>

<style>
    @keyframes showcase-scroll {
        0% {
            transform: translateY(0);
        }
        100% {
            transform: translateY(-50%);
        }
    }
    .animate-showcase {
        animation: showcase-scroll 15s linear infinite;
    }
    @keyframes shimmer {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(200%);
        }
    }
    @keyframes glow-pulse {
        0%,
        100% {
            opacity: 0.3;
            filter: blur(1px);
        }
        50% {
            opacity: 0.6;
            filter: blur(2px);
        }
    }
    @keyframes ripple {
        0% {
            transform: scale(1);
            opacity: 0.4;
        }
        100% {
            transform: scale(1.05);
            opacity: 0;
        }
    }
</style>
