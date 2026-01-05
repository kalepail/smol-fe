<script lang="ts">
    import { onMount } from "svelte";
    import type { Smol } from "../../types/domain";
    import {
        audioState,
        selectSong,
        registerSongNextCallback,
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
    import { flip } from "svelte/animate";
    import { backOut } from "svelte/easing";

    let {
        discography = [],
        minted = [],
        collected = [],
        address,
        publishedCount = 0,
        collectedCount = 0,
        mintedCount = 0,
        topTags = [],
    }: {
        discography?: Smol[];
        minted?: Smol[];
        collected?: Smol[];
        address: string;
        publishedCount?: number;
        collectedCount?: number;
        mintedCount?: number;
        topTags?: string[];
    } = $props();

    // Reactive state for hydration (starts with props, updates with live data)
    let liveDiscography = $state<Smol[]>(discography);
    let liveMinted = $state<Smol[]>(minted);
    // Collected stays as snapshot for now since API lacks Minted_By support
    let liveCollected = $state<Smol[]>(collected);
    let isLoadingLive = $state(false);
    let livePublishedCount = $state(publishedCount);
    let liveCollectedCount = $state(collectedCount);
    let liveMintedCount = $state(mintedCount);
    let liveTopTags = $state<string[]>(topTags);

    // OOM FIX: If no props provided (SSR mode), fetch on mount
    onMount(async () => {
        if (liveDiscography.length === 0 && address) {
            isLoadingLive = true;
            try {
                const smols = await safeFetchSmols();

                // Discography: Songs created or published by this artist
                const disco = smols.filter(
                    (s) => s.Address === address || s.Creator === address,
                );
                disco.sort(
                    (a, b) =>
                        new Date(b.Created_At).getTime() -
                        new Date(a.Created_At).getTime(),
                );
                liveDiscography = disco;
                livePublishedCount = disco.length;

                // Minted: Created by them AND has been minted
                liveMinted = disco.filter((s) => s.Mint_Token !== null);
                liveMintedCount = liveMinted.length;

                // Collected: Minted by this artist but NOT created by them
                const collectedItems = smols.filter(
                    (s) =>
                        s.Minted_By === address &&
                        s.Address !== address &&
                        s.Creator !== address,
                );
                collectedItems.sort(
                    (a, b) =>
                        new Date(b.Created_At).getTime() -
                        new Date(a.Created_At).getTime(),
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

                console.log(
                    `[ArtistResults] Loaded artist data: ${disco.length} discography, ${liveCollected.length} collected`,
                );
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
    let shuffleEnabled = $state(false);
    let currentIndex = $state(0);
    let minting = $state(false);
    let showTradeModal = $state(false);
    let tradeMintBalance = $state(0n);
    let showGridView = $state(false);
    let showTipModal = $state(false);
    let selectedVersionId = $state<string | null>(null);
    let isGeneratingMix = $state(false);
    let initialPlayHandled = $state(false);
    let isUrlStateLoaded = $state(false);
    let initialScrollHandled = $state(false);
    let shuffleSeed = $state(Date.now());

    // Deterministic Hash for Seeded Shuffle (Stable Random)
    function getShuffleVal(id: string, seed: number) {
        let h = 0xdeadbeef;
        for (let i = 0; i < id.length; i++)
            h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
        h = Math.imul(h ^ seed, 1597334677);
        return (h >>> 0) / 4294967296;
    }

    // Initial mount: Check for ?play param AND restore state from URL
    $effect(() => {
        if (initialPlayHandled) return;

        if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search);

            // Restore State (Tab, Tags, Shuffle)
            const tabParam = urlParams.get("tab");
            if (
                tabParam &&
                ["discography", "minted", "collected", "tags"].includes(
                    tabParam,
                )
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

            // Handle Auto-Play (?play=id)
            const playId = urlParams.get("play");
            if (playId && discography.length > 0) {
                const songIndex = discography.findIndex((s) => s.Id === playId);
                if (songIndex >= 0) {
                    currentIndex = songIndex;
                    if (currentSong?.Id !== playId) {
                        selectSong(discography[songIndex]);
                    }
                }
            } else if (discography.length > 0) {
                // If NO play param:
                // Check if we are already playing a song from this artist (Seamless Return)
                const playingId = currentSong?.Id;

                if (playingId) {
                    // Determine what the playlist WILL look like after hydration
                    let targetList = [...discography];
                    if (activeModule === "minted") targetList = [...minted];
                    if (activeModule === "collected")
                        targetList = [...collected];

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
                        console.log(
                            "[ArtistResults] Seamless return detected. Syncing index to",
                            matchIndex,
                            "Tab:",
                            activeModule,
                        );
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
        }
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
            params.delete("seed");
        }

        // Preserve 'from' if it exists (though not typically used on Artist page)
        // Clean up 'play' param if it exists (one-time use)
        params.delete("play");

        window.history.replaceState(history.state, "", url.toString());
    });

    // Auto-Scroll to Active Song on Mount
    $effect(() => {
        if (
            !initialScrollHandled &&
            isUrlStateLoaded &&
            currentSong &&
            displayPlaylist.length > 0 &&
            !isLoadingLive
        ) {
            const el = document.getElementById(`song-row-${currentSong.Id}`);
            if (el) {
                // Determine if song is in view or needs scrolling
                // We use 'center' to make it obvious
                el.scrollIntoView({ block: "center", behavior: "smooth" });
                initialScrollHandled = true;
            }
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
                sac.getSACClient(currentSong.Mint_Token),
                userState.contractId,
            ).then((b) => {
                tradeMintBalance = b;
            });
        }
    });

    // Hydrate with live data on mount or address change
    $effect(() => {
        if (address) {
            hydrateArtistData(address);
        }
    });

    async function hydrateArtistData(addr: string) {
        if (isLoadingLive) return;
        isLoadingLive = true;
        console.log(`[ArtistResults] Hydrating live data for ${addr}...`);

        try {
            // Fetch ALL smols (Hybrid: Live + Snapshot + Deep Verification)
            // We fetch the global list and filter client-side to ensure we get hydrated tags
            const allSmols = await safeFetchSmols();

            // Filter for THIS artist
            const artistSmols = allSmols.filter(
                (s) => s.Address === addr || s.Creator === addr,
            );

            if (artistSmols.length > 0) {
                console.log(
                    `[ArtistResults] Found ${artistSmols.length} live tracks`,
                );

                // Sort by date desc
                artistSmols.sort(
                    (a, b) =>
                        new Date(b.Created_At || 0).getTime() -
                        new Date(a.Created_At || 0).getTime(),
                );

                liveDiscography = artistSmols;

                // Re-calculate minted from live data
                liveMinted = artistSmols.filter((s) => s.Mint_Token !== null);

                console.log(
                    `[ArtistResults] Live stats: ${liveDiscography.length} discog, ${liveMinted.length} minted, ${liveCollected.length} collected`,
                );
            }
        } catch (e) {
            console.error("[ArtistResults] Failed to hydrate live data:", e);
            // Fallback: silently fail and keep using snapshot data (props)
        } finally {
            isLoadingLive = false;
        }
    }

    // Aggregate tags for the artist
    const artistTags = $derived.by(() => {
        const counts: Record<string, number> = {};
        for (const smol of liveDiscography) {
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

        // AI Vibe Delay
        await new Promise((resolve) => setTimeout(resolve, 1500));

        shuffleEnabled = true;
        shuffleSeed = Date.now();
        // shuffledOrder will update automatically via effect
        // But we wait for next tick? No, derived 'displayPlaylist' uses 'shuffledOrder' which updates in effect?
        // Wait, shuffledOrder is updated in an effect below.
        // We just updated shuffleEnabled and shuffleSeed.
        // The effect at line 322 dependencies: basePlaylist, shuffleEnabled.
        // We need to trigger it.

        isGeneratingMix = false;

        // Auto-play first song of the mix
        if (shuffledOrder.length > 0) {
            currentIndex = 0;
            selectSong(shuffledOrder[0]);
        }

        // Slide out: transition back to discography and close grid
        activeModule = "discography";
        showGridView = false;
    }

    // Derived playlist based on module and shuffle
    const basePlaylist = $derived.by(() => {
        let source = liveDiscography;
        if (activeModule === "minted") source = liveMinted;
        if (activeModule === "collected") source = liveCollected;

        if (selectedArtistTags.length === 0) return source;

        return source.filter((smol) =>
            selectedArtistTags.some((t) => smol.Tags?.includes(t)),
        );
    });

    // Store the shuffled order separately to avoid re-shuffling on every render
    let shuffledOrder = $state<Smol[]>([]);

    // When base playlist changes, reset shuffled order
    $effect(() => {
        // Only update shuffle order when base changes (not on every toggle)
        // Only update shuffle order when base changes or seed/shuffle changes
        if (basePlaylist.length > 0 && shuffleEnabled) {
            // Sort deterministically using Seed
            shuffledOrder = [...basePlaylist].sort(
                (a, b) =>
                    getShuffleVal(a.Id, shuffleSeed) -
                    getShuffleVal(b.Id, shuffleSeed),
            );
        }
    });

    // Derived display playlist (no random calls here = stable)
    const displayPlaylist = $derived.by(() => {
        if (shuffleEnabled && shuffledOrder.length > 0) {
            return shuffledOrder;
        }
        return basePlaylist;
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
            if (typeof window !== "undefined") {
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

    const API_URL = import.meta.env.PUBLIC_API_URL;

    function handleSelect(index: number) {
        currentIndex = index;
        const song = displayPlaylist[index];
        if (song) {
            selectSong(song);
        }
    }

    function handleNext() {
        const nextIndex = (currentIndex + 1) % displayPlaylist.length;
        handleSelect(nextIndex);
    }

    $effect(() => {
        registerSongNextCallback(handleNext);
        return () => registerSongNextCallback(null);
    });

    function handlePrev() {
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
                    smolContractId: import.meta.env.PUBLIC_SMOL_CONTRACT_ID!,
                    rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
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
        const url = currentSong?.Id
            ? `${window.location.origin}/${currentSong.Id}`
            : window.location.href;
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
    class="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono"
>
    <!-- Artist Info Header (Windowed) -->
    <div
        class="max-w-6xl mx-auto reactive-glass border border-white/5 bg-[#1d1d1d]/70 backdrop-blur-xl rounded-xl shadow-xl overflow-hidden mb-1 py-1 px-3 md:px-4 flex flex-row items-center justify-between gap-2 md:gap-4 relative group/header"
    >
        <div class="space-y-1 relative z-10">
            <h1
                class="text-[9px] font-mono text-white/40 uppercase tracking-[0.3em]"
            >
                Artist Profile
            </h1>
            <div class="flex items-center gap-3">
                <button
                    onclick={copyAddress}
                    class="text-lg md:text-3xl lg:text-4xl font-bold tracking-tighter text-white hover:text-[#d836ff] transition-colors flex items-center gap-2 md:gap-3 group/address text-left"
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
            </div>
            <div class="flex items-center gap-2 mt-2">
                <button
                    onclick={() => {
                        if (!userState.contractId) {
                            triggerLogin();
                            return;
                        }
                        showTipModal = true;
                    }}
                    class="px-3 py-1 bg-gradient-to-r from-green-600/20 to-green-500/10 border border-green-500/30 rounded-full text-green-400 text-[10px] font-bold uppercase tracking-widest hover:bg-green-500/20 transition-all flex items-center gap-1.5"
                >
                    <span class="text-base leading-none">🥬</span>
                    Tip Artist
                </button>
            </div>
        </div>

        <div class="hidden md:flex flex-col items-end gap-3 relative z-10">
            <div class="flex flex-wrap gap-2 justify-end">
                <span
                    class="px-3 py-1 rounded-md bg-lime-500/10 text-lime-400 text-[10px] border border-lime-500/20 uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(132,204,22,0.1)]"
                >
                    {publishedCount} Published
                </span>
                <span
                    class="px-3 py-1 rounded-md bg-purple-500/10 text-purple-400 text-[10px] border border-purple-500/20 uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(216,54,255,0.1)]"
                >
                    {mintedCount} Minted
                </span>
            </div>
            <div class="flex gap-2">
                <span
                    class="px-3 py-1 rounded-md bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20 uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                >
                    {collectedCount} Collected
                </span>
            </div>
        </div>

        <!-- Decorative Background Glow -->
        <div
            class="absolute -top-24 -right-24 w-64 h-64 bg-[#d836ff]/5 rounded-full blur-[80px] pointer-events-none"
        ></div>
        <div
            class="absolute -bottom-24 -left-24 w-64 h-64 bg-lime-500/5 rounded-full blur-[80px] pointer-events-none"
        ></div>
    </div>

    <!-- Main Player Card -->
    <div
        class="max-w-6xl mx-auto reactive-glass border border-white/5 bg-[#1d1d1d]/70 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden relative flex flex-col h-[calc(100vh-200px)] min-h-[400px]"
    >
        <!-- Control Bar -->
        <div class="flex items-center justify-between py-0.5 px-3 shrink-0">
            <div class="flex items-center gap-2 select-none">
                <div
                    class="text-lime-500 drop-shadow-[0_0_8px_rgba(132,204,22,0.4)]"
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
                </div>
                <!-- Module Tabs -->
                <div class="flex gap-4 ml-4">
                    <button
                        onclick={() => {
                            activeModule = "discography";
                            shuffleEnabled = false;
                            selectedArtistTags = [];
                            showGridView = false;
                        }}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'discography'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Discography
                    </button>
                    <button
                        onclick={() => {
                            activeModule = "minted";
                            shuffleEnabled = false;
                            selectedArtistTags = [];
                            showGridView = false;
                        }}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'minted'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Minted
                    </button>
                    <button
                        onclick={() => {
                            activeModule = "collected";
                            shuffleEnabled = false;
                            selectedArtistTags = [];
                            showGridView = false;
                        }}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'collected'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Collected
                    </button>
                    <!-- Tags Tab - Desktop Only Per User Request -->
                    <button
                        onclick={() => (activeModule = "tags")}
                        class="hidden md:block text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'tags'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Tags
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <button
                    onclick={() => {
                        showGridView = !showGridView;
                        if (showGridView && window.innerWidth < 768) {
                            activeModule = "tags";
                        }
                    }}
                    class="flex items-center gap-2 px-3 py-1 rounded border transition-all {showGridView
                        ? 'border-purple-500/50 bg-purple-500/10 text-purple-400'
                        : 'border-white/10 text-white/40 hover:text-white'}"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-3 h-3"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H18A2.25 2.25 0 0 1 13.5 18v-2.25Z"
                        />
                    </svg>
                    <span class="text-[9px] font-bold uppercase tracking-widest"
                        >Grid View</span
                    >
                </button>

                <button
                    onclick={toggleShuffle}
                    class="hidden lg:flex items-center gap-2 px-3 py-1 rounded border transition-all {shuffleEnabled
                        ? 'border-lime-500/50 bg-lime-500/10 text-lime-400'
                        : 'border-white/10 text-white/40 hover:text-white'}"
                >
                    <svg
                        class="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                        />
                    </svg>
                    <span class="text-[9px] font-bold uppercase tracking-widest"
                        >{shuffleEnabled ? "Shuffle On" : "Shuffle Off"}</span
                    >
                </button>
            </div>
        </div>

        <div class="relative flex-1 min-h-0">
            {#if showGridView}
                <div
                    class="absolute inset-0 z-50 bg-[#121212] p-6 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto dark-scrollbar"
                >
                    <!-- Grid View Tags Integration -->
                    {#if activeModule === "tags"}
                        <div
                            class="mb-8 border-b border-white/10 pb-6 animate-in slide-in-from-top-4 duration-500"
                        >
                            <div class="flex items-center justify-between mb-4">
                                <h3
                                    class="text-[10px] font-bold text-lime-400 uppercase tracking-widest"
                                >
                                    Filter by Vibe
                                </h3>
                                {#if selectedArtistTags.length > 0}
                                    <button
                                        onclick={() =>
                                            (selectedArtistTags = [])}
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
                                            class="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider transition-all duration-300 {selectedArtistTags.includes(
                                                tag,
                                            )
                                                ? 'bg-lime-500 text-black font-black scale-105'
                                                : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100'}"
                                            style="font-size: {0.7 +
                                                (count / maxTagCount) *
                                                    0.4}rem;"
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
                                        class="group relative flex items-center gap-3 px-8 py-3 bg-lime-500 rounded-full text-black font-bold uppercase tracking-[0.2em] text-[11px] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 {isGeneratingMix
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
                            {:else}
                                <!-- Mobile Only "Surprise Me" when no tags selected -->
                                <div class="mt-6 flex justify-center md:hidden">
                                    <button
                                        onclick={generateArtistMix}
                                        disabled={isGeneratingMix}
                                        class="group relative flex items-center gap-2 px-8 py-3 bg-white/10 rounded-full text-white font-bold uppercase tracking-[0.2em] text-[10px] transition-all hover:bg-white/20 active:scale-95 border border-white/10"
                                    >
                                        <svg
                                            class="w-3.5 h-3.5 opacity-60"
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                                            />
                                        </svg>
                                        <span>Surprise Me</span>
                                    </button>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <div
                        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 pb-20"
                    >
                        {#each displayPlaylist as song, index (song.Id)}
                            <button
                                in:fade={{ duration: 200 }}
                                class="flex flex-col gap-2 group text-left w-full"
                                onclick={() => {
                                    handleSelect(index);
                                    showGridView = false;
                                }}
                            >
                                <div
                                    class="aspect-square rounded-lg bg-slate-800 overflow-hidden border border-white/10 group-hover:border-lime-500/50 transition-all shadow-lg relative"
                                >
                                    <img
                                        src="{API_URL}/image/{song.Id}.png?scale=8"
                                        alt={song.Title}
                                        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                        style="transform: translateZ(0); -webkit-transform: translateZ(0);"
                                    />
                                    {#if index === currentIndex}
                                        <div
                                            class="absolute inset-0 bg-lime-500/20 flex items-center justify-center"
                                        >
                                            <div
                                                class="w-2 h-2 rounded-full bg-lime-500 shadow-[0_0_12px_#84cc16]"
                                            ></div>
                                        </div>
                                    {/if}
                                </div>
                                <span
                                    class="text-[10px] font-bold text-white/60 truncate group-hover:text-white transition-colors"
                                    >{song.Title || "Untitled"}</span
                                >
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            <div
                class="flex flex-col lg:flex-row gap-4 h-full items-stretch px-4 pt-0 pb-4"
            >
                <!-- LEFT COLUMN: PLAYER -->
                <div class="w-full lg:w-1/2 flex flex-col gap-1 min-h-0 pb-1">
                    <RadioPlayer
                        playlist={displayPlaylist}
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
                        overlayControlsOnMobile={true}
                        onShare={share}
                        onShuffle={() => (shuffleEnabled = !shuffleEnabled)}
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

                    <!-- Mint + Trade Buttons (hidden on mobile, controls are in art) -->
                    <div class="hidden lg:flex gap-3 mt-1">
                        {#if isMinted}
                            {#if currentSong?.Mint_Amm && currentSong?.Mint_Token}
                                <button
                                    onclick={() => {
                                        if (!userState.contractId) {
                                            triggerLogin();
                                            return;
                                        }
                                        showTradeModal = true;
                                    }}
                                    class="flex-1 py-3 bg-[#2775ca] hover:brightness-110 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                                >
                                    Trade <TokenBalancePill
                                        balance={tradeMintBalance}
                                    />
                                </button>
                            {:else}
                                <button
                                    onclick={() =>
                                        (window.location.href = `/${currentSong?.Id}?from=artist`)}
                                    class="flex-1 py-3 bg-emerald-500/20 text-emerald-300 font-bold rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-emerald-500/30"
                                >
                                    ✓ Minted
                                </button>
                            {/if}
                        {:else}
                            <button
                                onclick={triggerMint}
                                disabled={minting}
                                class="flex-1 py-3 bg-[#d836ff] hover:brightness-110 disabled:opacity-50 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                            >
                                {minting ? "Minting..." : "Mint Track"}
                            </button>
                        {/if}
                        <button
                            onclick={share}
                            class="px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/5 transition-all text-xs uppercase tracking-widest"
                            >Share</button
                        >
                    </div>
                </div>

                <!-- RIGHT COLUMN: PLAYLIST -->
                <div
                    class="w-full lg:w-1/2 flex flex-col min-h-0 bg-black/20 border border-white/5 rounded-2xl overflow-hidden max-h-[40vh] lg:max-h-[calc(100vh-280px)]"
                >
                    <div
                        class="flex items-center justify-between p-3 border-b border-white/5 bg-white/5 flex-shrink-0"
                    >
                        <h3
                            class="text-white font-bold tracking-widest uppercase text-xs truncate max-w-[70%]"
                            title={playlistTitle}
                        >
                            {playlistTitle} ({displayPlaylist.length})
                        </h3>
                        <div class="flex items-center gap-2">
                            <span
                                class="w-2 h-2 rounded-full bg-lime-500 shadow-[0_0_8px_#84cc16]"
                            ></span>
                            <span
                                class="text-[9px] text-white/30 font-mono uppercase"
                                >Live</span
                            >
                        </div>
                    </div>

                    <!-- Tags Filter Cloud (Artist Scoped) -->
                    {#if activeModule === "tags"}
                        <div
                            transition:fly={{
                                y: -20,
                                duration: 600,
                                easing: backOut,
                            }}
                            class="px-4 py-4 border-b border-white/5 bg-white/5 overflow-hidden"
                        >
                            <div
                                class="max-h-[200px] overflow-y-auto pr-2 dark-scrollbar"
                            >
                                <div class="flex flex-wrap gap-2 items-center">
                                    {#each artistTags as { tag, count }}
                                        <button
                                            onclick={() => toggleArtistTag(tag)}
                                            class="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider transition-all duration-300 {selectedArtistTags.includes(
                                                tag,
                                            )
                                                ? 'bg-lime-500 text-black font-black scale-105'
                                                : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 opacity-70 hover:opacity-100'}"
                                            style="font-size: {0.7 +
                                                (count / maxTagCount) *
                                                    0.4}rem;"
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
                                            class="group relative flex items-center gap-2 px-3 py-1 bg-lime-500 rounded text-black font-bold uppercase tracking-widest text-[9px] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 {isGeneratingMix
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
                            class="flex-1 min-h-0 overflow-y-auto dark-scrollbar pr-2 pb-8"
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
                                                class="text-white/20 w-4 text-center text-xs font-mono"
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
                                                    class="text-xs font-bold text-white/90 truncate {index ===
                                                    currentIndex
                                                        ? 'text-lime-400'
                                                        : ''}"
                                                >
                                                    {song.Title || "Untitled"}
                                                </div>
                                                <div
                                                    class="flex items-center gap-3 text-[9px] text-white/30 truncate uppercase tracking-widest mt-0.5 font-light"
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

                                                    {#if song.Tags && song.Tags.length > 0}
                                                        <div
                                                            class="flex gap-1.5 items-center ml-2 border-l border-white/10 pl-2"
                                                        >
                                                            {#each song.Tags.slice(0, 3) as tag}
                                                                <span
                                                                    class="text-[9px] text-lime-400/50 hover:text-lime-400 transition-colors cursor-default"
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
                                                    onclick={(e) =>
                                                        e.stopPropagation()}
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

{#if showTipModal}
    <TipArtistModal
        artistAddress={address}
        onClose={() => (showTipModal = false)}
    />
{/if}
