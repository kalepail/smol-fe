<script lang="ts">
    import { onMount } from "svelte";
    import type { Smol } from "../../types/domain";
    import { fetchSmols } from "../../services/api/smols";

    interface Artist {
        address: string;
        count: number;
        latestSmol: Smol;
    }

    // No more props - we fetch live data on mount!
    let sortMode = $state<"fresh" | "top">("fresh");
    let artistMap = $state(new Map<string, Artist>());
<<<<<<< HEAD
    let isLoading = $state(true);
=======
    let isSyncing = $state(false);

    // Initialize map
    initialArtists.forEach((a) => artistMap.set(a.address, a));
    if (import.meta.env.DEV) {
        console.log(
            `[ArtistsIndex] Initialized with ${initialArtists.length} artists`,
        );
    }
>>>>>>> ui/playnext-fix

    const sortedArtists = $derived.by(() => {
        const list = Array.from(artistMap.values());
        if (sortMode === "fresh") {
            return list.sort(
                (a, b) =>
                    new Date(b.latestSmol.Created_At).getTime() -
                    new Date(a.latestSmol.Created_At).getTime(),
            );
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

    // Build artist map from smols
    function aggregateArtists(smols: Smol[]) {
        const map = new Map<string, Artist>();

        smols.forEach((smol) => {
            if (!smol.Address) return;

            let entry = map.get(smol.Address);

            if (!entry) {
                entry = {
                    address: smol.Address,
                    count: 1,
                    latestSmol: smol,
                };
                map.set(smol.Address, entry);
            } else {
                entry.count++;
                if (
                    new Date(smol.Created_At) >
                    new Date(entry.latestSmol.Created_At)
                ) {
                    entry.latestSmol = smol;
                }
            }
        });

        return map;
    }

    onMount(async () => {
        try {
            console.log("[Artists] Fetching live smols data...");
            const smols = await fetchSmols();
            console.log(
                `[Artists] Loaded ${smols.length} smols, aggregating artists...`,
            );
            artistMap = aggregateArtists(smols);
            console.log(`[Artists] Found ${artistMap.size} unique artists`);
        } catch (e) {
            console.error("[Artists] Failed to fetch smols:", e);
        } finally {
            isLoading = false;
        }
    });
</script>

<div class="mb-10 flex items-center gap-4">
    <div class="flex bg-white/5 p-1 rounded-lg border border-white/10">
        <button
            onclick={() => (sortMode = "fresh")}
            class="px-4 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest transition-all {sortMode ===
            'fresh'
                ? 'bg-lime-500 text-black font-bold'
                : 'text-white/40 hover:text-white'}"
        >
            Fresh Drops
        </button>
        <button
            onclick={() => (sortMode = "top")}
            class="px-4 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest transition-all {sortMode ===
            'top'
                ? 'bg-lime-500 text-black font-bold'
                : 'text-white/40 hover:text-white'}"
        >
            Top Artists
        </button>
    </div>

    {#if isLoading}
        <span
            class="text-[10px] text-lime-500/50 font-mono animate-pulse uppercase tracking-[0.2em]"
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
            class="group relative bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/5 hover:border-lime-500/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(132,204,22,0.1)] block"
        >
            <div class="aspect-square w-full overflow-hidden bg-black relative">
                <img
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${artist.latestSmol.Id}.png`}
                    class="w-full h-full object-cover pixelated transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                    style="transform: translateZ(0); -webkit-transform: translateZ(0);"
                    loading="lazy"
                    alt={`Artist ${artist.address}`}
                />

                <!-- Metadata Overlay -->
                <div
                    class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity"
                ></div>

                <div
                    class="absolute bottom-2 left-3 right-3 flex justify-between items-end"
                >
                    <div
                        class="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] text-white/70 font-mono border border-white/10 uppercase tracking-tighter"
                    >
                        {artist.count} Tracks
                    </div>
                </div>
            </div>

            <div class="p-4 bg-gradient-to-b from-[#1a1a1a] to-[#111]">
                <h3
                    class="font-mono text-xs font-bold truncate text-white/90 group-hover:text-lime-400 transition-colors mb-2"
                >
                    {artist.address.slice(0, 6)}...{artist.address.slice(-4)}
                </h3>

                <div class="flex items-center justify-between">
                    <span
                        class="text-[9px] text-white/30 uppercase tracking-[0.15em] font-light"
                        >Latest</span
                    >
                    <span
                        class="text-[10px] text-lime-500/80 font-mono font-medium"
                        >{timeAgo(artist.latestSmol.Created_At)}</span
                    >
                </div>
            </div>

            <!-- Glow effect on hover -->
            <div
                class="absolute inset-0 border border-lime-500/0 group-hover:border-lime-500/20 rounded-2xl transition-all pointer-events-none"
            ></div>
        </a>
    {/each}
</div>
