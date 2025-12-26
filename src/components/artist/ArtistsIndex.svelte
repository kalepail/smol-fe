<script lang="ts">
    import { onMount } from "svelte";
    import type { Smol } from "../../types/domain";

    interface Artist {
        address: string;
        count: number;
        latestSmol: Smol;
    }

    interface Props {
        initialArtists: Artist[];
    }

    let { initialArtists }: Props = $props();
    let artists = $state<Artist[]>(initialArtists);
    let isSyncing = $state(false);

    // Convert array to map for easy updates
    let artistMap = new Map<string, Artist>();

    // Initialize map
    initialArtists.forEach((a) => artistMap.set(a.address, a));

    async function checkRecentActivity() {
        isSyncing = true;
        try {
            const url = new URL(import.meta.env.PUBLIC_API_URL);
            url.searchParams.set("limit", "100"); // Check last 100 items

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const recentSmols: Smol[] = data.smols || [];

                let updated = false;

                recentSmols.forEach((smol) => {
                    if (!smol.Address) return;

                    let entry = artistMap.get(smol.Address);

                    // If new artist found (not in snapshot)
                    if (!entry) {
                        entry = {
                            address: smol.Address,
                            count: 0,
                            latestSmol: smol,
                        };
                        artistMap.set(smol.Address, entry);
                        updated = true;
                    }

                    // We can't know if we already counted this specific smol without a set of IDs.
                    // However, since we are aggregated from a static snapshot,
                    // and we are fetching "recent", there is overlap.
                    // To do this strictly correctly, we would need to know the ID of the 'latestSmol' from snapshot.
                    // Or we accept that 'count' might be slightly off if we don't dedupe.

                    // Better strategy:
                    // The snapshot is static.
                    // We shouldn't double count.
                    // We'll just update the 'latestSmol' cover if this one is newer.
                    // AND if we want to update count, we need to know if this smol is NEW relative to snapshot.
                    // This is hard without the full list of IDs.

                    // Compromise for "Stay up to date":
                    // 1. Update cover art (visual freshness).
                    // 2. Add NEW artists.
                    // 3. Updating count is tricky without ID set.
                    // Let's assume snapshot is reasonably fresh.
                    // We will mostly prioritize updating the COVER ART.

                    if (
                        new Date(smol.Created_At) >
                        new Date(entry.latestSmol.Created_At)
                    ) {
                        entry.latestSmol = smol;
                        updated = true;
                    }
                });

                if (updated) {
                    // Re-sort
                    artists = Array.from(artistMap.values()).sort(
                        (a, b) => b.count - a.count,
                    );
                }
            }
        } catch (e) {
            console.error("Failed to sync artists", e);
        } finally {
            isSyncing = false;
        }
    }

    onMount(() => {
        checkRecentActivity();
    });
</script>

<div
    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
>
    {#each artists as artist (artist.address)}
        <a
            href={`/artist/${artist.address}`}
            class="group bg-white/5 rounded-xl overflow-hidden hover:bg-white/10 transition-all hover:-translate-y-1 block"
        >
            <div
                class="aspect-square w-full overflow-hidden bg-black/50 relative"
            >
                <img
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${artist.latestSmol.Id}.png`}
                    class="w-full h-full object-cover pixelated transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    alt={`Artist ${artist.address}`}
                />
                {#if isSyncing}
                    <div
                        class="absolute top-2 right-2 w-2 h-2 rounded-full bg-lime-500 animate-pulse"
                    ></div>
                {/if}
            </div>
            <div class="p-4">
                <h3
                    class="font-mono text-sm font-bold truncate text-lime-400 group-hover:text-lime-300 mb-1"
                >
                    {artist.address}
                </h3>
                <p class="text-xs text-white/50">{artist.count} Tracks</p>
            </div>
        </a>
    {/each}
</div>
