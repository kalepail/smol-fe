<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import type { Smol } from "../../types/domain";
    // import SmolGrid from "../smol/SmolGrid.svelte"; // Replaced with custom grid
    import {
        getFullSnapshot,
        safeFetchSmols,
        fetchLikedSmols,
    } from "../../services/api/smols";
    import {
        audioState,
        selectSong,
        registerSongNextCallback,
        setPlaylistContext,
        isPlaying,
        togglePlayPause,
    } from "../../stores/audio.svelte.ts";
    import MiniVisualizer from "../ui/MiniVisualizer.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import { navigate } from "astro:transitions/client";
    import { userState } from "../../stores/user.state.svelte";
    import { useGridMediaSession } from "../../hooks/useGridMediaSession";
    import { upgradesState, isUnlocked } from "../../stores/upgrades.svelte.ts";

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
    import {
        getSnapshotTagStats,
        getUnifiedTags,
        shouldLogTagDiagnostics,
        sortTagStats,
    } from "../../services/tags/unifiedTags";
    import type { TagMeta, TagStat } from "../../services/tags/unifiedTags";
    import { getSnapshotTagGraphAsync } from "../../services/api/snapshot";

    let smols = $state<Smol[]>([]);
    let hasLoggedTags = $state(false);
    let isLoading = $state(true);

    let tagStats = $state<TagStat[]>([]);
    let tagGraph = $state<any>(null);
    let tagMeta = $state<TagMeta>({
        snapshotTagsCount: 0,
        liveTagsCount: 0,
        finalTagsCount: 0,
        dataSourceUsed: "snapshot",
    });

    // Mobile specific state
    let isMobile = $state(false);
    let activeTab = $state<"library" | "results">("library");

    function updateMobileState() {
        isMobile = window.innerWidth < 1024;
    }

    $effect(() => {
        if (isUnlocked("vibeMatrix") && !tagGraph) {
            getSnapshotTagGraphAsync().then((g) => {
                if (g) tagGraph = g;
            });
        }
    });

    onMount(async () => {
        // Restore state from URL
        const params = new URLSearchParams(window.location.search);
        const tagsFromUrl = params.getAll("tag");
        if (tagsFromUrl.length > 0) {
            selectedTags = tagsFromUrl;
        }
        const queryFromUrl = params.get("q");
        if (queryFromUrl) {
            searchQuery = queryFromUrl;
        }

        updateMobileState();
        window.addEventListener("resize", updateMobileState);

        // Safety timeout to prevent infinite loading
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000),
        );

        try {
            await Promise.race([
                (async () => {
                    const snap = await getSnapshotTagStats();
                    tagStats = snap.tags;
                    tagMeta = snap.meta;

                    smols = await getFullSnapshot();
                    const liveSmols = await safeFetchSmols();
                    if (liveSmols.length > 0) {
                        smols = liveSmols;
                    }

                    const unified = await getUnifiedTags({ liveSmols: smols });
                    tagStats = unified.tags;
                    tagMeta = unified.meta;
                })(),
                timeout,
            ]);
        } catch (e) {
            console.error(
                "[TagExplorer] Failed to fetch smols (or timed out):",
                e,
            );
        } finally {
            isLoading = false;
        }
    });

    let selectedTags = $state<string[]>([]);
    let searchQuery = $state("");
    let showAll = $state(false);
    const INITIAL_TAG_LIMIT = 50;

    // Aggregate tags and counts (filtered by search)
    let processedTags = $derived.by(() => {
        let allTags = sortTagStats(tagStats, "frequency");

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            allTags = allTags.filter((t) => t.tag.toLowerCase().includes(q));
        }

        return allTags;
    });

    // Display subset based on showAll
    let displayedTags = $derived.by(() => {
        if (showAll || searchQuery) return processedTags;
        return processedTags.slice(0, INITIAL_TAG_LIMIT);
    });

    // Filter smols based on selection
    let filteredSmols = $derived.by(() => {
        if (selectedTags.length === 0) return [];

        // Pre-normalize selected tags for performance
        const normalizedSelected = selectedTags.map((t) => t.toLowerCase());

        return smols.filter((smol) => {
            const styles = new Set<string>();
            if (smol.Tags) smol.Tags.forEach((t) => styles.add(t));
            if (smol.lyrics?.style)
                smol.lyrics.style.forEach((t) => styles.add(t));

            // Show song if it matches ANY selected tag (Fuzzy Match: Substring)
            // e.g. "Rock" matches "Indie Rock", "Pop" matches "K-Pop"
            const songTags = Array.from(styles);
            return normalizedSelected.some((selectedTag) =>
                songTags.some((songTag) =>
                    songTag.toLowerCase().includes(selectedTag),
                ),
            );
        });
    });

    function selectTag(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter((t) => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
        updateUrl();
    }

    function pivotTag(tag: string) {
        // "Pivot" behavior: Replace current selection with this new vibe
        // This makes the matrix feel like switching a playlist/vibe instantly
        selectedTags = [tag];
        updateUrl();
    }

    function updateUrl() {
        const url = new URL(window.location.href);
        url.searchParams.delete("tag");
        selectedTags.forEach((t) => url.searchParams.append("tag", t));

        if (searchQuery) {
            url.searchParams.set("q", searchQuery);
        } else {
            url.searchParams.delete("q");
        }

        // Use replaceState to avoid cluttering history stack with every click,
        // OR use pushState if we want each step to be back-able.
        // User asked for "Back" to go to grid mode.
        // If they click 5 tags, hitting back 5 times might be annoying.
        // But if they navigate AWAY and come back, we want the state.
        // Updating the URL in place means "Back" from Artist Page -> This URL with params.
        window.history.replaceState({}, "", url);
    }

    function normalizeTag(tag: string) {
        if (!tag) return null;
        return tag
            .toLowerCase()
            .trim()
            .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
            .replace(/\s+/g, " ");
    }

    // Matrix Algorithm: Derive related and tertiary tags - Gated
    let recommendationClusters = $derived.by(() => {
        if (!isUnlocked("vibeMatrix") || !tagGraph || selectedTags.length === 0)
            return { related: [], tertiary: [] };

        // We take the last selected tag as the primary pivot for recommendations
        const primaryTag = normalizeTag(selectedTags[selectedTags.length - 1]);
        if (!primaryTag || !tagGraph.tags[primaryTag])
            return { related: [], tertiary: [] };

        const data = tagGraph.tags[primaryTag];

        // Filter out tags already selected
        const selectedSet = new Set(selectedTags.map(normalizeTag));

        return {
            related: data.direct.filter(
                (t: any) => !selectedSet.has(normalizeTag(t.tag)),
            ),
            tertiary: data.tertiary.filter(
                (t: any) => !selectedSet.has(normalizeTag(t.tag)),
            ),
        };
    });

    // Visual scaling logic
    function getFontSize(count: number, max: number): string {
        const minSize = 0.8;
        const maxSize = 2.0; // Reduced max size for cleaner look
        // Logarithmic scale to handle outliers like "Kpop" vs rare tags
        const normalized = Math.log(count + 1) / Math.log(max + 1);
        const size = minSize + (maxSize - minSize) * normalized;
        return `${size.toFixed(2)}rem`;
    }

    function getOpacity(count: number, max: number): number {
        const min = 0.6;
        const maxOp = 1;
        const normalized = Math.log(count + 1) / Math.log(max + 1);
        return min + (maxOp - min) * normalized;
    }

    const maxCount = $derived(
        processedTags.length > 0 ? processedTags[0].count : 1,
    );

    $effect(() => {
        if (!hasLoggedTags && shouldLogTagDiagnostics() && tagMeta) {
            hasLoggedTags = true;
        }
    });

    $effect(() => {
        // Fetch likes if user is authenticated
        if (userState.contractId) {
            (async () => {
                const likedIds = await fetchLikedSmols();
                // Apply liked state to results
                smols = smols.map((smol) => ({
                    ...smol,
                    Liked: likedIds.some((id) => id === smol.Id),
                }));
            })();
        }
    });

    const mediaHook = useGridMediaSession();

    function songNext() {
        const next = mediaHook.findNextSong(
            filteredSmols,
            audioState.currentSong?.Id,
        );
        if (next) selectSong(next);
    }

    function songPrev() {
        const prev = mediaHook.findPreviousSong(
            filteredSmols,
            audioState.currentSong?.Id,
        );
        if (prev) selectSong(prev);
    }

    // Manage media session and queue callback manually since we removed SmolGrid
    $effect(() => {
        registerSongNextCallback(songNext);
        const cleanupMedia = mediaHook.setupMediaSessionHandlers(
            songPrev,
            songNext,
        );
        return () => {
            registerSongNextCallback(null);
            cleanupMedia();
        };
    });

    // Update media session metadata when song changes
    $effect(() => {
        const song = audioState.currentSong;
        mediaHook.updateMediaMetadata(song, API_URL);
    });

    // Store playlist context for fallback playback when navigating to pages without playlists
    $effect(() => {
        if (filteredSmols.length > 0) {
            const currentIndex = audioState.currentSong
                ? filteredSmols.findIndex((s) => s.Id === audioState.currentSong?.Id)
                : 0;
            setPlaylistContext(filteredSmols, Math.max(0, currentIndex));
        }
    });

    function handleLikeChanged(smol: Smol, liked: boolean) {
        // Update local state
        const foundIndex = smols.findIndex((s) => s.Id === smol.Id);
        if (foundIndex !== -1) {
            smols[foundIndex].Liked = liked;
        }
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("resize", updateMobileState);
        }
    });
