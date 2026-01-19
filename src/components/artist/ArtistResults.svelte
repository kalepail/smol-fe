<script lang="ts">
    import { onMount, untrack, tick } from "svelte";
    import type { Smol } from "../../types/domain";
    import {
        audioState,
        selectSong,
        registerSongNextCallback,
        isPlaying,
        togglePlayPause,
    } from "../../stores/audio.svelte";
    import { navigate } from "astro:transitions/client";
    import RadioPlayer from "../radio/RadioPlayer.svelte";
    import { isAuthenticated, userState } from "../../stores/user.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import { useSmolMinting } from "../../hooks/useSmolMinting";
    import TokenBalancePill from "../ui/TokenBalancePill.svelte";
    import MintTradeModal from "../MintTradeModal.svelte";
    import { getTokenBalance } from "../../utils/balance";
    import TipArtistModal from "./TipArtistModal.svelte";
    import { sac } from "../../utils/passkey-kit";
    import { safeFetchSmols } from "../../services/api/smols";
    import { fly, fade, scale } from "svelte/transition";
    import CastButton from "../ui/CastButton.svelte";
    import MiniVisualizer from "../ui/MiniVisualizer.svelte";
    import { flip } from "svelte/animate";
    import { backOut } from "svelte/easing";
    import { RPC_URL } from "../../utils/rpc";

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
    const isBrowser = typeof window !== "undefined";

    let {
        discography = [],
        minted = [],
        collected = [],
        address,
        publishedCount = 0,
        collectedCount = 0,
        mintedCount = 0,
        topTags = [],
        shuffle = false,
        seed = null,
    }: {
        discography?: Smol[];
        minted?: Smol[];
        collected?: Smol[];
        address: string;
        publishedCount?: number;
        collectedCount?: number;
        mintedCount?: number;
        topTags?: string[];
        shuffle?: boolean;
        seed?: number | null;
    } = $props();

    // Reactive state for hydration (starts with props, updates with live data)
    let liveDiscography = $state<Smol[]>(discography);
    let liveMinted = $state<Smol[]>(minted);
    // Collected stays as snapshot for now since API lacks Minted_By support
    let liveCollected = $state<Smol[]>(collected);
    let isLoadingLive = $state(false);
    let lastHydratedAddress = $state("");
    let livePublishedCount = $state(publishedCount);
    let liveCollectedCount = $state(collectedCount);
    let liveMintedCount = $state(mintedCount);
    let liveTopTags = $state<string[]>(topTags);

    // OOM FIX: If no props provided (SSR mode), fetch on mount
    onMount(async () => {
        if (liveDiscography.length === 0 && address) {
            const normalizedAddress = address.toLowerCase();
            isLoadingLive = true;
            try {
                const smols = await safeFetchSmols();

                // Discography: Songs created or published by this artist
                const disco = smols.filter(
                    (s) =>
                        s.Address?.toLowerCase() === normalizedAddress ||
                        s.Creator?.toLowerCase() === normalizedAddress,
                );
                disco.sort(
                    (a, b) =>
                        new Date(b.Created_At || 0).getTime() -
                        new Date(a.Created_At || 0).getTime(),
                );
                liveDiscography = disco;
                livePublishedCount = disco.length;

                // Minted: Created by them AND has been minted
                liveMinted = disco.filter((s) => s.Mint_Token !== null);
                liveMintedCount = liveMinted.length;

                // Collected: Minted by this artist but NOT created by them
                const collectedItems = smols.filter(
                    (s) =>
                        s.Minted_By?.toLowerCase() === normalizedAddress &&
                        s.Address?.toLowerCase() !== normalizedAddress &&
                        s.Creator?.toLowerCase() !== normalizedAddress,
                );
                collectedItems.sort(
                    (a, b) =>
                        new Date(b.Created_At || 0).getTime() -
                        new Date(a.Created_At || 0).getTime(),
                );
                liveCollected = collectedItems;
                liveCollectedCount = collectedItems.length;

                // Top Tags
                const tagCounts: Record<string, number> = {};
                disco.forEach((smol) => {
                    if (smol.Tags && Array.isArray(smol.Tags)) {
                        smol.Tags.forEach((tag) => {
                            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                        });
                    }
                });
                liveTopTags = Object.entries(tagCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map((t) => t[0]);

                // Data loaded successfully
            } catch (e) {
                console.error("[ArtistResults] Failed to load data:", e);
            } finally {
                isLoadingLive = false;
            }
        }
    });

    let activeModule = $state<"discography" | "minted" | "collected" | "tags">(
        "discography",
    );
    let selectedArtistTags = $state<string[]>([]);
    let shuffleEnabled = $state(shuffle);
    let currentIndex = $state(0);
    let minting = $state(false);
    let showTradeModal = $state(false);
    let tradeMintBalance = $state(0n);
    let showGridView = $state(true);
    let tagsExpanded = $state(false); // Collapsible tags section
    let sortMode = $state<"latest" | "canon" | "shuffle">("latest");
    let showSortDropdown = $state(false);
    let showTipModal = $state(false);
    let tipArtistAddress = $state<string | null>(null);
    let selectedVersionId = $state<string | null>(null);
    let isGeneratingMix = $state(false);
    let initialPlayHandled = $state(false);
    let isUrlStateLoaded = $state(false);
    let initialScrollHandled = $state(false);
    let deepLinkHandled = $state(false);

    // --- Deep Linking & Hydration Logic ---
    // The previous deep link handler was removed as per instructions.
    // The new deepLinkHandled variable is now a local variable within the new $effect.

    $effect(() => {
        // Wait for hydration
        if (typeof window === "undefined") return;
        if (deepLinkHandled) return;
        if (
            liveDiscography.length === 0 &&
            liveMinted.length === 0 &&
            liveCollected.length === 0
        )
            return; // Wait for ANY data source

        const params = new URLSearchParams(window.location.search);
        const playId = params.get("play");
        const shouldGrid = params.get("grid") === "true";

        if (playId) {
            // Find song in any active list
            const allSongs = [
                ...liveDiscography,
                ...liveMinted,
                ...liveCollected,
            ];
            const songToPlay = allSongs.find((s) => s.Id === playId);

            if (songToPlay) {
                console.log(
                    "[DeepLink] Found song, handling:",
                    songToPlay.Title,
                );
                deepLinkHandled = true;

                // 1. Set View Mode
                if (shouldGrid) {
                    showGridView = true;
                }

                // 2. Select & Play (Async to allow UI update)
                // We use a slight timeout to let Svelte flush the view state change
                setTimeout(async () => {
                    // Select song (updates store)
                    selectSong(songToPlay);

                    // Force Autoplay attempt (Browser policy permitting)
                    if (
                        audioState.audioElement &&
                        audioState.audioElement.paused
                    ) {
                        try {
                            await audioState.audioElement.play();
                        } catch (e) {
                            console.warn("[DeepLink] Autoplay blocked:", e);
                        }
                    }

                    // 3. Selection handles the rest via reactive effects
                }, 50);
            }
        }
    });

    // Time Machine Clock State
    let timeString = $state("");

    onMount(() => {
        // Start Clock
        timeString = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        const interval = setInterval(() => {
            timeString = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        }, 1000);

        return () => clearInterval(interval);
    });
    let shuffleSeed = $state(seed ?? Date.now());
    let collageImages = $state<string[]>([]);
    let searchQuery = $state("");
    let isSearchingMobile = $state(false);
    let showSearchMenu = $state(false);

    // Artist badge state (fetched from API, NOT viewer's localStorage)
    let artistBadges = $state<{ premiumHeader: boolean; goldenKale: boolean }>({
        premiumHeader: false,
        goldenKale: false,
    });

    // Fetch artist's badges from API on mount (with static fallback)
    $effect(() => {
        if (!isBrowser || !address) return;
        fetch(`/api/artist/badges/${address}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) {
                    artistBadges = data;
                }
                // No fallback for other artists - we can't know their status without API
            })
            .catch(() => {
                /* API unavailable - badges stay default (false) */
            });
    });

    $effect(() => {
        if (liveDiscography.length > 0 && collageImages.length === 0) {
            const base = liveDiscography
                .filter((s) => s.Id)
                .map((s) => `${API_URL}/image/${s.Id}.png?scale=16`)
                .sort(() => Math.random() - 0.5)
                .slice(0, 40);
            collageImages = [...base, ...base];
        }
    });

    // Deterministic Hash for Seeded Shuffle (Stable Random)
    function getShuffleVal(id: string, seed: number) {
        let h = 0xdeadbeef;
        for (let i = 0; i < id.length; i++)
            h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
        h = Math.imul(h ^ seed, 1597334677);
        return (h >>> 0) / 4294967296;
    }

    // Initial mount: Check for ?play param AND restore state from URL
    onMount(() => {
        if (initialPlayHandled || !isBrowser) return;

        const urlParams = new URLSearchParams(window.location.search);

        // Restore State (Tab, Tags, Shuffle)
        const tabParam = urlParams.get("tab");
        if (
            tabParam &&
            ["discography", "minted", "collected", "tags"].includes(tabParam)
        ) {
            activeModule = tabParam as any;
        }

        const tagsParam = urlParams.get("tags");
        if (tagsParam) {
            selectedArtistTags = tagsParam.split(",").filter(Boolean);
        }

        const shuffleParam = urlParams.get("shuffle");
        if (shuffleParam === "true") {
            shuffleEnabled = true;
        }

        const seedParam = urlParams.get("seed");
        if (seedParam) {
            shuffleSeed = parseInt(seedParam, 10);
        }

        const gridParam = urlParams.get("grid");
        if (gridParam === "true") {
            showGridView = true;
        }

        // Handle Auto-Play (?play=id)
        const playId = urlParams.get("play");
        if (playId && discography.length > 0) {
            const songIndex = discography.findIndex((s) => s.Id === playId);
            if (songIndex >= 0) {
                currentIndex = songIndex;
                if (currentSong?.Id !== playId) {
                    selectSong(discography[songIndex]);
                }
                // User Request: Deep links should default to Grid View
                showGridView = true;

                // Ensure we scroll to it after grid renders
                setTimeout(() => {
                    const el = document.getElementById(`song-${playId}`);
                    if (el)
                        el.scrollIntoView({
                            block: "center",
                            behavior: "smooth",
                        });
                }, 100);
            }
        } else if (discography.length > 0) {
            // If NO play param:
            // Check if we are already playing a song from this artist (Seamless Return)
            const playingId = currentSong?.Id;

            if (playingId) {
                // Determine what the playlist WILL look like after hydration
                let targetList = [...discography];
                if (activeModule === "minted") targetList = [...minted];
                if (activeModule === "collected") targetList = [...collected];

                // Apply Tag Filter
                if (selectedArtistTags.length > 0) {
                    targetList = targetList.filter((s) =>
                        selectedArtistTags.some((t) => s.Tags?.includes(t)),
                    );
                }

                // Apply Shuffle
                if (shuffleEnabled) {
                    targetList.sort(
                        (a, b) =>
                            getShuffleVal(a.Id, shuffleSeed) -
                            getShuffleVal(b.Id, shuffleSeed),
                    );
                }

                const matchIndex = targetList.findIndex(
                    (s) => s.Id === playingId,
                );

                if (matchIndex >= 0) {
                    // Seamless return detected - sync index
                    currentIndex = matchIndex;
                } else {
                    // Song not in current view? Select first of view if exists
                    if (targetList.length > 0) {
                        selectSong(targetList[0]);
                        currentIndex = 0;
                    } else {
                        selectSong(discography[0]); // Fallback
                    }
                }
            } else {
                // Not playing anything? Standard start.
                selectSong(discography[0]);
            }
        }

        isUrlStateLoaded = true;
        initialPlayHandled = true;
    });

    // Valid tabs for type safety
    const VALID_TABS = ["discography", "minted", "collected", "tags"];

    // Sync State to URL (Seamless Back Button Support)
    $effect(() => {
        if (!isUrlStateLoaded || typeof window === "undefined") return;

        const url = new URL(window.location.href);
        const params = url.searchParams;

        // Sync Tab
        if (
            activeModule !== "discography" &&
            VALID_TABS.includes(activeModule)
        ) {
            params.set("tab", activeModule);
        } else {
            params.delete("tab");
        }

        // Sync Tags
        if (selectedArtistTags.length > 0) {
            params.set("tags", selectedArtistTags.join(","));
        } else {
            params.delete("tags");
        }

        // Sync Shuffle
        if (shuffleEnabled) {
            params.set("shuffle", "true");
            params.set("seed", shuffleSeed.toString());
        } else {
            params.delete("shuffle");
        }

        // Sync Grid Mode
        if (showGridView) {
            params.set("grid", "true");
        } else {
            params.delete("grid");
        }

        // Sync Play Param (Reflect current song)
        if (currentSong?.Id) {
            params.set("play", currentSong.Id);
        } else {
            params.delete("play");
        }

        // Preserve 'from' if it exists

        window.history.replaceState(history.state, "", url.toString());
    });

    // Auto-Scroll to Active Song on Mount
    $effect(() => {
        if (
            !isBrowser ||
            initialScrollHandled ||
            !isUrlStateLoaded ||
            !currentSong ||
            displayPlaylist.length === 0 ||
            isLoadingLive
        )
            return;
        const el = document.getElementById(`song-row-${currentSong.Id}`);
        if (el) {
            // Determine if song is in view or needs scrolling
            // We use 'center' to make it obvious
            el.scrollIntoView({ block: "center", behavior: "smooth" });
            initialScrollHandled = true;
        }
    });

    const playlistTitle = $derived.by(() => {
        if (selectedArtistTags.length > 0) {
            return `${selectedArtistTags.join(", ")} VIBES`;
        }
        return activeModule.charAt(0).toUpperCase() + activeModule.slice(1);
    });

    const mintingHook = useSmolMinting();
    const currentSong = $derived(audioState.currentSong);

    const isMinted = $derived(
        Boolean(currentSong?.Mint_Token && currentSong?.Mint_Amm),
    );

    // V1/V2 version toggle
    const versions = $derived.by(() => {
        if (!currentSong?.kv_do?.songs) return [];
        return currentSong.kv_do.songs.map((s: any, i: number) => ({
            id: s.music_id,
            label: `V${i + 1}`,
            isBest: s.music_id === currentSong.Song_1,
        }));
    });

    // Reset version when song changes
    $effect(() => {
        if (currentSong?.Id) {
            selectedVersionId = currentSong.Song_1 || null;
        }
    });

    $effect(() => {
        if (currentSong?.Mint_Token && userState.contractId) {
            getTokenBalance(
                sac.get().getSACClient(currentSong.Mint_Token),
                userState.contractId,
            ).then((b) => {
                tradeMintBalance = b;
            });
        }
    });

    // Hydrate with live data on mount or address change
    // Hydrate with live data on mount or address change
    $effect(() => {
        if (address) {
            const normalizedAddress = address.toLowerCase();
            if (normalizedAddress !== lastHydratedAddress) {
                lastHydratedAddress = normalizedAddress;
                hydrateArtistData(normalizedAddress);
            }
        }
    });

    async function hydrateArtistData(addr: string) {
        if (isLoadingLive) return;
        isLoadingLive = true;

        try {
            // Fetch ALL smols (Hybrid: Live + Snapshot + Deep Verification)
            // We fetch the global list and filter client-side to ensure we get hydrated tags
            const allSmols = await safeFetchSmols();

            // Filter for THIS artist
            const artistSmols = allSmols.filter(
                (s) =>
                    s.Address?.toLowerCase() === addr ||
                    s.Creator?.toLowerCase() === addr,
            );

            if (artistSmols.length > 0) {
                // Sort by date desc
                artistSmols.sort(
                    (a, b) =>
                        new Date(b.Created_At || 0).getTime() -
                        new Date(a.Created_At || 0).getTime(),
                );

                liveDiscography = artistSmols;

                // Re-calculate minted from live data
                liveMinted = artistSmols.filter((s) => s.Mint_Token !== null);
            }
        } catch (e) {
            console.error("[ArtistResults] Failed to hydrate live data:", e);
            // Fallback: silently fail and keep using snapshot data (props)
        } finally {
            isLoadingLive = false;
        }
    }

    // Aggregate tags based on CURRENT view (Discography, Minted, Collected)
    const currentTabSongs = $derived.by(() => {
        if (activeModule === "minted") return liveMinted;
        if (activeModule === "collected") return liveCollected;
        return liveDiscography;
    });

    const artistTags = $derived.by(() => {
        const counts: Record<string, number> = {};
        for (const smol of currentTabSongs) {
            if (!smol.Tags) continue;
            for (const tag of smol.Tags) {
                counts[tag] = (counts[tag] || 0) + 1;
            }
        }
        return Object.entries(counts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
    });

    const maxTagCount = $derived(
        artistTags.length > 0 ? Math.max(...artistTags.map((t) => t.count)) : 1,
    );

    function toggleArtistTag(tag: string) {
        if (selectedArtistTags.includes(tag)) {
            selectedArtistTags = selectedArtistTags.filter((t) => t !== tag);
        } else {
            selectedArtistTags = [...selectedArtistTags, tag];
        }
    }

    async function generateArtistMix() {
        if (isGeneratingMix || basePlaylist.length === 0) return;

        isGeneratingMix = true;

        shuffleEnabled = true;
        sortMode = "shuffle";
        shuffleSeed = Date.now();

        // Wait for shuffledOrder to update via effect
        await tick();

        isGeneratingMix = false;

        // Auto-play logic: if nothing is playing OR if the current song is not in the active tab
        if (shuffledOrder.length > 0) {
            const isPlayingInThisTab = basePlaylist.some(
                (s) => s.Id === currentSong?.Id,
            );

            if (!currentSong || !isPlayingInThisTab) {
                // Select a random song from the new shuffled list
                const nextIdx = Math.floor(
                    Math.random() * shuffledOrder.length,
                );
                currentIndex = nextIdx;
                selectSong(shuffledOrder[nextIdx]);
            }
        }

        // Keep current view state
        // activeModule and showGridView should persist
    }

    // Auto-scroll to current song when Grid View opens or Sort/Tab changes
    // We untrack everything except the core UI triggers to prevent "snapping" while scrolling
    $effect(() => {
        // Triggers: Opening grid, changing sort, or changing tabs
        const _ = showGridView;
        const __ = sortMode;
        const ___ = activeModule;

        if (!isBrowser || !showGridView) return;

        untrack(() => {
            if (!currentSong) return;
            const songId = currentSong.Id;
            const songIndex = displayPlaylist.findIndex((s) => s.Id === songId);

            if (songIndex === -1) return;

            // Expand limit if the song is currently hidden by pagination
            if (songIndex >= gridLimit) {
                gridLimit = songIndex + 50;
            }

            // Perform the actual scroll
            tick().then(() => {
                setTimeout(() => {
                    const el = document.getElementById(`song-${songId}`);
                    if (el) {
                        el.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                        });
                    }
                }, 100);
            });
        });
    });

    // Derived playlist based on module and shuffle
    const basePlaylist = $derived.by(() => {
        let source = [...liveDiscography];
        if (activeModule === "minted") source = [...liveMinted];
        if (activeModule === "collected") source = [...liveCollected];

        // Filter by Search Query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            source = source.filter((smol) =>
                smol.Title?.toLowerCase().includes(query),
            );
        }

        // Filter by Tags if any
        if (selectedArtistTags.length > 0) {
            source = source.filter((smol) =>
                selectedArtistTags.some((t) => smol.Tags?.includes(t)),
            );
        }

        // Apply Sorting
        if (sortMode === "canon") {
            // Oldest to Newest
            source.sort((a, b) => {
                const dateA = a.Created_At
                    ? new Date(a.Created_At).getTime()
                    : 0;
                const dateB = b.Created_At
                    ? new Date(b.Created_At).getTime()
                    : 0;
                return dateA - dateB;
            });
        } else if (sortMode === "latest") {
            // Newest to Oldest (Standard)
            source.sort((a, b) => {
                const dateA = a.Created_At
                    ? new Date(a.Created_At).getTime()
                    : 0;
                const dateB = b.Created_At
                    ? new Date(b.Created_At).getTime()
                    : 0;
                return dateB - dateA;
            });
        }

        return source;
    });

    // Handle sortMode changes
    $effect(() => {
        if (sortMode === "shuffle") {
            shuffleEnabled = true;
            shuffleSeed = Date.now();
            // Reset sortMode back to latest/canon?
            // Better to keep it on shuffle and just let the shuffle effect handle it.
        } else {
            shuffleEnabled = false;
        }
    });

    // Helper to toggle sort modes
    function cycleSortMode() {
        if (sortMode === "latest") sortMode = "canon";
        else if (sortMode === "canon") sortMode = "shuffle";
        else sortMode = "latest";
    }

    // Store the shuffled order separately to avoid re-shuffling on every render
    let shuffledOrder = $state<Smol[]>([]);

    // When base playlist changes, reset shuffled order
    $effect(() => {
        // Only update shuffle order when base changes or seed/shuffle changes
        if (basePlaylist.length > 0 && (shuffleEnabled || shuffleSeed)) {
            const playing = untrack(() => currentSong);
            const currentDisp = untrack(() => displayPlaylist);
            let target = untrack(() => currentIndex);

            // Robust target capture: find where it actually is in the grid right now
            if (playing && currentDisp.length > 0) {
                const actualIdx = currentDisp.findIndex(
                    (s) => s.Id === playing.Id,
                );
                if (actualIdx !== -1) target = actualIdx;
            }

            let listToShuffle = [...basePlaylist];

            if (playing) {
                const matchIndex = listToShuffle.findIndex(
                    (s) => s.Id === playing.Id,
                );

                if (matchIndex !== -1) {
                    const [song] = listToShuffle.splice(matchIndex, 1);

                    // Shuffle the remaining pool
                    listToShuffle.sort(
                        (a, b) =>
                            getShuffleVal(a.Id, shuffleSeed) -
                            getShuffleVal(b.Id, shuffleSeed),
                    );

                    if (
                        showGridView &&
                        target >= 0 &&
                        target <= listToShuffle.length
                    ) {
                        listToShuffle.splice(target, 0, song);
                        shuffledOrder = listToShuffle;
                    } else {
                        shuffledOrder = [song, ...listToShuffle];
                    }
                    return;
                }
            }

            // Regular shuffle - no song pinned
            // Default shuffle if no song playing or not found
            listToShuffle.sort(
                (a, b) =>
                    getShuffleVal(a.Id, shuffleSeed) -
                    getShuffleVal(b.Id, shuffleSeed),
            );
            shuffledOrder = listToShuffle;
        }
    });

    // Pagination for Grid View to prevent OOM/Layout thrashing on mobile
    let gridLimit = $state(50);

    // Derived display playlist (no random calls here = stable)
    const displayPlaylist = $derived.by(() => {
        if (shuffleEnabled && shuffledOrder.length > 0) {
            return shuffledOrder;
        }
        return basePlaylist;
    });

    const visiblePlaylist = $derived(displayPlaylist.slice(0, gridLimit));

    // OPTIMIZED: Rolling Buffer Preloading
    // 1. Fixes Cache Miss: Now uses ?scale=8 to match Grid View (rendered as HD pixel art)
    // 2. Rolling Window: Preloads the current grid + 50 items ahead to maintain "Hardware Feel" without downloading 500+ items at once.
    $effect(() => {
        if (!isBrowser || !displayPlaylist || displayPlaylist.length === 0)
            return;

        // Debounce to avoid thrashing on rapid scroll
        const timeout = setTimeout(() => {
            // Buffer: Load everything currently visible + 50 ahead
            const PRELOAD_BUFFER = 50;
            const targetIndex = Math.min(
                displayPlaylist.length,
                gridLimit + PRELOAD_BUFFER,
            );

            // We only need to trigger loads for the "new" potential items
            // But since browser handles deduping cached requests, iterating the slice is fine.
            const batch = displayPlaylist.slice(0, targetIndex);

            batch.forEach((song) => {
                const img = new Image();
                // CRITICAL: Must match Grid View src exactly for cache hit
                img.src = `${API_URL}/image/${song.Id}.png?scale=8`;
            });
        }, 500);

        return () => clearTimeout(timeout);
    });

    // Reset pagination when playlist changes (but ensure current song stays visible)
    $effect(() => {
        // Trigger on displayPlaylist change
        if (displayPlaylist) {
            // Use untrack to read currentSong without making it a dependency
            const songId = untrack(() => currentSong?.Id);
            const currentSongIndex = songId
                ? displayPlaylist.findIndex((s) => s.Id === songId)
                : -1;

            // If current song exists and is beyond index 50, keep it visible
            if (currentSongIndex !== -1 && currentSongIndex >= 50) {
                gridLimit = Math.max(50, currentSongIndex + 50);
            } else {
                gridLimit = 50;
            }
        }
    });

    function handleGridScroll(e: any) {
        const el = e.currentTarget as HTMLElement;
        const { scrollTop, scrollHeight, clientHeight } = el;
        // Load more when within 800px of bottom
        if (scrollHeight - scrollTop - clientHeight < 800) {
            if (gridLimit < displayPlaylist.length) {
                // Throttle? Svelte updates are fast enough usually, but let's be safe
                gridLimit += 50;
            }
        }
    }

    // Playlist Sync: Find current song in new playlist when tab/filter changes
    // Playlist Sync: Find current song in new playlist when tab/filter changes
    // FIX: Added lastScrolledSongId to prevent aggressive snapping when user scrolls
    let lastScrolledSongId = $state("");

    $effect(() => {
        if (!isBrowser || displayPlaylist.length === 0 || !currentSong) return;

        // Reset scroll tracker if playlist changes drastically (optional, but good for safety)

        if (displayPlaylist.length > 0 && currentSong) {
            const foundIndex = displayPlaylist.findIndex(
                (s) => s.Id === currentSong.Id,
            );

            // Always sync index if found
            if (foundIndex !== -1 && foundIndex !== currentIndex) {
                // Sync playlist index
                currentIndex = foundIndex;
            }

            // ONLY scroll if the song ID has changed since we last scrolled matched
            if (foundIndex !== -1 && currentSong.Id !== lastScrolledSongId) {
                lastScrolledSongId = currentSong.Id;

                // Wait for the fly transition (delay: 100 + duration: 600 slightly overlapping)
                setTimeout(() => {
                    // Fix: Dynamic ID based on view mode
                    const elementId = showGridView
                        ? `song-${currentSong.Id}`
                        : `song-row-${currentSong.Id}`;

                    const el = document.getElementById(elementId);
                    if (el) {
                        el.scrollIntoView({
                            block: "center",
                            behavior: "smooth",
                        });
                    }
                }, 250);
            }
        }
    });

    // Reset playback on address change
    let lastAddress = $state(address);
    $effect(() => {
        if (address !== lastAddress) {
            lastAddress = address;
            currentIndex = 0;
            activeModule = "discography";
            shuffleEnabled = false;
            selectedArtistTags = [];

            // Optimization: Reset live state to props immediately while fetching
            liveDiscography = discography;
            liveMinted = minted;
            liveCollected = collected;

            // Auto-play: Check for ?play param first (continuing from /[id] page)
            let playedFromParam = false;
            if (isBrowser) {
                const urlParams = new URLSearchParams(window.location.search);
                const playId = urlParams.get("play");
                if (playId) {
                    const songIndex = discography.findIndex(
                        (s) => s.Id === playId,
                    );
                    if (songIndex >= 0) {
                        currentIndex = songIndex;
                        selectSong(discography[songIndex]);
                        playedFromParam = true;
                        // Clean up URL without reload
                        window.history.replaceState(
                            {},
                            "",
                            window.location.pathname,
                        );
                    }
                }
            }
            // Fallback: play first song if no ?play param
            if (!playedFromParam && discography.length > 0) {
                selectSong(discography[0]);
            }
        }
    });

    function handleSelect(index: number) {
        currentIndex = index;
        const song = displayPlaylist[index];
        if (song) {
            selectSong(song);
        }
    }

    function handleNext() {
        if (displayPlaylist.length === 0) return;
        const nextIndex = (currentIndex + 1) % displayPlaylist.length;
        handleSelect(nextIndex);
    }

    $effect(() => {
        registerSongNextCallback(handleNext);
        return () => registerSongNextCallback(null);
    });

    function handlePrev() {
        if (displayPlaylist.length === 0) return;
        const prevIndex =
            (currentIndex - 1 + displayPlaylist.length) %
            displayPlaylist.length;
        handleSelect(prevIndex);
    }

    function handleToggleLike(index: number, liked: boolean) {
        if (displayPlaylist[index]) {
            displayPlaylist[index].Liked = liked;
        }
    }

    function toggleShuffle() {
        shuffleEnabled = !shuffleEnabled;
        if (shuffleEnabled) {
            // Generate new shuffle order immediately
            shuffledOrder = [...basePlaylist].sort(() => Math.random() - 0.5);
        }
    }

    function triggerLogin() {
        window.dispatchEvent(new CustomEvent("smol:request-login"));
    }

    async function triggerMint() {
        if (!userState.contractId) {
            triggerLogin();
            return;
        }
        if (!currentSong?.Id || minting || isMinted) return;

        try {
            minting = true;
            await mintingHook.triggerMint(
                {
                    id: currentSong.Id,
                    contractId: userState.contractId,
                    keyId: userState.keyId!,
                    smolContractId:
                        import.meta.env.PUBLIC_SMOL_CONTRACT_ID ||
                        "CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA",
                    rpcUrl: RPC_URL,
                    networkPassphrase: import.meta.env
                        .PUBLIC_NETWORK_PASSPHRASE!,
                    creatorAddress: currentSong.Address || "",
                    kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID!,
                },
                async () => {
                    // Update the local state to match minted status if needed
                },
            );
        } catch (e: any) {
            alert(e.message);
        } finally {
            minting = false;
        }
    }

    function share() {
        let url = window.location.href; // Default to current page (artist profile)

        // If a song is selected/playing, append ?play=ID to the artist URL
        if (currentSong?.Id && address) {
            const baseUrl = `${window.location.origin}/artist/${address}`;
            url = `${baseUrl}?play=${currentSong.Id}`;
        } else if (currentSong?.Id) {
            // Fallback if address is missing (rare)
            url = `${window.location.origin}/${currentSong.Id}`;
        }

        navigator
            .share?.({
                title: currentSong?.Title || "SMOL Artist",
                url,
            })
            .catch(() => {
                navigator.clipboard.writeText(url);
                alert("Link copied!");
            });
    }

    function copyAddress() {
        navigator.clipboard.writeText(address).then(() => {
            alert("Address copied! Send $KALE to tip this artist.");
        });
    }

    const shortAddress = $derived(
        address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "",
    );
</script>

<div
    class="space-y-0 h-full landscape:h-auto landscape:overflow-y-auto md:landscape:h-full md:landscape:overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono"
>
    <!-- Artist Info Header (Windowed) -->
    <!-- Header Wrapper with Kale Wreath -->
    <div class="relative z-50 max-w-6xl w-full mx-auto group/header">
        <!-- Ultimate Premium Kale Crown (Three-Layer Depth) -->

        <div
            class="w-full border border-white/5 md:rounded-xl rounded-none shadow-xl overflow-hidden py-3 md:py-4 px-3 md:px-4 flex flex-row items-center justify-between gap-1.5 md:gap-4 relative min-h-[140px] z-40"
        >
            <!-- Background Collage (Premium Upgrade) -->
            {#if artistBadges.premiumHeader && collageImages.length > 0}
                <div
                    class="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden"
                >
                    <div
                        class="flex flex-wrap content-start w-full animate-slide-up"
                    >
                        {#each collageImages as img}
                            <div
                                class="w-1/4 md:w-1/6 lg:w-1/8 aspect-square relative overflow-hidden"
                            >
                                <img
                                    src={img}
                                    alt="art"
                                    class="w-full h-full object-cover opacity-100"
                                    loading="lazy"
                                />
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- Dark Glass Overlay -->
            <div
                class="absolute inset-0 z-0 bg-[#0a0a0a]/60 backdrop-blur-[2px]"
            ></div>
            <!-- Left Section: Artist Info & Tip Button -->
            <div
                class="space-y-2 relative z-10 flex-1 min-w-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            >
                <h1
                    class="text-[9px] font-pixel text-white/40 uppercase tracking-[0.3em]"
                >
                    Artist Profile
                </h1>

                <div class="flex flex-col gap-3">
                    <button
                        onclick={copyAddress}
                        class="w-full text-lg md:text-3xl lg:text-4xl font-bold tracking-tighter text-white hover:text-[#d836ff] transition-colors flex items-center gap-2 md:gap-3 group/address text-left font-pixel tracking-widest"
                        title="Click to copy address (Send $KALE only!)"
                    >
                        {shortAddress}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            class="w-5 h-5 opacity-0 group-hover/address:opacity-100 transition-all text-[#d836ff] -ml-2 group-hover/address:ml-0"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                            />
                        </svg>
                    </button>

                    <button
                        onclick={() => {
                            if (!userState.contractId) {
                                triggerLogin();
                                return;
                            }
                            if (address) {
                                tipArtistAddress = address.trim();
                                showTipModal = true;
                            }
                        }}
                        class="w-fit px-5 py-2 rounded-full text-[10px] font-pixel tracking-[0.2em] transition-all flex items-center gap-2 overflow-hidden relative group/tip {artistBadges.goldenKale
                            ? 'bg-gradient-to-b from-[#FFF5D1]/40 via-[#D4AF37]/50 to-[#AA8C2C]/60 border border-[#FFE066]/60 text-[#FCF6BA] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_4px_rgba(0,0,0,0.1)] hover:brightness-110 active:scale-95 backdrop-blur-sm'
                            : 'bg-gradient-to-r from-green-600/20 to-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'}"
                    >
                        <!-- Metallic Shine Overlay -->
                        {#if artistBadges.goldenKale}
                            <div
                                class="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover/tip:animate-[shine_1.5s_infinite]"
                            ></div>
                        {/if}

                        <img
                            src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                            alt="Kale"
                            class="w-4 h-4 object-contain relative z-10 opacity-100 {artistBadges.goldenKale
                                ? 'filter sepia-[100%] saturate-[400%] brightness-[1.3] contrast-[1.2] hue-rotate-[5deg] drop-shadow-[0_0_4px_rgba(255,215,0,0.8)] animate-pulse'
                                : ''}"
                        />
                        <span
                            class="relative z-10 {artistBadges.goldenKale
                                ? 'drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] font-bold text-shadow-sm'
                                : ''}">Tip Artist</span
                        >
                    </button>
                </div>
            </div>

            {#if artistBadges.goldenKale}
                <!-- Absolute Positioned Golden Kale (Bottom-Right, Aligned with Tip Button, Mobile Only) -->
                <div
                    class="absolute bottom-6 right-3 md:hidden z-50 animate-pulse-slow group-hover/header:rotate-6 transition-transform origin-center pointer-events-none"
                    title="Gold Member"
                >
                    <img
                        src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                        class="w-14 h-14 filter sepia-[100%] saturate-[400%] brightness-[1.2] contrast-[1.2] hue-rotate-[5deg] drop-shadow-[2px_2px_0px_rgba(180,140,0,1)]"
                        style="image-rendering: pixelated;"
                        alt="Golden Kale"
                    />
                    <span
                        class="text-[12px] text-[#FCF6BA] animate-ping ml-[-6px] mt-[-10px] z-10 absolute top-0 right-0"
                        >✦</span
                    >
                </div>
            {/if}

            <!-- Middle Section: Artist Stats (Centered on Desktop) -->
            <div
                class="hidden md:flex flex-1 justify-center items-center gap-3 relative z-10 px-4"
            >
                <div class="flex items-center gap-2">
                    <span
                        class="px-2.5 py-1 rounded-md bg-lime-500/10 text-lime-400 text-[9px] border border-lime-500/20 tracking-widest font-pixel shadow-[0_0_8px_rgba(132,204,22,0.1)]"
                    >
                        {livePublishedCount} Published
                    </span>
                    <span
                        class="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 text-[9px] border border-purple-500/20 tracking-widest font-pixel shadow-[0_0_8px_rgba(216,54,255,0.1)]"
                    >
                        {liveMintedCount} Minted
                    </span>
                    <span
                        class="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 text-[9px] border border-blue-500/20 tracking-widest font-pixel shadow-[0_0_8px_rgba(59,130,246,0.1)]"
                    >
                        {liveCollectedCount} Collected
                    </span>
                </div>
            </div>

            <!-- Right Section: Player Controls (Mobile) -->
            <div
                class="flex items-center gap-4 relative z-[60] shrink-0 min-w-[120px] justify-end"
            >
                {#if currentSong}
                    {@const currentIdx = displayPlaylist.findIndex(
                        (s) => s.Id === currentSong?.Id,
                    )}
                    {@const isLiked =
                        currentIdx !== -1
                            ? displayPlaylist[currentIdx]?.Liked
                            : false}
                    <!-- Mobile Mini Player (RadioPlayer Style) -->
                    <div
                        class="items-center gap-1.5 sm:gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-xl {showGridView
                            ? 'flex md:hidden'
                            : 'hidden landscape:flex md:landscape:hidden'}"
                    >
                        <!-- Like Button -->
                        <LikeButton
                            smolId={currentSong.Id}
                            liked={!!isLiked}
                            classNames="tech-button w-7 h-7 flex items-center justify-center active:scale-95 disabled:opacity-30 border rounded-full backdrop-blur-md transition-all duration-300 border-[#ff424c] shadow-[0_0_15px_rgba(255,66,76,0.3)] {isLiked
                                ? 'bg-[#ff424c] text-white'
                                : 'bg-[#ff424c]/10 text-[#ff424c] hover:bg-[#ff424c]/20'}"
                            iconSize="size-3"
                            on:likeChanged={(e) => {
                                if (currentIdx !== -1) {
                                    handleToggleLike(
                                        currentIdx,
                                        e.detail.liked,
                                    );
                                }
                            }}
                        />

                        <!-- Prev Button -->
                        <button
                            class="tech-button w-7 h-7 flex items-center justify-center text-white/60 hover:text-white active:scale-95 border border-white/5 hover:border-white/20 rounded-full bg-white/5"
                            onclick={handlePrev}
                            title="Previous"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                            </svg>
                        </button>

                        <!-- Play/Pause Button -->
                        <button
                            class="tech-button w-9 h-9 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-xl border border-[#089981] text-[#089981] bg-[#089981]/10 shadow-[0_0_20px_rgba(8,153,129,0.4)] hover:bg-[#089981]/20 hover:text-white"
                            onclick={togglePlayPause}
                            title={isPlaying() ? "Pause" : "Play"}
                        >
                            {#if isPlaying()}
                                <svg
                                    class="w-4 h-4"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                </svg>
                            {:else}
                                <svg
                                    class="w-4 h-4 ml-0.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            {/if}
                        </button>

                        <!-- Next Button -->
                        <button
                            class="tech-button w-7 h-7 flex items-center justify-center text-white/60 hover:text-white active:scale-95 border border-white/5 hover:border-white/20 rounded-full bg-white/5"
                            onclick={handleNext}
                            title="Next"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                            </svg>
                        </button>

                        <!-- Regenerate/Shuffle Button (Orange) - Reshuffles playlist -->
                        <button
                            class="tech-button w-7 h-7 flex items-center justify-center active:scale-95 border rounded-full transition-all border-[#f7931a] bg-[#f7931a]/10 text-[#f7931a] hover:bg-[#f7931a]/20 shadow-[0_0_15px_rgba(247,147,26,0.2)]"
                            onclick={generateArtistMix}
                            disabled={isGeneratingMix}
                            title="Regenerate Shuffle"
                        >
                            <svg
                                class="w-3.5 h-3.5 {isGeneratingMix
                                    ? 'animate-spin'
                                    : ''}"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
                                />
                            </svg>
                        </button>

                        <!-- Cast Button -->
                        <CastButton
                            size={14}
                            classNames="w-7 h-7 flex items-center justify-center active:scale-95 border rounded-full transition-all border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white shadow-lg"
                        />
                    </div>
                {/if}

                <!-- Golden Kale Badge (Unlocked via Secret Tip) -->
                {#if artistBadges.goldenKale}
                    <div
                        class="absolute top-1/2 -translate-y-1/2 right-2 items-center justify-center animate-pulse-slow group/badge cursor-help z-[60] hidden md:flex"
                        title="Gold Member"
                    >
                        <img
                            src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                            class="w-10 h-10 md:w-14 md:h-14 filter sepia-[100%] saturate-[400%] brightness-[1.2] contrast-[1.2] hue-rotate-[5deg] drop-shadow-[4px_4px_0px_rgba(180,140,0,1)] transition-transform group-hover/badge:scale-110"
                            style="image-rendering: pixelated;"
                            alt="Golden Kale"
                        />
                        <!-- Three Sparkles like ✨ -->
                        <div
                            class="absolute -top-2 -right-3 text-[14px] md:text-[20px] text-[#FCF6BA] animate-ping opacity-90 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                            style="animation-duration: 2s;"
                        >
                            ✦
                        </div>
                        <div
                            class="absolute bottom-0 -left-3 text-[10px] md:text-[14px] text-[#FCF6BA] animate-ping delay-300 opacity-80"
                            style="animation-duration: 2.2s;"
                        >
                            ✦
                        </div>
                        <div
                            class="absolute -top-2 -left-2 text-[6px] md:text-[10px] text-[#FCF6BA] animate-pulse delay-700 opacity-70"
                        >
                            ✦
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Main Player Card -->
    <div
        class="max-w-6xl w-full mx-auto reactive-glass border border-white/5 bg-[#1d1d1d]/70 backdrop-blur-xl md:rounded-2xl rounded-none shadow-2xl relative flex flex-col flex-1 min-h-0"
    >
        <!-- Control Bar (Tabs & View Controls) -->
        <div
            class="relative z-[80] flex items-center border-b border-white/5 bg-[#1a1a1a] backdrop-blur-xl shrink-0 min-w-0 py-2 px-3 gap-2 landscape:sticky landscape:top-0"
        >
            <div class="flex items-center gap-2 select-none shrink-0">
                <button
                    onclick={() => {
                        if (showGridView) showGridView = false;
                    }}
                    class="shrink-0 p-1 text-lime-500 drop-shadow-[0_0_8px_rgba(132,204,22,0.4)] transition-all {showGridView
                        ? 'cursor-pointer hover:scale-110 hover:text-white'
                        : 'cursor-default'}"
                    title={showGridView ? "Back to Player" : ""}
                >
                    <svg
                        viewBox="0 0 24 24"
                        class="w-5 h-5"
                        fill="currentColor"
                    >
                        <path
                            d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                        />
                    </svg>
                </button>
            </div>

            <!-- Module Tabs (Visible on all devices) -->
            <div
                class="flex flex-1 items-center gap-4 md:gap-6 overflow-x-auto no-scrollbar min-w-0 relative {isSearchingMobile
                    ? ''
                    : 'mask-fade-right'}"
            >
                <!-- Mobile Elegant Search Bar Overlay -->
                {#if isSearchingMobile}
                    <div
                        class="absolute inset-0 bg-[#1a1a1a] w-full h-full flex items-center z-[100] animate-in slide-in-from-right-4 duration-300 md:hidden overflow-hidden justify-start"
                    >
                        <div class="relative w-[90%] flex items-center -ml-0.5">
                            <input
                                type="text"
                                bind:value={searchQuery}
                                placeholder="Search..."
                                class="flex-1 bg-black/40 border border-lime-500/30 rounded-full py-0.5 px-3 text-[8px] text-white outline-none focus:border-lime-500 transition-all font-pixel m-0"
                            />
                        </div>
                    </div>
                {/if}

                <button
                    onclick={() => {
                        activeModule = "discography";
                        shuffleEnabled = false;
                        selectedArtistTags = [];
                    }}
                    class="py-1.5 text-[8px] font-pixel transition-colors {activeModule ===
                    'discography'
                        ? 'text-lime-400'
                        : 'text-white/40 hover:text-white'} whitespace-nowrap"
                >
                    Discography
                </button>
                <button
                    onclick={() => {
                        activeModule = "minted";
                        shuffleEnabled = false;
                        selectedArtistTags = [];
                    }}
                    class="py-1.5 text-[8px] font-pixel transition-colors {activeModule ===
                    'minted'
                        ? 'text-lime-400'
                        : 'text-white/40 hover:text-white'} whitespace-nowrap"
                >
                    Minted
                </button>
                <button
                    onclick={() => {
                        activeModule = "collected";
                        shuffleEnabled = false;
                        selectedArtistTags = [];
                    }}
                    class="py-1.5 text-[8px] font-pixel transition-colors {activeModule ===
                    'collected'
                        ? 'text-lime-400'
                        : 'text-white/40 hover:text-white'} whitespace-nowrap"
                >
                    Collected
                </button>
            </div>

            <!-- Cast Button (Desktop) -->
            <div class="hidden md:flex items-center mr-1">
                <CastButton
                    size={16}
                    classNames="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                />
            </div>

            <!-- Search Input (Desktop Only) -->
            <div
                class="hidden md:flex items-center ml-2 border-l border-white/10 pl-3"
            >
                <div class="relative">
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Search {activeModule}..."
                        class="bg-black/20 border border-white/10 rounded-full py-1.5 px-3 text-[10px] w-32 xl:w-48 focus:w-40 xl:focus:w-56 focus:border-lime-500/50 focus:bg-black/40 outline-none transition-all duration-300 text-white placeholder:text-white/20 font-pixel"
                    />
                    {#if searchQuery}
                        <button
                            onclick={() => (searchQuery = "")}
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                        >
                            <svg
                                class="w-2.5 h-2.5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                />
                            </svg>
                        </button>
                    {:else}
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                            />
                        </svg>
                    {/if}
                </div>
            </div>

            <div class="flex items-center gap-3 md:gap-2 shrink-0">
                <!-- Landscape Search Button (Direct Toggle) -->
                <button
                    onclick={() => (isSearchingMobile = !isSearchingMobile)}
                    class="hidden landscape:flex lg:hidden w-8 h-8 items-center justify-center rounded-full transition-all active:scale-95 {isSearchingMobile
                        ? 'text-lime-400 bg-lime-500/20 border border-lime-500'
                        : 'text-white/40 hover:text-white hover:bg-white/10 border border-white/10'}"
                    title="Search"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="2"
                        stroke="currentColor"
                        class="w-4 h-4"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                        />
                    </svg>
                </button>

                <!-- Mobile Search/Menu Toggle Button (Portrait Grid Only) -->
                <div class="relative md:hidden landscape:hidden">
                    <button
                        onclick={() => {
                            if (showGridView) {
                                showSearchMenu = !showSearchMenu;
                            } else {
                                isSearchingMobile = !isSearchingMobile;
                            }
                        }}
                        class="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 {isSearchingMobile ||
                        showSearchMenu
                            ? 'text-lime-400 bg-lime-500/20 border border-lime-500'
                            : 'text-white/40 hover:text-white hover:bg-white/10 border border-white/10'}"
                        title="Search Options"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            class="w-4 h-4"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                            />
                        </svg>
                    </button>

                    <!-- Search Menu Dropdown (Mobile Grid View Only) -->
                    {#if showSearchMenu && showGridView}
                        <div
                            class="absolute right-0 top-10 z-[100] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-1 min-w-[140px] overflow-hidden backdrop-blur-xl animate-in slide-in-from-top-2 duration-200"
                        >
                            <button
                                onclick={() => {
                                    isSearchingMobile = !isSearchingMobile;
                                    showSearchMenu = false;
                                }}
                                class="w-full text-left px-3 py-2.5 text-[10px] font-pixel tracking-wider rounded-lg flex items-center gap-3 {isSearchingMobile
                                    ? 'text-lime-400 bg-white/10'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'}"
                            >
                                <svg
                                    class="w-3.5 h-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                    stroke="currentColor"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                                    />
                                </svg>
                                Search
                            </button>
                            <div class="h-px bg-white/5 my-1"></div>
                            <button
                                onclick={() => {
                                    tagsExpanded = !tagsExpanded;
                                    showSearchMenu = false;
                                }}
                                class="w-full text-left px-3 py-2.5 text-[10px] font-pixel tracking-wider rounded-lg flex items-center gap-3 {tagsExpanded
                                    ? 'text-lime-400 bg-white/10'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'}"
                            >
                                <svg
                                    class="w-3.5 h-3.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"
                                    />
                                </svg>
                                Tags {tagsExpanded ? "(On)" : ""}
                            </button>
                        </div>
                    {/if}
                </div>

                <!-- Sort Dropdown (Available in both Player and Grid modes) -->
                <div class="relative">
                    <button
                        onclick={() => (showSortDropdown = !showSortDropdown)}
                        class="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 {showSortDropdown
                            ? 'text-blue-400 bg-blue-500/20 border border-blue-500'
                            : 'text-blue-400 bg-blue-500/10 border border-blue-500/30 hover:border-blue-500 bg-blue-500/5'}"
                        title="Sort Options"
                    >
                        {#if sortMode === "latest"}
                            <svg
                                class="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M3 18h6v-2H3v2zM3 13h12v-2H3v2zm0-7v2h18V6H3z"
                                />
                            </svg>
                        {:else if sortMode === "canon"}
                            <svg
                                class="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M3 13h12v-2H3v2zm0 5h6v-2H3v2zm0-12v2h18V6H3z"
                                />
                            </svg>
                        {:else}
                            <svg
                                class="w-4 h-4"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                                />
                            </svg>
                        {/if}
                    </button>

                    {#if showSortDropdown}
                        <div
                            class="absolute right-0 top-10 z-[100] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-1 min-w-[130px] overflow-hidden backdrop-blur-xl"
                        >
                            <button
                                onclick={() => {
                                    sortMode = "latest";
                                    showSortDropdown = false;
                                }}
                                class="w-full text-left px-3 py-2.5 text-[10px] font-pixel uppercase tracking-wider rounded-lg flex items-center gap-3 {sortMode ===
                                'latest'
                                    ? 'text-lime-400 bg-white/10'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'}"
                            >
                                <svg
                                    class="w-3.5 h-3.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M3 18h6v-2H3v2zM3 13h12v-2H3v2zm0-7v2h18V6H3z"
                                    />
                                </svg>
                                Latest
                            </button>
                            <button
                                onclick={() => {
                                    sortMode = "canon";
                                    showSortDropdown = false;
                                }}
                                class="w-full text-left px-3 py-2.5 text-[10px] font-pixel uppercase tracking-wider rounded-lg flex items-center gap-3 {sortMode ===
                                'canon'
                                    ? 'text-lime-400 bg-white/10'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'}"
                            >
                                <svg
                                    class="w-3.5 h-3.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M3 13h12v-2H3v2zm0 5h6v-2H3v2zm0-12v2h18V6H3z"
                                    />
                                </svg>
                                Canon
                            </button>
                            <div class="h-px bg-white/5 my-1"></div>
                            <button
                                onclick={() => {
                                    sortMode = "shuffle";
                                    showSortDropdown = false;
                                    shuffleSeed = Date.now(); // Reshuffle
                                }}
                                class="w-full text-left px-3 py-2.5 text-[10px] font-pixel uppercase tracking-wider rounded-lg flex items-center gap-3 {sortMode ===
                                'shuffle'
                                    ? 'text-lime-400 bg-white/10'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'}"
                            >
                                <svg
                                    class="w-3.5 h-3.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                                    />
                                </svg>
                                Shuffle
                            </button>
                        </div>
                    {/if}
                </div>

                <!-- Grid View Toggle Button -->
                <button
                    onclick={() => {
                        showGridView = !showGridView;
                    }}
                    class="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 {showGridView
                        ? 'text-purple-400 bg-purple-500/20 border border-purple-500'
                        : 'text-white/40 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/30'}"
                    title={showGridView ? "Close Grid View" : "Open Grid View"}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-4 h-4"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H18A2.25 2.25 0 0 1 13.5 18v-2.25Z"
                        />
                    </svg>
                </button>
            </div>
        </div>

        <div
            class="relative flex-1 min-h-0 landscape:min-h-0 landscape:h-auto md:landscape:h-full flex flex-col"
        >
            {#if showGridView}
                <!-- Grid View Tags Integration (Overlay) -->
                {#if tagsExpanded}
                    <div
                        class="absolute top-0 left-0 right-0 z-[70] bg-[#1a1a1a]/95 backdrop-blur-xl border-b border-white/10 p-6 shadow-2xl animate-in slide-in-from-top-4 duration-500"
                    >
                        <div class="flex items-center justify-between mb-4">
                            <h3
                                class="text-[8px] font-pixel text-lime-400 uppercase tracking-wide"
                            >
                                Filter {activeModule} by Vibe
                            </h3>
                            {#if selectedArtistTags.length > 0}
                                <button
                                    onclick={() => (selectedArtistTags = [])}
                                    class="text-[8px] uppercase tracking-widest text-white/30 hover:text-white border-b border-white/10 hover:border-white transition-all"
                                >
                                    Clear {selectedArtistTags.length} Filter{selectedArtistTags.length >
                                    1
                                        ? "s"
                                        : ""}
                                </button>
                            {/if}
                        </div>
                        <div
                            class="max-h-[150px] overflow-y-auto pr-2 dark-scrollbar"
                        >
                            <div class="flex flex-wrap gap-2 items-center">
                                {#each artistTags as { tag, count }}
                                    <button
                                        onclick={() => toggleArtistTag(tag)}
                                        class="px-3 py-1.5 rounded-full text-[8px] font-pixel uppercase tracking-normal transition-all duration-300 {selectedArtistTags.includes(
                                            tag,
                                        )
                                            ? 'bg-lime-500 text-black font-pixel scale-105'
                                            : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100'}"
                                        style="font-size: {0.7 +
                                            (count / maxTagCount) * 0.4}rem;"
                                    >
                                        {tag}
                                        <span
                                            class="ml-0.5 opacity-40 text-[0.8em]"
                                            >{count}</span
                                        >
                                    </button>
                                {/each}
                            </div>
                        </div>
                        {#if selectedArtistTags.length > 0}
                            <div class="mt-6 flex justify-center">
                                <button
                                    onclick={generateArtistMix}
                                    disabled={isGeneratingMix}
                                    class="group relative flex items-center gap-3 px-8 py-3 bg-lime-500 rounded-full text-black font-pixel uppercase tracking-wide text-[11px] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 {isGeneratingMix
                                        ? 'animate-pulse bg-purple-500'
                                        : 'shadow-[0_0_20px_rgba(132,204,22,0.4)] hover:shadow-[0_0_30px_rgba(132,204,22,0.6)]'}"
                                >
                                    {#if isGeneratingMix}
                                        <svg
                                            class="animate-spin h-4 w-4 text-black"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                class="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                stroke-width="4"
                                            ></circle>
                                            <path
                                                class="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        <span>Mixing...</span>
                                    {:else}
                                        <svg
                                            class="w-4 h-4 group-hover:rotate-12 transition-transform"
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
                                            />
                                        </svg>
                                        <span>Generate Tag Mix</span>
                                    {/if}
                                </button>
                            </div>
                        {:else}{/if}
                    </div>
                {/if}

                <div
                    class="absolute inset-0 z-50 bg-[#121212] p-2 md:p-6 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto overflow-x-hidden dark-scrollbar pb-[env(safe-area-inset-bottom)]"
                    onscroll={handleGridScroll}
                >
                    <div
                        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 md:gap-4 pb-20"
                    >
                        {#each visiblePlaylist as song, index (song.Id)}
                            <div
                                role="button"
                                tabindex="0"
                                id="song-{song.Id}"
                                in:fade={{ duration: 200 }}
                                class="flex flex-col gap-2 group text-left w-full relative min-w-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105"
                                onclick={() => {
                                    if (
                                        currentSong &&
                                        currentSong.Id === song.Id
                                    ) {
                                        togglePlayPause();
                                    } else {
                                        currentIndex = index;
                                        selectSong(song);
                                    }
                                    // Keep grid view open
                                }}
                            >
                                {#if currentSong && song.Id === currentSong.Id}
                                    <!-- Outer Ambient Glow -->
                                    <!-- Outer Ambient Glow -->
                                    <div
                                        class="absolute -inset-2 rounded-2xl blur-xl transition-opacity duration-500 animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,#10b981,#a855f7,#f97316,#10b981)] {isPlaying()
                                            ? 'opacity-50'
                                            : 'opacity-30'}"
                                    ></div>
                                {/if}

                                <!-- Main Container (Defines Shape) -->
                                <div
                                    class="aspect-square rounded-xl relative overflow-hidden z-10 shadow-2xl"
                                >
                                    {#if currentSong && song.Id === currentSong.Id}
                                        <!-- Spinning Lightwire Background for Border -->
                                        <!-- Spinning Lightwire Background for Border -->
                                        <div
                                            class="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#10b981,#a855f7,#f97316,#10b981)] transition-opacity duration-500 animate-[spin_4s_linear_infinite] {isPlaying()
                                                ? 'opacity-100'
                                                : 'opacity-50'}"
                                        ></div>
                                    {/if}

                                    <!-- Content Mask (Inset to reveal wire) -->
                                    <div
                                        class="absolute bg-slate-800 overflow-hidden transition-all duration-300 {currentSong &&
                                        song.Id === currentSong.Id
                                            ? 'inset-[2px] rounded-[10px]'
                                            : 'inset-0 rounded-xl border border-white/10 group-hover:border-lime-500/50'}"
                                    >
                                        <img
                                            src="{API_URL}/image/{song.Id}.png?scale=8"
                                            alt={song.Title}
                                            class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 bg-slate-800"
                                            style="transform: translateZ(0); -webkit-transform: translateZ(0);"
                                            loading="eager"
                                            decoding="async"
                                        />
                                        {#if currentSong && song.Id === currentSong.Id}
                                            <div
                                                class="absolute inset-0 flex items-center justify-center z-10"
                                            >
                                                <div class="w-full h-full">
                                                    <MiniVisualizer />
                                                </div>
                                            </div>
                                        {/if}

                                        <!-- Top Left: Artist Profile -->
                                        <a
                                            href={`/artist/${song.Address}?play=${song.Id}`}
                                            class="absolute top-2 left-2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 border border-[#089981]/50 text-[#089981] hover:bg-[#089981]/20 transition-all shadow-[0_0_10px_rgba(8,153,129,0.3)] active:scale-95 hover:shadow-[0_0_15px_rgba(8,153,129,0.5)] cursor-pointer {currentSong &&
                                            song.Id === currentSong.Id
                                                ? 'opacity-100'
                                                : 'opacity-0 group-hover:opacity-100'}"
                                            onclick={(e) => e.stopPropagation()}
                                            title="View Artist Profile"
                                        >
                                            <svg
                                                class="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                                />
                                            </svg>
                                        </a>

                                        <!-- Top Right: Send to Radio -->
                                        <a
                                            href={`/radio?play=${song.Id}`}
                                            class="absolute top-2 right-2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 border border-[#f7931a]/50 text-[#f7931a] hover:bg-[#f7931a]/20 transition-all shadow-[0_0_10px_rgba(247,147,26,0.3)] active:scale-95 hover:shadow-[0_0_15px_rgba(247,147,26,0.5)] cursor-pointer {currentSong &&
                                            song.Id === currentSong.Id
                                                ? 'opacity-100'
                                                : 'opacity-0 group-hover:opacity-100'}"
                                            onclick={(e) => e.stopPropagation()}
                                            title="start Radio from here"
                                        >
                                            <svg
                                                class="w-4 h-4 ml-0.5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                                                />
                                            </svg>
                                        </a>

                                        <!-- Bottom Left: Like Button -->
                                        <div
                                            class="absolute bottom-2 left-2 z-20 {currentSong &&
                                            song.Id === currentSong.Id
                                                ? 'opacity-100'
                                                : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300"
                                            onclick={(e) => e.stopPropagation()}
                                        >
                                            <LikeButton
                                                smolId={song.Id}
                                                liked={song.Liked}
                                                classNames="p-1.5 rounded-full bg-black/40 border border-[#FF424C]/50 text-[#FF424C] hover:bg-[#FF424C]/20 transition-all shadow-[0_0_10px_rgba(255,66,76,0.3)] active:scale-95 hover:shadow-[0_0_15px_rgba(255,66,76,0.5)]"
                                                iconSize="size-4"
                                            />
                                        </div>

                                        <!-- Bottom Right: Song Detail -->
                                        <div
                                            role="button"
                                            class="absolute bottom-2 right-2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 border border-[#d836ff]/50 text-[#d836ff] hover:bg-[#d836ff]/20 transition-all shadow-[0_0_10px_rgba(216,54,255,0.3)] active:scale-95 hover:shadow-[0_0_15px_rgba(216,54,255,0.5)] cursor-pointer {currentSong &&
                                            song.Id === currentSong.Id
                                                ? 'opacity-100'
                                                : 'opacity-0 group-hover:opacity-100'}"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                navigate(
                                                    `/${song.Id}?from=artist`,
                                                );
                                            }}
                                            onkeydown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.stopPropagation();
                                                    navigate(
                                                        `/${song.Id}?from=artist`,
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
            {/if}

            <div
                class="flex flex-col landscape:flex-row lg:flex-row gap-0 landscape:gap-4 lg:gap-4 flex-1 min-h-0 landscape:h-auto md:landscape:h-full items-stretch px-4 pt-0 pb-4 overflow-hidden landscape:overflow-visible md:landscape:overflow-hidden {showGridView
                    ? 'hidden landscape:flex lg:flex'
                    : 'flex'}"
            >
                <!-- LEFT COLUMN: PLAYER -->
                <div
                    class="w-full landscape:w-1/2 lg:w-1/2 flex flex-col gap-0 min-h-0 relative z-[41] shrink-0"
                >
                    <RadioPlayer
                        playlist={displayPlaylist}
                        replaceDetailWithRegenerate={false}
                        showSongDetailButton={false}
                        playButtonVariant={showGridView ? "silver" : "default"}
                        onRegenerate={generateArtistMix}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        onSelect={handleSelect}
                        onToggleLike={handleToggleLike}
                        onTrade={isMinted
                            ? () => {
                                  if (!userState.contractId) {
                                      triggerLogin();
                                      return;
                                  }
                                  showTradeModal = true;
                              }
                            : undefined}
                        onMint={!isMinted ? triggerMint : undefined}
                        isMinting={minting}
                        isAuthenticated={userState.contractId !== null}
                        {currentIndex}
                        overlayControls={true}
                        overlayControlsOnMobile={false}
                        onShare={share}
                        {versions}
                        currentVersionId={selectedVersionId || ""}
                        onVersionSelect={(id) => {
                            selectedVersionId = id;
                            // Update the audio source by re-selecting the song with new version
                            if (currentSong) {
                                const updatedSong = {
                                    ...currentSong,
                                    Song_1: id,
                                };
                                selectSong(updatedSong);
                            }
                        }}
                    />
                </div>

                <!-- RIGHT COLUMN: PLAYLIST -->
                <div
                    class="w-full landscape:w-1/2 lg:w-1/2 flex flex-col min-h-0 mt-1 landscape:mt-0 lg:mt-0 bg-[#121212] border border-white/5 rounded-2xl relative flex-1 max-h-[50vh] landscape:max-h-full lg:max-h-full overflow-y-auto dark-scrollbar z-[40]"
                >
                    <div
                        class="flex items-center justify-between p-3 border-b border-white/5 bg-[#1a1a1a] flex-shrink-0"
                    >
                        <h3
                            class="text-white font-pixel tracking-wide uppercase text-[9px] truncate max-w-[70%]"
                            title={playlistTitle}
                        >
                            {playlistTitle} ({displayPlaylist.length})
                        </h3>
                        <div class="flex items-center gap-2">
                            <!-- Time Machine (Live Clock Trigger) -->
                            <button
                                class="flex items-center gap-1.5 px-2 py-1 rounded bg-black/40 hover:bg-fuchsia-500/20 text-fuchsia-400 border border-white/10 hover:border-fuchsia-500/50 transition-all group/clock shrink-0"
                                title="Time Machine: Click to Jump to Random Point in Timeline (Canon Mode)"
                                onclick={() => {
                                    // Time Machine: Switch to Canon, Jump Randomly, Play
                                    shuffleEnabled = false;
                                    activeModule = "discography";
                                    sortMode = "canon";

                                    // Wait for reactive sort update
                                    setTimeout(() => {
                                        let list = liveDiscography;
                                        if (list.length > 0) {
                                            const randomIdx = Math.floor(
                                                Math.random() * list.length,
                                            );
                                            const song = list[randomIdx];
                                            selectSong(song);
                                            currentIndex = randomIdx;

                                            // Force Play
                                            if (!isPlaying()) {
                                                togglePlayPause();
                                            }
                                        }
                                    }, 50);
                                }}
                            >
                                <span
                                    class="text-[8px] font-pixel tracking-widest tabular-nums opacity-80 group-hover/clock:opacity-100 group-hover/clock:text-fuchsia-300 uppercase"
                                >
                                    {timeString}
                                </span>
                            </button>

                            <button
                                onclick={() => (tagsExpanded = !tagsExpanded)}
                                class="flex items-center gap-1.5 px-2 py-1 rounded bg-white/10 hover:bg-lime-500/20 border border-white/10 hover:border-lime-500/50 transition-all"
                            >
                                <span
                                    class="text-[8px] text-lime-400 font-pixel uppercase tracking-wide"
                                    >{tagsExpanded ? "▼" : "▶"} Tags</span
                                >
                            </button>
                        </div>
                    </div>

                    <!-- Tags Filter Cloud (Artist Scoped) -->
                    {#if tagsExpanded}
                        <div
                            transition:fly={{
                                y: -20,
                                duration: 600,
                                easing: backOut,
                            }}
                            class="px-3 py-2 lg:mt-0 border-b border-white/5 bg-white/5 overflow-hidden"
                        >
                            <div
                                transition:fly={{ y: -10, duration: 200 }}
                                class="max-h-[120px] overflow-y-auto mt-2 dark-scrollbar"
                            >
                                <div class="flex flex-wrap gap-1 items-center">
                                    {#each artistTags.slice(0, 50) as { tag, count }}
                                        <button
                                            onclick={() => toggleArtistTag(tag)}
                                            class="px-2.5 py-1 rounded-full text-[8px] font-pixel uppercase tracking-normal transition-all duration-200 {selectedArtistTags.includes(
                                                tag,
                                            )
                                                ? 'bg-lime-500 text-black font-pixel scale-105'
                                                : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100'}"
                                        >
                                            {tag}
                                            <span
                                                class="ml-0.5 opacity-40 text-[0.7em]"
                                                >{count}</span
                                            >
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            {#if selectedArtistTags.length > 0}
                                <div
                                    class="mt-3 flex items-center justify-between"
                                >
                                    <span
                                        class="text-[8px] text-lime-400/60 uppercase tracking-widest"
                                    >
                                        Filtering by {selectedArtistTags.length}
                                        vibe{selectedArtistTags.length > 1
                                            ? "s"
                                            : ""}
                                    </span>
                                    <div class="flex items-center gap-3">
                                        <button
                                            onclick={generateArtistMix}
                                            disabled={isGeneratingMix}
                                            class="group relative flex items-center gap-2 px-3 py-1 bg-lime-500 rounded text-black font-pixel uppercase tracking-wide text-[9px] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 {isGeneratingMix
                                                ? 'animate-pulse bg-purple-500'
                                                : 'shadow-[0_0_10px_rgba(132,204,22,0.3)] hover:shadow-[0_0_15px_rgba(132,204,22,0.6)]'}"
                                        >
                                            {#if isGeneratingMix}
                                                <svg
                                                    class="animate-spin h-3 w-3 text-black"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <circle
                                                        class="opacity-25"
                                                        cx="12"
                                                        cy="12"
                                                        r="10"
                                                        stroke="currentColor"
                                                        stroke-width="4"
                                                    ></circle>
                                                    <path
                                                        class="opacity-75"
                                                        fill="currentColor"
                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                    ></path>
                                                </svg>
                                                <span>Generating...</span>
                                            {:else}
                                                <svg
                                                    class="w-3 h-3 group-hover:rotate-12 transition-transform"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
                                                    />
                                                </svg>
                                                <span>Generate Mix</span>
                                            {/if}

                                            <!-- Glow Effect -->
                                            <div
                                                class="absolute inset-0 rounded bg-white/20 blur opacity-0 group-hover:opacity-100 transition-opacity"
                                            ></div>
                                        </button>

                                        <button
                                            onclick={() =>
                                                (selectedArtistTags = [])}
                                            class="text-[8px] uppercase tracking-widest text-white/30 hover:text-white border-b border-white/10 hover:border-white transition-all"
                                        >
                                            Clear Filter
                                        </button>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    {#key activeModule}
                        <div
                            in:fly={{
                                y: 30,
                                duration: 600,
                                delay: 100,
                                easing: backOut,
                            }}
                            class="flex-1 min-h-0 overflow-y-scroll dark-scrollbar pr-2 pb-8"
                        >
                            <ul class="divide-y divide-white/5">
                                {#each displayPlaylist as song, index}
                                    <li>
                                        <div
                                            role="button"
                                            tabindex="0"
                                            id={`song-row-${song.Id}`}
                                            class="w-full flex items-center gap-4 p-3 hover:bg-white/[0.07] active:bg-white/[0.1] transition-all duration-200 text-left cursor-pointer group {index ===
                                            currentIndex
                                                ? 'bg-lime-500/15 border-l-4 border-lime-500'
                                                : 'border-l-4 border-transparent hover:border-white/10'}"
                                            onclick={(e) => {
                                                const target =
                                                    e.target as HTMLElement;
                                                if (
                                                    target.closest("a") ||
                                                    target.closest("button")
                                                )
                                                    return;
                                                handleSelect(index);
                                            }}
                                            onkeydown={(e) => {
                                                if (
                                                    e.key === "Enter" ||
                                                    e.key === " "
                                                ) {
                                                    e.preventDefault();
                                                    handleSelect(index);
                                                }
                                            }}
                                        >
                                            <span
                                                class="text-white/20 w-4 text-center text-[9px] font-pixel"
                                                >{index + 1}</span
                                            >

                                            <div
                                                class="relative w-10 h-10 rounded-lg bg-slate-800 flex-shrink-0 overflow-hidden group/thumb border border-white/10 shadow-lg"
                                            >
                                                <img
                                                    src="{API_URL}/image/{song.Id}.png?scale=8"
                                                    alt="Art"
                                                    class="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110 group-hover:brightness-50"
                                                    style="transform: translateZ(0); -webkit-transform: translateZ(0);"
                                                    onerror={(e) => {
                                                        (
                                                            e.currentTarget as HTMLImageElement
                                                        ).style.display =
                                                            "none";
                                                    }}
                                                />

                                                <!-- Play overlay on hover -->
                                                <div
                                                    class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20"
                                                >
                                                    <svg
                                                        class="w-5 h-5 text-lime-400"
                                                        fill="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            d="M8 5v14l11-7z"
                                                        />
                                                    </svg>
                                                </div>

                                                {#if index === currentIndex && audioState.playingId === song.Id}
                                                    <div
                                                        class="absolute inset-0 bg-black/60 flex items-center justify-center"
                                                    >
                                                        <div
                                                            class="flex gap-0.5 items-end h-3"
                                                        >
                                                            <div
                                                                class="w-1 bg-lime-500 animate-bounce"
                                                                style="animation-delay: 0.1s; height: 100%;"
                                                            ></div>
                                                            <div
                                                                class="w-1 bg-lime-500 animate-bounce"
                                                                style="animation-delay: 0.2s; height: 60%;"
                                                            ></div>
                                                            <div
                                                                class="w-1 bg-lime-500 animate-bounce"
                                                                style="animation-delay: 0.3s; height: 80%;"
                                                            ></div>
                                                        </div>
                                                    </div>
                                                {/if}
                                            </div>

                                            <div
                                                class="overflow-hidden text-left flex-1 min-w-0"
                                            >
                                                <div
                                                    class="text-[9px] font-pixel text-white/90 truncate {index ===
                                                    currentIndex
                                                        ? 'text-lime-400'
                                                        : ''}"
                                                >
                                                    {song.Title || "Untitled"}
                                                </div>
                                                <div
                                                    class="flex items-center gap-3 text-[7px] text-white/30 truncate font-pixel uppercase tracking-wide mt-0.5"
                                                >
                                                    {new Date(
                                                        song.Created_At ||
                                                            Date.now(),
                                                    ).toLocaleDateString(
                                                        undefined,
                                                        {
                                                            month: "short",
                                                            day: "numeric",
                                                        },
                                                    )}

                                                    {#if song.Tags && Array.isArray(song.Tags) && song.Tags.length > 0}
                                                        <div
                                                            class="flex gap-1.5 items-center ml-2 border-l border-white/10 pl-2"
                                                        >
                                                            {#each (song.Tags ?? []).slice(0, 3) as tag}
                                                                <span
                                                                    class="text-[9px] font-pixel text-lime-400/50 hover:text-lime-400 transition-colors cursor-default"
                                                                    >#{tag}</span
                                                                >
                                                            {/each}
                                                        </div>
                                                    {/if}
                                                </div>
                                            </div>

                                            <div
                                                class="flex items-center gap-1"
                                            >
                                                <LikeButton
                                                    smolId={song.Id}
                                                    liked={song.Liked || false}
                                                    classNames="p-1.5 text-white/20 hover:text-[#ff424c] hover:bg-white/5 rounded-full transition-colors"
                                                    on:likeChanged={(e) => {
                                                        handleToggleLike(
                                                            index,
                                                            e.detail.liked,
                                                        );
                                                    }}
                                                />

                                                <a
                                                    href="/{song.Id}?from=artist"
                                                    class="p-1.5 text-white/20 hover:text-white transition-colors"
                                                    title="View Details"
                                                    onclick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        navigate(
                                                            `/${song.Id}?from=artist`,
                                                        );
                                                    }}
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke-width="1.5"
                                                        stroke="currentColor"
                                                        class="w-3.5 h-3.5"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                                        />
                                                    </svg>
                                                </a>
                                            </div>
                                        </div>
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {/key}
                </div>
            </div>
        </div>
    </div>
</div>

{#if showTradeModal && currentSong && currentSong.Mint_Amm && currentSong.Mint_Token}
    <MintTradeModal
        ammId={currentSong.Mint_Amm}
        mintTokenId={currentSong.Mint_Token}
        songId={currentSong.Id}
        title={currentSong.Title || "Untitled"}
        imageUrl="{API_URL}/image/{currentSong.Id}.png?scale=8"
        on:close={() => (showTradeModal = false)}
        on:complete={() => {
            showTradeModal = false;
        }}
    />
{/if}

{#if showTipModal && tipArtistAddress}
    <TipArtistModal
        artistAddress={tipArtistAddress}
        onClose={() => {
            showTipModal = false;
            tipArtistAddress = null;
        }}
    />
{/if}