</script>

```html
<div
    class="h-full flex flex-col lg:flex-row gap-6 p-4 max-w-[1800px] mx-auto overflow-hidden relative"
>
    <!-- Mobile View Switcher -->
    {#if isMobile}
        <div class="flex gap-2 mb-4 shrink-0">
            <button
                class="flex-1 py-3 font-pixel text-xs border-2 transition-all {activeTab ===
                'library'
                    ? 'bg-[#ff424c] text-white border-[#ff424c]'
                    : 'bg-[#1e1e1e] text-white/40 border-white/10'}"
                onclick={() => (activeTab = "library")}
            >
                VIBE LIBRARY
            </button>
            <button
                class="flex-1 py-3 font-pixel text-xs border-2 transition-all {activeTab ===
                'results'
                    ? 'bg-[#ff424c] text-white border-[#ff424c]'
                    : 'bg-[#1e1e1e] text-white/40 border-white/10'}"
                onclick={() => (activeTab = "results")}
                disabled={selectedTags.length === 0}
            >
                {selectedTags.length > 0 ? "VIBE MATRIX" : "PICK A VIBE"}
            </button>
        </div>
    {/if}

    <!-- Left Column: Header & Tags -->
    <div
        class="w-full lg:w-[400px] xl:w-[450px] flex flex-col min-h-0 shrink-0 gap-6 {isMobile &&
        activeTab !== 'library'
            ? 'hidden'
            : 'h-[45%] lg:h-auto'}"
    >
        <!-- Header Section -->
        <div>
            <!-- Header & Search Row -->
            <div class="flex flex-col gap-4">
                <div
                    class="flex flex-col items-center lg:items-start gap-1 cursor-default group"
                >
                    <div class="flex items-baseline gap-2">
                        <span
                            class="text-[#d1d5db] font-pixel font-bold text-3xl tracking-tight"
                            style="text-shadow: 3px 3px 0px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;"
                            >SMOL</span
                        >
                        <span
                            class="font-pixel font-bold text-[#ff424c] text-3xl drop-shadow-[0_0_10px_rgba(255,66,76,0.5)]"
                            style="text-shadow: 3px 3px 0px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;"
                            >TAGS</span
                        >
                    </div>
                    <span
                        class="text-[8px] font-pixel text-[#FDDA24]/50 tracking-[0.3em] uppercase"
                        >Explore the Vibe Matrix</span
                    >
                </div>

                <!-- Search Bar (Pixel Style) -->
                <div class="relative w-full flex gap-2">
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Search vibes..."
                        class="flex-1 px-4 py-2 text-sm font-pixel placeholder-white/30 focus:outline-none transition-all bg-[#1e1e1e] border-2 border-[#ff424c]/30 focus:border-[#ff424c] text-white"
                        style="box-shadow: 4px 4px 0px 0px rgba(0,0,0,0.5);"
                    />
                    {#if searchQuery}
                        <button
                            class="text-white/40 hover:text-[#ff424c] transition-colors font-pixel"
                            onclick={() => (searchQuery = "")}
                        >
                            ✕
                        </button>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Tag Cloud Container -->
        <div class="flex-1 min-h-0 relative flex flex-col">
            <!-- Tag Cloud (Retro Glass Style) -->
            <div
                class="absolute inset-0 p-6 reactive-glass rounded-3xl transition-all duration-500 ease-in-out border-2 border-white/10 hover:border-[#ff424c]/30 backdrop-blur-xl overflow-hidden group/container flex flex-col"
                style="box-shadow: 8px 8px 0px 0px rgba(0,0,0,0.3); background-color: #1e1e1e;"
            >
                <!-- Scanline Effect (Subtle) -->
                <div
                    class="absolute inset-0 pointer-events-none opacity-[0.03] z-10"
                    style="background: repeating-linear-gradient(0deg, transparent 0px, transparent 2px, #fff 2px, #fff 4px);"
                ></div>

                <div
                    class="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-20"
                >
                    <div
                        class="flex flex-wrap gap-x-3 gap-y-2 justify-center lg:justify-start content-start"
                    >
                        {#each displayedTags as { tag, count }}
                            <button
                                class="transition-all duration-300 hover:scale-110 leading-none py-2 px-3 rounded-full font-pixel tracking-wide text-[10px] md:text-xs {selectedTags.includes(
                                    tag,
                                )
                                    ? 'text-[#ff424c] drop-shadow-[0_0_8px_rgba(255,66,76,0.5)] bg-white/5 border border-[#ff424c]/30'
                                    : 'text-white/80 hover:text-white border border-transparent hover:border-white/20'}"
                                style="opacity: {selectedTags.includes(tag)
                                    ? 1
                                    : getOpacity(count, maxCount)}"
                                onclick={() => selectTag(tag)}
                            >
                                {tag}
                                {#if selectedTags.includes(tag)}
                                    <span
                                        class="text-[0.6em] align-top ml-1 text-[#ff424c]/60 font-pixel"
                                        >{count}</span
                                    >
                                {/if}
                            </button>
                        {/each}

                        {#if processedTags.length === 0}
                            <div
                                class="w-full text-center text-white/20 italic py-10 font-pixel text-xs tracking-widest"
                            >
                                NO TAGS FOUND FOR "{searchQuery.toUpperCase()}"
                            </div>
                        {/if}
                    </div>
                </div>

                {#if !searchQuery && processedTags.length > INITIAL_TAG_LIMIT}
                    <div
                        class="mt-4 pt-4 border-t border-white/5 flex flex-col gap-3 relative z-20 shrink-0"
                    >
                        <button
                            class="w-full text-[10px] font-pixel tracking-[0.2em] text-white/40 hover:text-[#ff424c] transition-all uppercase px-4 py-2 rounded-lg border border-white/5 hover:border-[#ff424c]/30 hover:bg-white/5"
                            onclick={() => (showAll = !showAll)}
                        >
                            {showAll
                                ? "Show Less"
                                : `Expand Library (${processedTags.length} Vibes)`}
                        </button>

                        {#if selectedTags.length > 0}
                            <div class="flex flex-col gap-2">
                                <button
                                    onclick={() => (activeTab = "results")}
                                    class="lg:hidden w-full font-pixel text-center inline-block text-white bg-[#ff424c] font-bold px-6 py-2 rounded shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] hover:shadow-[4px_4px_0px_0px_rgba(255,66,76,0.3)] active:translate-y-[2px] transition-all uppercase tracking-wider text-[10px]"
                                >
                                    OPEN MATRIX →
                                </button>
                                <a
                                    href={`/radio?${selectedTags.map((t) => `tag=${encodeURIComponent(t)}`).join("&")}`}
                                    class="w-full font-pixel text-center inline-block text-white bg-[#d1d5db] font-bold px-6 py-2 rounded shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] hover:shadow-[4px_4px_0px_0px_rgba(209,213,219,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all uppercase tracking-wider text-[10px]"
                                >
                                    Send to Radio 📻
                                </a>
                            </div>
                        {/if}
                    </div>
                {:else if selectedTags.length > 0}
                    <div
                        class="mt-4 pt-4 border-t border-white/5 relative z-20 shrink-0"
                    >
                        <a
                            href={`/radio?${selectedTags.map((t) => `tag=${encodeURIComponent(t)}`).join("&")}`}
                            class="w-full font-pixel text-center inline-block text-white bg-[#ff424c] font-bold px-6 py-2 rounded shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] hover:shadow-[4px_4px_0px_0px_rgba(255,66,76,0.3)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all uppercase tracking-wider text-[10px]"
                        >
                            Send to Radio 📻
                        </a>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Right Column: Results & Matrix - Gated -->
    <div
        class="flex-1 flex flex-col min-h-0 bg-[#1e1e1e] rounded-3xl border border-white/5 relative overflow-hidden h-[55%] lg:h-auto"
    >
        {#if !isUnlocked("vibeMatrix")}
            <div
                class="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 text-center gap-8 bg-[#1e1e1e]/80 backdrop-blur-md"
            >
                <!-- Premium Asset Icon/Graphic -->
                <div class="relative">
                    <div
                        class="absolute -inset-4 bg-gradient-to-r from-[#ff424c] to-[#d1d5db] rounded-full blur-2xl opacity-20 animate-pulse"
                    ></div>
                    <div
                        class="relative bg-[#1e1e1e] border-2 border-[#ff424c]/30 p-6 rounded-2xl shadow-2xl"
                    >
                        <div
                            class="flex flex-col items-center gap-1 font-pixel"
                        >
                            <span
                                class="text-[#ff424c] text-2xl tracking-tighter drop-shadow-[0_0_8px_#ff424c]"
                                >VIBE</span
                            >
                            <span
                                class="text-[#d1d5db] text-2xl tracking-tighter drop-shadow-[0_0_8px_#d1d5db]"
                                >MATRIX</span
                            >
                        </div>
                    </div>
                </div>

                <div class="max-w-md space-y-4">
                    <h2
                        class="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter italic"
                    >
                        Premium Access Required
                    </h2>
                    <p
                        class="text-white/60 text-sm md:text-base leading-relaxed uppercase font-pixel tracking-wide"
                    >
                        Unlock the absolute pinnacle of vibe discovery. Our
                        advanced matrix algorithm uses tertiary jaccard
                        similarity and cross-genre predictive flow to map your
                        sonic identity.
                    </p>
                </div>

                <div class="flex flex-col gap-4 w-full max-w-xs">
                    <a
                        href="/store"
                        class="w-full font-pixel text-center inline-block text-white bg-[#ff424c] font-bold px-8 py-4 rounded-xl shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] hover:shadow-[8px_8px_0px_0px_rgba(255,66,76,0.4)] hover:-translate-y-1 active:translate-y-0 transition-all uppercase tracking-widest text-sm"
                    >
                        Visit Smol Mart (250k Kale)
                    </a>
                </div>
            </div>
        {/if}

        {#if (isMobile && activeTab === "results") || !isMobile}
            {#if selectedTags.length > 0 && isUnlocked("vibeMatrix")}
                <div
                    class="h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-500 {isMobile &&
                    activeTab !== 'results'
                        ? 'hidden'
                        : ''}"
                >
                    <div
                        class="shrink-0 flex flex-col p-6 pb-2 border-b border-white/5 gap-4"
                    >
                        <div class="flex items-center justify-between w-full">
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-2 h-6 bg-[#ff424c] rounded-full shadow-[0_0_10px_rgba(255,66,76,0.5)]"
                                ></div>
                                <h3
                                    class="text-sm font-black tracking-[0.3em] text-white uppercase"
                                >
                                    Vibe Matrix
                                </h3>
                            </div>

                            <!-- Header Controls (Desktop/Mobile unified) -->
                            <div class="flex items-center gap-4">
                                {#if audioState.currentSong}
                                    <div
                                        class="flex items-center gap-2 bg-[#1e1e1e]/40 px-3 py-1 rounded-full border border-white/10"
                                    >
                                        <button
                                            class="text-white/40 hover:text-[#ff424c] transition-colors"
                                            onclick={songPrev}
                                            title="Previous"
                                        >
                                            <svg
                                                class="size-4"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    d="M6 6h2v12H6zm3.5 6 8.5 6V6z"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            class="text-[#ff424c] hover:scale-110 transition-transform"
                                            onclick={togglePlayPause}
                                            title={isPlaying()
                                                ? "Pause"
                                                : "Play"}
                                        >
                                            {#if isPlaying()}
                                                <svg
                                                    class="size-5"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"
                                                    />
                                                </svg>
                                            {:else}
                                                <svg
                                                    class="size-5"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            {/if}
                                        </button>
                                        <button
                                            class="text-white/40 hover:text-[#9ae600] transition-colors"
                                            onclick={songNext}
                                            title="Next"
                                        >
                                            <svg
                                                class="size-4"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    d="m6 18 8.5-6L6 6zM16 6h2v12h-2z"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                {/if}

                                <div class="hidden md:flex items-center gap-2">
                                    <span
                                        class="text-[10px] font-pixel text-white/30"
                                    >
                                        {filteredSmols.length} MATCHES
                                    </span>
                                </div>

                                <button
                                    class="text-[10px] font-black tracking-widest text-white/40 hover:text-[#ff424c] transition-colors uppercase border border-white/10 px-3 py-1 rounded-md hover:border-[#ff424c]/30"
                                    onclick={() => (selectedTags = [])}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>

                        <!-- Matrix Clusters -->
                        {#if recommendationClusters.related.length > 0 || recommendationClusters.tertiary.length > 0}
                            <div
                                class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mt-2 p-4 bg-black/40 rounded-2xl border border-white/5 animate-in fade-in slide-in-from-top-2 duration-700"
                            >
                                <!-- Direct Neighbors (Related Vibes) -->
                                {#if recommendationClusters.related.length > 0}
                                    <div class="space-y-3">
                                        <div
                                            class="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black text-[#9ae600]/80 px-1"
                                        >
                                            <div
                                                class="w-1.5 h-1.5 rounded-full bg-[#ff424c] animate-pulse"
                                            ></div>
                                            Related Vibes
                                        </div>
                                        <div class="flex flex-wrap gap-1.5">
                                            {#each recommendationClusters.related.slice(0, 12) as rec}
                                                <button
                                                    onclick={() =>
                                                        pivotTag(rec.display)}
                                                    class="px-3 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-[#ff424c]/40 hover:bg-[#ff424c]/10 text-white/50 hover:text-[#ff424c] text-xs transition-all duration-300 transform hover:-translate-y-0.5"
                                                >
                                                    {rec.display}
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}

                                <!-- 2-Hop neighbors (Deep Cuts) -->
                                {#if recommendationClusters.tertiary.length > 0}
                                    <div class="space-y-3">
                                        <div
                                            class="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black text-[#d1d5db]/80 px-1"
                                        >
                                            <div
                                                class="w-1.5 h-1.5 rounded-full bg-[#d1d5db] animate-pulse"
                                            ></div>
                                            Discovery (Deep Cuts)
                                        </div>
                                        <div class="flex flex-wrap gap-1.5">
                                            {#each recommendationClusters.tertiary.slice(0, 12) as rec}
                                                <button
                                                    onclick={() =>
                                                        pivotTag(rec.display)}
                                                    class="px-3 py-1 rounded-lg bg-white/5 border border-white/10 hover:border-[#d1d5db]/40 hover:bg-[#d1d5db]/10 text-white/50 hover:text-[#d1d5db] text-xs transition-all duration-300 transform hover:-translate-y-0.5"
                                                >
                                                    {rec.display}
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <div
                        class="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-6 pt-0"
                    >
                        <div class="pt-6">
                            <div
                                class="pt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-20 max-w-full overflow-x-hidden"
                            >
                                {#each filteredSmols as song (song.Id)}
                                    <div
                                        role="button"
                                        tabindex="0"
                                        id="song-{song.Id}"
                                        in:fade={{ duration: 200 }}
                                        class="flex flex-col gap-2 group text-left w-full relative min-w-0"
                                        onclick={() => {
                                            if (
                                                audioState.currentSong?.Id ===
                                                song.Id
                                            ) {
                                                togglePlayPause();
                                            } else {
                                                selectSong(song);
                                            }
                                        }}
                                    >
                                        {#if audioState.currentSong?.Id === song.Id}
                                            <!-- Outer Ambient Glow -->
                                            <div
                                                class="absolute -inset-2 rounded-2xl blur-xl transition-opacity duration-500 animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,#ff424c,#d1d5db,#ff424c,#d1d5db)] {isPlaying()
                                                    ? 'opacity-50'
                                                    : 'opacity-30'}"
                                            ></div>
                                        {/if}

                                        <!-- Main Container (Defines Shape) -->
                                        <div
                                            class="aspect-square rounded-xl relative overflow-hidden z-10 shadow-2xl"
                                        >
                                            {#if audioState.currentSong?.Id === song.Id}
                                                <!-- Spinning Lightwire Background for Border -->
                                                <div
                                                    class="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#ff424c,#d1d5db,#ff424c,#d1d5db)] transition-opacity duration-500 animate-[spin_4s_linear_infinite] {isPlaying()
                                                        ? 'opacity-100'
                                                        : 'opacity-50'}"
                                                ></div>
                                            {/if}

                                            <!-- Content Mask (Inset to reveal wire) -->
                                            <div
                                                class="absolute bg-[#1e1e1e] overflow-hidden transition-all duration-300 {audioState
                                                    .currentSong?.Id === song.Id
                                                    ? 'inset-[2px] rounded-[10px]'
                                                    : 'inset-0 rounded-xl border border-white/10 group-hover:border-[#ff424c]/50'}"
                                            >
                                                <img
                                                    src="{API_URL}/image/{song.Id}.png?scale=8"
                                                    alt={song.Title}
                                                    class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                    loading="lazy"
                                                />
                                                {#if audioState.currentSong?.Id === song.Id}
                                                    <div
                                                        class="absolute inset-0 flex items-center justify-center z-10"
                                                    >
                                                        <div
                                                            class="w-full h-full"
                                                        >
                                                            <MiniVisualizer />
                                                        </div>
                                                    </div>

                                                    <!-- Bottom Left: Like Button -->
                                                    <div
                                                        class="absolute bottom-2 left-2 z-20"
                                                        onclick={(e) =>
                                                            e.stopPropagation()}
                                                    >
                                                        <LikeButton
                                                            smolId={song.Id}
                                                            liked={song.Liked}
                                                            classNames="p-1.5 rounded-full bg-black/40 backdrop-blur-md border border-[#FF424C]/50 text-[#FF424C] hover:bg-[#FF424C]/20 transition-all shadow-[0_0_10px_rgba(255,66,76,0.3)] active:scale-95 hover:shadow-[0_0_15px_rgba(255,66,76,0.5)]"
                                                            iconSize="size-4"
                                                        />
                                                    </div>

                                                    <!-- Center: Artist Profile Button -->
                                                    {#if song.Address || song.Creator}
                                                        <a
                                                            href={`/artist/${song.Address || song.Creator}`}
                                                            class="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-[#d1d5db]/50 text-[#d1d5db] hover:bg-[#d1d5db]/20 transition-all shadow-[0_0_10px_rgba(209,213,219,0.3)] active:scale-95 hover:shadow-[0_0_15px_rgba(209,213,219,0.5)]"
                                                            onclick={(e) =>
                                                                e.stopPropagation()}
                                                            title="View Artist"
                                                        >
                                                            <svg
                                                                class="w-4 h-4"
                                                                fill="currentColor"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <path
                                                                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                                                                />
                                                            </svg>
                                                        </a>
                                                    {/if}

                                                    <!-- Bottom Right: Song Detail -->
                                                    <div
                                                        role="button"
                                                        tabindex="0"
                                                        class="absolute bottom-2 right-2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md border border-[#d836ff]/50 text-[#d836ff] hover:bg-[#d836ff]/20 transition-all shadow-[0_0_10px_rgba(216,54,255,0.3)] active:scale-95 hover:shadow-[0_0_15px_rgba(216,54,255,0.5)] cursor-pointer"
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(
                                                                `/${song.Id}?from=tags`,
                                                            );
                                                        }}
                                                        onkeydown={(e) => {
                                                            if (
                                                                e.key ===
                                                                "Enter"
                                                            ) {
                                                                e.stopPropagation();
                                                                navigate(
                                                                    `/${song.Id}?from=tags`,
                                                                );
                                                            }
                                                        }}
                                                        title="View Song Details"
                                                    >
                                                        <svg
                                                            class="w-4 h-4"
                                                            fill="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path
                                                                d="M21 3v12.5a3.5 3.5 0 1 1-2-3.163V5.44L9 7.557v9.943a3.5 3.5 0 1 1-2-3.163V5l14-2z"
                                                            />
                                                        </svg>
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                        <span
                                            class="text-[9px] font-pixel text-white/60 truncate group-hover:text-white transition-colors"
                                            >{song.Title || "Untitled"}</span
                                        >
                                    </div>
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>
            {:else}
                <div
                    class="h-full flex items-center justify-center animate-pulse border-2 border-white/5 rounded-3xl bg-white/[0.02]"
                >
                    <div
                        class="text-white/10 font-pixel text-xs tracking-[0.4em] uppercase"
                    >
                        Select a vibe to explore the matrix
                    </div>
                </div>
            {/if}
        {/if}
    </div>
</div>

<style>
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 66, 76, 0.2);
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 66, 76, 0.4);
    }
</style>
