<script lang="ts">
    import { onMount, untrack, tick } from "svelte";
    import {
        audioState,
        selectSong,
        registerSongNextCallback,
        registerSongPrevCallback,
        isPlaying,
        togglePlayPause,
        playNextSong,
        playPrevSong as playPreviousSong,
    } from "../../stores/audio.svelte";
    import { navigate } from "astro:transitions/client";
    import RadioPlayer from "../radio/RadioPlayer.svelte";
    import { userState } from "../../stores/user.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import { useSmolMinting } from "../../hooks/useSmolMinting";
    import MintTradeModal from "../MintTradeModal.svelte";
    import { getTokenBalance } from "../../utils/balance";
    import TipArtistModal from "../artist/TipArtistModal.svelte";
    import { sac } from "../../utils/passkey-kit";
    import { buildRadioUrl } from "../../utils/radio";
    import {
        safeFetchSmols,
        likeSmol,
        unlikeSmol,
    } from "../../services/api/smols";
    import { fly, fade, scale } from "svelte/transition";
    import MiniVisualizer from "../ui/MiniVisualizer.svelte";
    import { backOut } from "svelte/easing";
    import type { Smol } from "../../types/domain";

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

    let liveDiscography = $state<Smol[]>([]);
    let isLoadingLive = $state(false);
    let liveTopTags = $state<string[]>([]);

    import {
        preferences,
        THEMES,
        type GlowTheme,
    } from "../../stores/preferences.svelte";
    import { upgradesState } from "../../stores/upgrades.svelte";

    // Navigation / View State
    let activeModule = $state<"all" | "minted" | "tags">("all");
    let selectedTags = $state<string[]>([]);
    let shuffleEnabled = $state(false);
    let currentIndex = $state(0);

    // settings menu state
    let showSettingsMenu = $state(false);
    let minting = $state(false);
    let showTradeModal = $state(false);
    let showGridView = $state(true);
    let tagsExpanded = $state(false);
    let sortMode = $state<"latest" | "canon" | "shuffle">("latest");
    let showSortDropdown = $state(false);
    let showTipModal = $state(false);
    let tipArtistAddress = $state<string | null>(null);
    let selectedVersionId = $state<string | null>(null);
    let isGeneratingMix = $state(false);
    let initialPlayHandled = $state(false);
    let isUrlStateLoaded = $state(false);
    let initialScrollHandled = $state(false);

    // Time Machine Clock State
    let timeString = $state("");
    let shuffleSeed = $state(Date.now());
    let collageImages = $state<string[]>([]);
    let searchQuery = $state("");
    let isSearchingMobile = $state(false);
    let showSearchMenu = $state(false);

    onMount(() => {
        // Start Clock
        const updateTime = () => {
            timeString = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);

        // Fetch Global Data
        hydrateGlobalData();

        return () => clearInterval(interval);
    });

    // Auto-scroll to playing song when returning to grid view or changing song
    $effect(() => {
        if (
            showGridView &&
            audioState.playingId &&
            displayPlaylist.length > 0
        ) {
            const idx = displayPlaylist.findIndex(
                (s) => s.Id === audioState.playingId,
            );

            // If the song is outside the current rendered window, expand the limit
            if (idx !== -1 && idx >= gridLimit) {
                gridLimit = idx + 20; // Ensure it's rendered with a small buffer
            }

            // Tiny timeout to ensure DOM is ready if it was just unhidden or expanded
            setTimeout(() => {
                const el = document.getElementById(
                    `song-card-${audioState.playingId}`,
                );
                if (el) {
                    el.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                }
            }, 100);
        }
    });

    // Auto-fallback locked themes to technicolor_v2
    $effect(() => {
        const isHolidayLocked =
            preferences.glowTheme === "holiday" && !userState.contractId;
        const isHalloweenLocked =
            preferences.glowTheme === "halloween" && !upgradesState.goldenKale;
        const isValentineLocked =
            preferences.glowTheme === "valentine" &&
            !preferences.unlockedThemes.includes("valentine_2026");
        if (isHolidayLocked || isHalloweenLocked || isValentineLocked) {
            preferences.glowTheme = "technicolor_v2";
        }
    });

    // Determine current artist context (for Header/Tipping)
    const currentSong = $derived(audioState.currentSong);
    const currentArtistAddress = $derived(currentSong?.Address);

    // Fetch artist badges for the *current playing artist*
    let artistBadges = $state<{ premiumHeader: boolean; goldenKale: boolean }>({
        premiumHeader: false,
        goldenKale: false,
    });

    $effect(() => {
        if (currentArtistAddress) {
            fetch(`/api/artist/badges/${currentArtistAddress}`)
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    if (data) artistBadges = data;
                    else
                        artistBadges = {
                            premiumHeader: false,
                            goldenKale: false,
                        };
                })
                .catch(() => {
                    artistBadges = { premiumHeader: false, goldenKale: false };
                });
        }
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

    async function hydrateGlobalData() {
        if (isLoadingLive) return;
        isLoadingLive = true;

        try {
            const smols = await safeFetchSmols();
            // Sort by Created_At desc (Newest first)
            smols.sort(
                (a, b) =>
                    new Date(b.Created_At || 0).getTime() -
                    new Date(a.Created_At || 0).getTime(),
            );

            // Limit to avoid OOM on massive lists, but keep enough for discovery
            // Limit to avoid OOM on massive lists, but keep enough for discovery
            liveDiscography = smols;

            // Tags
            const tagCounts: Record<string, number> = {};
            liveDiscography.forEach((smol) => {
                if (smol.Tags && Array.isArray(smol.Tags)) {
                    smol.Tags.forEach((tag) => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                }
            });
            liveTopTags = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map((t) => t[0]);

            isUrlStateLoaded = true; // Data ready

            // Auto-select first song if nothing playing
            if (!audioState.currentSong && liveDiscography.length > 0) {
                selectSong(liveDiscography[0]);
            }
        } catch (e) {
            console.error("[GlobalPlayer] Failed to load data:", e);
        } finally {
            isLoadingLive = false;
        }
    }

    // Deterministic Hash for Seeded Shuffle
    function getShuffleVal(id: string, seed: number) {
        let h = 0xdeadbeef;
        for (let i = 0; i < id.length; i++)
            h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
        h = Math.imul(h ^ seed, 1597334677);
        return (h >>> 0) / 4294967296;
    }

    // Derived playlist
    const basePlaylist = $derived.by(() => {
        let source = [...liveDiscography];

        // Filter Minted Only
        if (activeModule === "minted") {
            source = source.filter((s) => s.Mint_Token);
        }

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            source = source.filter(
                (smol) =>
                    smol.Title?.toLowerCase().includes(query) ||
                    smol.Address?.toLowerCase().includes(query),
            );
        }

        // Tags
        if (selectedTags.length > 0) {
            source = source.filter((smol) =>
                selectedTags.some((t) => smol.Tags?.includes(t)),
            );
        }

        // Sorting
        if (sortMode === "canon") {
            source.sort((a, b) => {
                const dateA = new Date(a.Created_At || 0).getTime();
                const dateB = new Date(b.Created_At || 0).getTime();
                return dateA - dateB;
            });
        } else if (sortMode === "latest") {
            source.sort((a, b) => {
                const dateA = new Date(a.Created_At || 0).getTime();
                const dateB = new Date(b.Created_At || 0).getTime();
                return dateB - dateA;
            });
        }

        return source;
    });

    let shuffledOrder = $state<Smol[]>([]);

    $effect(() => {
        if (basePlaylist.length > 0 && (shuffleEnabled || shuffleSeed)) {
            const playing = untrack(() => currentSong);
            const currentDisp = untrack(() => displayPlaylist);
            let target = untrack(() => currentIndex);

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

            listToShuffle.sort(
                (a, b) =>
                    getShuffleVal(a.Id, shuffleSeed) -
                    getShuffleVal(b.Id, shuffleSeed),
            );
            shuffledOrder = listToShuffle;
        }
    });

    let gridLimit = $state(50);
    const displayPlaylist = $derived.by(() => {
        if (shuffleEnabled && shuffledOrder.length > 0) {
            return shuffledOrder;
        }
        return basePlaylist;
    });
    const visiblePlaylist = $derived(displayPlaylist.slice(0, gridLimit));

    // Scroll Handler
    function handleGridScroll(e: any) {
        const el = e.currentTarget as HTMLElement;
        const { scrollTop, scrollHeight, clientHeight } = el;
        if (scrollHeight - scrollTop - clientHeight < 800) {
            if (gridLimit < displayPlaylist.length) {
                gridLimit += 50;
            }
        }
    }

    // Auto-Scroll to Active Song
    $effect(() => {
        if (displayPlaylist.length > 0 && currentSong) {
            const foundIndex = displayPlaylist.findIndex(
                (s) => s.Id === currentSong.Id,
            );
            if (foundIndex !== -1 && foundIndex !== currentIndex) {
                currentIndex = foundIndex;
            }
        }
    });

    function handleSelect(index: number) {
        currentIndex = index;
        const song = displayPlaylist[index];
        if (song) {
            if (currentSong && currentSong.Id === song.Id) {
                togglePlayPause();
            } else {
                selectSong(song);
            }
        }
    }

    async function handleToggleLike(index: number, liked: boolean) {
        const song = displayPlaylist[index];
        if (!song) return;

        // Optimistic Update
        const liveIdx = liveDiscography.findIndex((s) => s.Id === song.Id);
        if (liveIdx !== -1) {
            liveDiscography[liveIdx] = {
                ...liveDiscography[liveIdx],
                Liked: liked,
            };
        }

        try {
            if (liked) {
                await likeSmol(song.Id);
            } else {
                await unlikeSmol(song.Id);
            }
        } catch (e) {
            console.error("Failed to toggle like", e);
            // Revert
            if (liveIdx !== -1) {
                liveDiscography[liveIdx] = {
                    ...liveDiscography[liveIdx],
                    Liked: !liked,
                };
            }
        }
    }

    function handleNext() {
        if (displayPlaylist.length === 0) return;
        const nextIndex = (currentIndex + 1) % displayPlaylist.length;
        handleSelect(nextIndex);
    }

    function handlePrev() {
        if (displayPlaylist.length === 0) return;
        const prevIndex =
            (currentIndex - 1 + displayPlaylist.length) %
            displayPlaylist.length;
        handleSelect(prevIndex);
    }

    $effect(() => {
        registerSongNextCallback(handleNext);
        registerSongPrevCallback(handlePrev);
        return () => {
            registerSongNextCallback(null);
            registerSongPrevCallback(null);
        };
    });

    function toggleArtistTag(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter((t) => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
    }

    async function generateMix() {
        if (isGeneratingMix || basePlaylist.length === 0) return;
        isGeneratingMix = true;
        shuffleEnabled = true;
        sortMode = "shuffle";
        shuffleSeed = Date.now();
        await tick();
        isGeneratingMix = false;

        if (shuffledOrder.length > 0) {
            const nextIdx = Math.floor(Math.random() * shuffledOrder.length);
            currentIndex = nextIdx;
            selectSong(shuffledOrder[nextIdx]);
        }
    }

    // Minting / Trading
    const mintingHook = useSmolMinting();
    const isMinted = $derived(
        Boolean(currentSong?.Mint_Token && currentSong?.Mint_Amm),
    );

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
                async () => {},
            );
        } catch (e: any) {
            alert(e.message);
        } finally {
            minting = false;
        }
    }

    function copyAddress() {
        if (currentArtistAddress) {
            navigator.clipboard.writeText(currentArtistAddress).then(() => {
                alert("Artist Address copied! Send $KALE to tip.");
            });
        }
    }

    const shortAddress = $derived(
        currentArtistAddress
            ? `${currentArtistAddress.slice(0, 4)}...${currentArtistAddress.slice(-4)}`
            : "Fresh Drops",
    );

    const allTags = $derived(liveTopTags);
    const maxTagCount = $derived(100); // simplify

    // Versions
    const versions = $derived.by(() => {
        if (!currentSong?.kv_do?.songs) return [];
        return currentSong.kv_do.songs.map((s: any, i: number) => ({
            id: s.music_id,
            label: `V${i + 1}`,
            isBest: s.music_id === currentSong.Song_1,
        }));
    });

    // Time Machine: Random Jump + Canon Sort
    async function activateTimeMachine() {
        // 1. Force Canon Mode (Oldest First)
        sortMode = "canon";

        // 2. Wait for reactive list to update
        await tick();

        // 3. Jump to Random Index
        if (displayPlaylist.length > 0) {
            const randomIndex = Math.floor(
                Math.random() * displayPlaylist.length,
            );
            const destinationSong = displayPlaylist[randomIndex];

            // 4. Engage
            handleSelect(randomIndex);

            // 5. Feedback
            const songDate = new Date(destinationSong.Created_At || Date.now());
            alert(
                `⚡ TIME TRAVEL: Transporting to... ${songDate.toLocaleDateString()}`,
            );
        }
    }
</script>

<div
    class="space-y-0 h-full landscape:h-auto landscape:overflow-y-auto md:landscape:h-full md:landscape:overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono"
>
    <!-- Top Header: Dynamic -->
    <div class="relative z-50 max-w-6xl w-full mx-auto group/header">
        <div
            class="w-full border border-white/5 md:rounded-xl rounded-none shadow-xl overflow-hidden py-3 md:py-4 px-3 md:px-4 flex flex-row items-center justify-between gap-1.5 md:gap-4 relative min-h-[140px] z-40"
        >
            <!-- Background Collage -->
            {#if collageImages.length > 0}
                <div
                    class="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden opacity-30"
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
                                    class="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <div
                class="absolute inset-0 z-0 bg-[#0a0a0a]/80 backdrop-blur-[2px]"
            ></div>

            <div
                class="space-y-2 relative z-10 flex-1 min-w-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
            >
                <h1
                    class="text-[9px] font-pixel text-white/40 uppercase tracking-[0.3em]"
                >
                    {#if currentSong}NOW PLAYING{:else}SMOL DISCOVERY{/if}
                </h1>

                <div class="flex flex-col gap-3">
                    {#if currentSong && currentArtistAddress}
                        <button
                            onclick={copyAddress}
                            class="w-full text-lg md:text-3xl lg:text-4xl font-bold tracking-tighter text-white hover:text-[#d836ff] transition-colors flex items-center gap-2 md:gap-3 group/address text-left font-pixel tracking-widest"
                            title="Click to copy artist address"
                        >
                            {shortAddress}
                            <svg
                                class="w-5 h-5 opacity-0 group-hover/address:opacity-100 transition-all text-[#d836ff]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="2"
                                stroke="currentColor"
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
                                if (currentArtistAddress) {
                                    tipArtistAddress = currentArtistAddress;
                                    showTipModal = true;
                                }
                            }}
                            class="w-fit px-5 py-2 rounded-full text-[10px] font-pixel tracking-[0.2em] transition-all flex items-center gap-2 overflow-hidden relative group/tip bg-gradient-to-r from-green-600/20 to-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20"
                        >
                            <img
                                src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                                alt="Kale"
                                class="w-4 h-4 object-contain"
                            />
                            <span>Tip Artist</span>
                        </button>
                    {:else}
                        <h2
                            class="text-lg md:text-3xl lg:text-4xl font-bold tracking-tighter text-white font-pixel tracking-widest"
                        >
                            FRESH DROPS
                        </h2>
                        <p
                            class="text-[10px] font-pixel text-white/50 tracking-wide max-w-sm"
                        >
                            Discover the latest tracks minted on the Smol
                            network.
                        </p>
                    {/if}
                </div>
            </div>

            <!-- Header Right: Player Mini Controls -->
            <div
                class="flex items-center gap-2 relative z-[60] shrink-0 justify-end"
            >
                {#if currentSong}
                    <!-- Mini Player Container -->
                    <div
                        class="flex-col gap-1 bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-xl min-w-[180px] max-w-[280px] {showGridView
                            ? 'flex'
                            : 'hidden md:flex landscape:flex'}"
                    >
                        <!-- Song Title -->
                        <div
                            class="text-[8px] font-pixel text-white truncate px-1 text-center"
                        >
                            {currentSong.Title || "Untitled"}
                        </div>

                        <!-- Progress Scrubber -->
                        <div
                            class="w-full h-1 bg-white/10 rounded-full overflow-hidden"
                        >
                            <div
                                class="h-full bg-[#089981] rounded-full transition-all duration-100"
                                style="width: {audioState.progress}%"
                            ></div>
                        </div>

                        <!-- Controls Row -->
                        <div class="flex items-center justify-center gap-1">
                            <!-- Previous Button -->
                            <button
                                class="w-7 h-7 flex items-center justify-center active:scale-95 transition-all rounded-full text-white/60 hover:text-white"
                                onclick={playPreviousSong}
                            >
                                <svg
                                    class="w-3.5 h-3.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"
                                    />
                                </svg>
                            </button>

                            <!-- Play/Pause Button -->
                            <button
                                class="tech-button w-8 h-8 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-xl border border-[#089981] text-[#089981] bg-[#089981]/10 hover:text-white"
                                onclick={togglePlayPause}
                            >
                                {#if isPlaying()}
                                    <svg
                                        class="w-3.5 h-3.5"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"
                                        /></svg
                                    >
                                {:else}
                                    <svg
                                        class="w-3.5 h-3.5 ml-0.5"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path d="M8 5v14l11-7z" /></svg
                                    >
                                {/if}
                            </button>

                            <!-- Next Button -->
                            <button
                                class="w-7 h-7 flex items-center justify-center active:scale-95 transition-all rounded-full text-white/60 hover:text-white"
                                onclick={playNextSong}
                            >
                                <svg
                                    class="w-3.5 h-3.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- Main Player Card -->
    <div
        class="max-w-6xl w-full mx-auto reactive-glass border border-white/5 backdrop-blur-xl md:rounded-2xl rounded-none shadow-2xl relative flex flex-col flex-1 min-h-0 transition-all duration-700 bg-cover bg-center"
        style={THEMES[preferences.glowTheme].style ||
            "background-color: rgba(29, 29, 29, 0.7);"}
    >
        <!-- Control Bar -->
        <div
            class="relative z-[100] flex items-center border-b border-white/5 bg-black/10 backdrop-blur-xl shrink-0 min-w-0 py-2 px-3 gap-3 landscape:sticky landscape:top-0"
        >
            <!-- Primary Grid Toggle with Rainbow Glow -->
            <button
                onclick={() => (showGridView = !showGridView)}
                class="relative group shrink-0 w-10 h-10 flex items-center justify-center rounded-xl overflow-hidden transition-all active:scale-95 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                title={showGridView ? "Back to Player" : "Grid View"}
            >
                <!-- Rainbow Gradient Background/Border -->
                <div
                    class="absolute inset-[-100%] {THEMES[preferences.glowTheme]
                        .gradient
                        ? `bg-gradient-to-r ${THEMES[preferences.glowTheme].gradient}`
                        : ''} animate-[spin_4s_linear_infinite] opacity-70 group-hover:opacity-100 transition-opacity"
                    style={THEMES[preferences.glowTheme].style || ""}
                ></div>

                <!-- Inner Mask -->
                <div
                    class="absolute inset-[1.5px] bg-[#1a1a1a] rounded-[10px] flex items-center justify-center z-10"
                >
                    {#if showGridView}
                        <svg
                            class="w-5 h-5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="1.5"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H18A2.25 2.25 0 0113.5 18v-2.25z"
                            />
                        </svg>
                    {:else}
                        <svg
                            class="w-5 h-5 text-white/70 group-hover:text-white transition-colors"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="1.5"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H18A2.25 2.25 0 0113.5 18v-2.25z"
                            />
                        </svg>
                    {/if}
                </div>
            </button>

            <div
                class="flex flex-1 items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar min-w-0 relative"
            >
                <div class="flex items-center gap-1 bg-white/5 rounded-lg p-1">
                    <button
                        onclick={() => (activeModule = "all")}
                        class="px-3 py-1.5 rounded-md text-[9px] font-pixel transition-all {activeModule ===
                        'all'
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'text-white/40 hover:text-white hover:bg-white/5'}"
                        >ALL</button
                    >
                    <button
                        onclick={() => (activeModule = "minted")}
                        class="px-3 py-1.5 rounded-md text-[9px] font-pixel transition-all {activeModule ===
                        'minted'
                            ? 'bg-[#d836ff]/20 text-[#d836ff] shadow-[0_0_10px_rgba(216,54,255,0.2)]'
                            : 'text-white/40 hover:text-white hover:bg-white/5'}"
                        >MINTED</button
                    >
                    <button
                        onclick={() => {
                            activeModule = "tags";
                            tagsExpanded = true;
                        }}
                        class="px-3 py-1.5 rounded-md text-[9px] font-pixel transition-all {activeModule ===
                        'tags'
                            ? 'bg-orange-500/20 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                            : 'text-white/40 hover:text-white hover:bg-white/5'}"
                        >TAGS</button
                    >
                </div>

                <div class="flex-1"></div>
            </div>

            {#if activeModule === "tags" && tagsExpanded}
                <div
                    class="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 z-[90] shadow-2xl animate-in slide-in-from-top-2 flex flex-col gap-4"
                >
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <span class="text-[9px] font-pixel text-white/50"
                                >FILTER BY TAGS</span
                            >
                            {#if selectedTags.length > 0}
                                <button
                                    class="text-[9px] font-pixel text-orange-400 hover:text-orange-300 transition-colors"
                                    onclick={() => (selectedTags = [])}
                                    >CLEAR ({selectedTags.length})</button
                                >
                                <!-- Radio Launch Button -->
                                <button
                                    onclick={() => {
                                        navigate(
                                            `/radio?tags=${selectedTags.join(",")}`,
                                        );
                                    }}
                                    class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/50 text-orange-400 text-[9px] font-pixel hover:bg-orange-500/30 transition-all active:scale-95 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
                                >
                                    <svg
                                        class="w-3 h-3"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C6.48 1 2 5.48 2 11h2c0-4.42 3.58-8 8-8s8 3.58 8 8h2c0-5.52-4.48-10-10-10z"
                                        />
                                        <path d="M13 13h-2v10h2V13z" />
                                    </svg>
                                    <span>PLAY RADIO</span>
                                </button>
                            {/if}
                        </div>
                        <button
                            onclick={() => (tagsExpanded = false)}
                            class="text-white/40 hover:text-white"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                ><path
                                    d="M6 18L18 6M6 6l12 12"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                /></svg
                            >
                        </button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        {#each allTags.slice(0, maxTagCount) as tag}
                            <button
                                onclick={() => toggleArtistTag(tag)}
                                class="px-2.5 py-1 rounded-full text-[9px] font-pixel border transition-all duration-300 {selectedTags.includes(
                                    tag,
                                )
                                    ? 'bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.4)]'
                                    : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30 hover:text-white'}"
                            >
                                #{tag}
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            <div class="flex items-center gap-2">
                <!-- AI Settings Toggle -->
                <div class="relative">
                    <button
                        onclick={() => (showSettingsMenu = !showSettingsMenu)}
                        class="w-9 h-9 flex items-center justify-center rounded-lg border border-white/5 transition-colors {showSettingsMenu
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:text-white hover:bg-white/5'}"
                        title="Simulation Settings"
                    >
                        <svg
                            class="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                        </svg>
                    </button>

                    {#if showSettingsMenu}
                        <div
                            class="absolute top-full right-0 mt-2 w-56 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl p-3 z-[100] shadow-2xl animate-in slide-in-from-top-2"
                        >
                            <div class="space-y-4">
                                <!-- Performance Mode -->
                                <div>
                                    <div
                                        class="text-[9px] font-pixel text-white/50 mb-2 px-1 uppercase tracking-widest"
                                    >
                                        Neural Configuration
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <button
                                            onclick={() => {
                                                preferences.renderMode = "fast";
                                            }}
                                            class="w-full flex items-center justify-between p-2 rounded-lg transition-colors {preferences.renderMode ===
                                            'fast'
                                                ? 'bg-white/10 text-white'
                                                : 'text-white/40 hover:text-white hover:bg-white/5'}"
                                        >
                                            <span class="text-[8px] font-pixel"
                                                >fast</span
                                            >
                                            {#if preferences.renderMode === "fast"}
                                                <div
                                                    class="w-1.5 h-1.5 rounded-full bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.5)]"
                                                ></div>
                                            {/if}
                                        </button>
                                        <button
                                            onclick={() => {
                                                preferences.renderMode =
                                                    "thinking";
                                            }}
                                            class="w-full flex items-center justify-between p-2 rounded-lg transition-colors {preferences.renderMode ===
                                            'thinking'
                                                ? 'bg-white/10 text-white'
                                                : 'text-white/40 hover:text-white hover:bg-white/5'}"
                                        >
                                            <span class="text-[8px] font-pixel"
                                                >thinking</span
                                            >
                                            {#if preferences.renderMode === "thinking"}
                                                <div
                                                    class="w-1.5 h-1.5 rounded-full bg-[#d836ff] shadow-[0_0_8px_rgba(216,54,255,0.5)]"
                                                ></div>
                                            {/if}
                                        </button>
                                    </div>
                                </div>

                                <!-- Glow Theme -->
                                <div>
                                    <div
                                        class="text-[9px] font-pixel text-white/50 mb-2 px-1 uppercase tracking-widest"
                                    >
                                        Glow Pattern
                                    </div>
                                    <div
                                        class="grid grid-cols-1 gap-1 max-h-[200px] overflow-y-auto dark-scrollbar pr-1"
                                    >
                                        {#each Object.entries(THEMES) as [key, theme]}
                                            {@const isHolidayLocked =
                                                key === "holiday" &&
                                                !userState.contractId}
                                            {@const isGoldenKaleLocked =
                                                key === "halloween" &&
                                                !upgradesState.goldenKale}
                                            {@const isValentineLocked =
                                                key === "valentine" &&
                                                !preferences.unlockedThemes.includes(
                                                    "valentine_2026",
                                                )}
                                            {@const isLocked =
                                                isHolidayLocked ||
                                                isGoldenKaleLocked ||
                                                isValentineLocked}
                                            <button
                                                disabled={isLocked}
                                                onclick={() => {
                                                    if (!isLocked)
                                                        preferences.glowTheme =
                                                            key as GlowTheme;
                                                }}
                                                class="w-full flex items-center justify-between p-2 rounded-lg transition-colors group/theme {preferences.glowTheme ===
                                                key
                                                    ? 'bg-white/10 text-white'
                                                    : 'text-white/40 hover:text-white hover:bg-white/5'} {isLocked
                                                    ? 'opacity-50 cursor-not-allowed'
                                                    : ''}"
                                            >
                                                <div
                                                    class="flex flex-col items-start"
                                                >
                                                    <span
                                                        class="text-[8px] font-pixel flex items-center gap-2"
                                                    >
                                                        {theme.name}
                                                        {#if key === "halloween"}
                                                            <span
                                                                class="relative inline-flex items-center ml-1"
                                                            >
                                                                <img
                                                                    src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                                                                    class="w-4 h-4 filter sepia-[100%] saturate-[400%] brightness-[1.2] contrast-[1.2] hue-rotate-[5deg]"
                                                                    style="image-rendering: pixelated;"
                                                                    alt="Golden Kale"
                                                                />
                                                                <span
                                                                    class="absolute -top-1 -right-1 text-[8px] text-[#FCF6BA] animate-ping opacity-90"
                                                                    >✦</span
                                                                >
                                                            </span>
                                                        {/if}
                                                        {#if key === "valentine"}
                                                            <span
                                                                class="ml-2 px-1 py-0.5 bg-blue-600 border border-white/50 text-[6px] text-white font-pixel shadow-[2px_2px_0px_#000]"
                                                                >FEB 14</span
                                                            >
                                                        {/if}
                                                        {#if isLocked}
                                                            <svg
                                                                class="w-3 h-3 text-white/30"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    stroke-linecap="round"
                                                                    stroke-linejoin="round"
                                                                    stroke-width="2"
                                                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                                                />
                                                            </svg>
                                                        {/if}
                                                    </span>
                                                    {#if isHolidayLocked}
                                                        <span
                                                            class="text-[8px] text-white/30 uppercase tracking-wide"
                                                            >Sign up to unlock</span
                                                        >
                                                    {/if}
                                                    {#if isGoldenKaleLocked}
                                                        <span
                                                            class="text-[8px] text-amber-400/50 uppercase tracking-wide"
                                                            >Golden Kale holders
                                                            only</span
                                                        >
                                                    {/if}
                                                    {#if key === "valentine" && isLocked}
                                                        <span
                                                            class="text-[8px] text-pink-400/50 uppercase tracking-wide"
                                                            >Limited Time Event</span
                                                        >
                                                    {/if}
                                                </div>
                                                <div
                                                    class="w-3 h-3 rounded-full bg-gradient-to-br {theme.gradient}"
                                                ></div>
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
                <!-- Search Input -->
                <div class="hidden md:flex items-center relative group/search">
                    <svg
                        class="w-3.5 h-3.5 absolute left-3 text-white/30 group-focus-within/search:text-white transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="SEARCH..."
                        class="bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-[10px] w-32 focus:w-48 focus:border-white/30 outline-none transition-all duration-300 text-white font-pixel placeholder:text-white/20"
                    />
                </div>

                <!-- Sort Dropdown -->
                <div class="relative">
                    <button
                        onclick={() => (showSortDropdown = !showSortDropdown)}
                        class="h-9 px-3 flex items-center gap-2 rounded-lg transition-all active:scale-95 text-white/60 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white"
                        title="Sort Order"
                    >
                        <svg
                            class="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="1.5"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
                            />
                        </svg>
                    </button>
                    {#if showSortDropdown}
                        <div
                            class="absolute right-0 top-11 z-[100] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-200"
                        >
                            <button
                                onclick={() => {
                                    sortMode = "latest";
                                    showSortDropdown = false;
                                }}
                                class="w-full text-left px-3 py-2.5 text-[10px] font-pixel hover:bg-white/5 rounded-lg text-white/80 hover:text-white flex items-center gap-2"
                            >
                                <span>LATEST DROPS</span>
                            </button>
                            <button
                                onclick={() => {
                                    sortMode = "canon";
                                    showSortDropdown = false;
                                }}
                                class="w-full text-left px-3 py-2.5 text-[10px] font-pixel hover:bg-white/5 rounded-lg text-white/80 hover:text-white flex items-center gap-2"
                            >
                                <span>OLDEST FIRST</span>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <div
            class="relative flex-1 min-h-0 landscape:min-h-0 landscape:h-auto md:landscape:h-full flex flex-col"
        >
            {#if showGridView}
                <div
                    class="absolute inset-0 z-50 bg-[#121212] p-2 md:p-6 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto dark-scrollbar pb-[env(safe-area-inset-bottom)]"
                    onscroll={handleGridScroll}
                    style="contain: content;"
                >
                    <div
                        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 md:gap-4 pb-20"
                    >
                        {#each visiblePlaylist as song, index (song.Id)}
                            <div
                                role="button"
                                tabindex="0"
                                id="song-card-{song.Id}"
                                class="flex flex-col gap-2 group text-left w-full relative transition-opacity duration-300 {currentSong &&
                                song.Id !== currentSong.Id &&
                                isPlaying()
                                    ? 'opacity-40 hover:opacity-100'
                                    : 'opacity-100'}"
                                style="will-change: transform, opacity;"
                                onclick={() => handleSelect(index)}
                                onkeydown={() => {}}
                            >
                                <!-- Outer Ambient Glow (Disabled in Fast Mode) -->
                                {#if currentSong && song.Id === currentSong.Id && preferences.renderMode === "thinking"}
                                    <div
                                        class="absolute -inset-2 rounded-2xl blur-xl transition-opacity duration-500 animate-[spin_4s_linear_infinite] {THEMES[
                                            preferences.glowTheme
                                        ].gradient
                                            ? `bg-gradient-to-r ${THEMES[preferences.glowTheme].gradient}`
                                            : ''} opacity-50"
                                        style={THEMES[preferences.glowTheme]
                                            .style || ""}
                                    ></div>
                                {/if}

                                <div
                                    class="aspect-square rounded-xl relative overflow-hidden z-10 {preferences.renderMode ===
                                    'thinking'
                                        ? 'shadow-2xl'
                                        : 'shadow-md'}"
                                >
                                    {#if currentSong && song.Id === currentSong.Id && preferences.renderMode === "thinking"}
                                        <!-- Spinning Lightwire (Disabled in Fast Mode) -->
                                        <div
                                            class="absolute inset-[-100%] {THEMES[
                                                preferences.glowTheme
                                            ].gradient
                                                ? `bg-gradient-to-r ${THEMES[preferences.glowTheme].gradient}`
                                                : ''} transition-opacity duration-500 animate-[spin_4s_linear_infinite] opacity-100"
                                            style={THEMES[preferences.glowTheme]
                                                .style || ""}
                                        ></div>
                                    {/if}

                                    <!-- Content Mask -->
                                    <div
                                        class="absolute bg-slate-800 overflow-hidden transition-all duration-300 {currentSong &&
                                        song.Id === currentSong.Id
                                            ? 'inset-[2px] rounded-[10px]'
                                            : 'inset-0 rounded-xl border border-white/10 group-hover:border-lime-500/50'}"
                                    >
                                        <img
                                            src="{API_URL}/image/{song.Id}.png?scale=8"
                                            alt={song.Title}
                                            class="w-full h-full object-cover transition-transform duration-500 bg-slate-800 {preferences.renderMode ===
                                            'thinking'
                                                ? 'group-hover:scale-110'
                                                : ''}"
                                            loading="lazy"
                                        />
                                        {#if currentSong && song.Id === currentSong.Id && preferences.renderMode === "thinking"}
                                            <div
                                                class="absolute inset-0 flex items-center justify-center z-10"
                                            >
                                                <MiniVisualizer />
                                            </div>
                                        {/if}

                                        <!-- Game Controller Overlay (Active Song) -->
                                        {#if currentSong && song.Id === currentSong.Id}
                                            <div
                                                class="absolute inset-0 z-30 bg-transparent cursor-pointer opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300"
                                                role="button"
                                                tabindex="0"
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    togglePlayPause();
                                                }}
                                                onkeydown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.stopPropagation();
                                                        togglePlayPause();
                                                    }
                                                }}
                                            >
                                                <div
                                                    class="w-full h-full relative pointer-events-none"
                                                >
                                                    <!-- Share Button (Bottom Center) -->
                                                    <button
                                                        class="absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/10 border-2 border-[#d836ff] text-[#d836ff] hover:bg-[#d836ff] hover:text-white transition-all active:scale-95 pointer-events-auto {preferences.renderMode ===
                                                        'thinking'
                                                            ? 'shadow-[0_0_15px_rgba(216,54,255,0.3)]'
                                                            : ''}"
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            const url = `${window.location.origin}/${song.Id}`;
                                                            navigator.clipboard.writeText(
                                                                url,
                                                            );
                                                            alert(
                                                                "Link copied to clipboard!",
                                                            );
                                                        }}
                                                        title="Share"
                                                    >
                                                        <svg
                                                            class="w-3.5 h-3.5"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            stroke-width="2"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
                                                            />
                                                        </svg>
                                                    </button>

                                                    <!-- Top Left: Artist -->
                                                    <div
                                                        role="button"
                                                        class="absolute top-2 left-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-green-500 text-green-500 hover:bg-green-500 hover:text-white transition-all active:scale-95 pointer-events-auto {preferences.renderMode ===
                                                        'thinking'
                                                            ? 'shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                                            : ''}"
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(
                                                                `/artist/${song.Address}`,
                                                            );
                                                        }}
                                                        onkeydown={() => {}}
                                                        title="View Artist"
                                                    >
                                                        <svg
                                                            class="w-4 h-4"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            stroke-width="2"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                                                            />
                                                        </svg>
                                                    </div>

                                                    <!-- Top Right: Radio -->
                                                    <div
                                                        role="button"
                                                        class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-all active:scale-95 pointer-events-auto {preferences.renderMode ===
                                                        'thinking'
                                                            ? 'shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                                                            : ''}"
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(buildRadioUrl(song));
                                                        }}
                                                        onkeydown={() => {}}
                                                        title="Start Radio"
                                                    >
                                                        <svg
                                                            class="w-4 h-4"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            stroke-width="2"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.789M12 12h.008v.008H12V12z"
                                                            />
                                                        </svg>
                                                    </div>

                                                    <!-- Bottom Left: Like -->
                                                    <div
                                                        class="absolute bottom-2 left-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95 pointer-events-auto {preferences.renderMode ===
                                                        'thinking'
                                                            ? 'shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                                                            : ''}"
                                                        role="button"
                                                        tabindex="0"
                                                        onclick={(e) =>
                                                            e.stopPropagation()}
                                                        onkeydown={() => {}}
                                                    >
                                                        <LikeButton
                                                            smolId={song.Id}
                                                            liked={song.Liked ||
                                                                false}
                                                            classNames="w-full h-full flex items-center justify-center"
                                                            iconSize="size-4"
                                                            on:likeChanged={(
                                                                e,
                                                            ) => {
                                                                handleToggleLike(
                                                                    index,
                                                                    e.detail
                                                                        .liked,
                                                                );
                                                            }}
                                                        />
                                                    </div>

                                                    <!-- Bottom Right: Song Detail -->
                                                    <div
                                                        role="button"
                                                        class="absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-[#d836ff] text-[#d836ff] hover:bg-[#d836ff] hover:text-white transition-all active:scale-95 pointer-events-auto {preferences.renderMode ===
                                                        'thinking'
                                                            ? 'shadow-[0_0_15px_rgba(216,54,255,0.3)]'
                                                            : ''}"
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(
                                                                `/${song.Id}?from=artist`,
                                                            );
                                                        }}
                                                        onkeydown={() => {}}
                                                        title="View Song"
                                                    >
                                                        <svg
                                                            class="w-4 h-4"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            stroke-width="2"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163z"
                                                            />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </div>
                                        {/if}

                                        <!-- Passive Hover Controls (For non-active songs) -->
                                        {#if !currentSong || song.Id !== currentSong.Id}
                                            <!-- Top Left: Artist Profile -->
                                            <div
                                                role="button"
                                                class="absolute top-2 left-2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 border border-green-500/50 text-green-400 hover:bg-green-500/20 transition-all active:scale-95 cursor-pointer opacity-0 group-hover:opacity-100 duration-300 {preferences.renderMode ===
                                                'thinking'
                                                    ? 'backdrop-blur-md shadow-[0_0_10px_rgba(34,197,94,0.3)] hover:shadow-[0_0_15px_rgba(34,197,94,0.5)]'
                                                    : ''}"
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(
                                                        `/artist/${song.Address}`,
                                                    );
                                                }}
                                                onkeydown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.stopPropagation();
                                                        navigate(
                                                            `/artist/${song.Address}`,
                                                        );
                                                    }
                                                }}
                                                title="View Artist Profile"
                                            >
                                                <svg
                                                    class="w-4 h-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    stroke-width="1.5"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                                                    />
                                                </svg>
                                            </div>

                                            <!-- Top Right: Send to Radio -->
                                            <div
                                                role="button"
                                                class="absolute top-2 right-2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 border border-orange-500/50 text-orange-400 hover:bg-orange-500/20 transition-all active:scale-95 cursor-pointer opacity-0 group-hover:opacity-100 duration-300 {preferences.renderMode ===
                                                'thinking'
                                                    ? 'backdrop-blur-md shadow-[0_0_10px_rgba(249,115,22,0.3)] hover:shadow-[0_0_15px_rgba(249,115,22,0.5)]'
                                                    : ''}"
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(buildRadioUrl(song));
                                                }}
                                                onkeydown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.stopPropagation();
                                                        navigate(buildRadioUrl(song));
                                                    }
                                                }}
                                                title="Start Artist Radio"
                                            >
                                                <svg
                                                    class="w-4 h-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    stroke-width="1.5"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
                                                    />
                                                </svg>
                                            </div>

                                            <!-- Bottom Left: Like Button -->
                                            <div
                                                class="absolute bottom-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                                onclick={(e) =>
                                                    e.stopPropagation()}
                                            >
                                                <LikeButton
                                                    smolId={song.Id}
                                                    liked={song.Liked || false}
                                                    classNames="p-1.5 rounded-full bg-black/40 border border-[#FF424C]/50 text-[#FF424C] hover:bg-[#FF424C]/20 transition-all active:scale-95 {preferences.renderMode ===
                                                    'thinking'
                                                        ? 'backdrop-blur-md shadow-[0_0_10px_rgba(255,66,76,0.3)] hover:shadow-[0_0_15px_rgba(255,66,76,0.5)]'
                                                        : ''}"
                                                    iconSize="size-4"
                                                    on:likeChanged={(e) => {
                                                        handleToggleLike(
                                                            index,
                                                            e.detail.liked,
                                                        );
                                                    }}
                                                />
                                            </div>

                                            <!-- Bottom Right: Song Detail -->
                                            <div
                                                role="button"
                                                class="absolute bottom-2 right-2 z-20 tech-button w-8 h-8 flex items-center justify-center rounded-full bg-black/40 border border-[#d836ff]/50 text-[#d836ff] hover:bg-[#d836ff]/20 transition-all active:scale-95 cursor-pointer opacity-0 group-hover:opacity-100 duration-300 {preferences.renderMode ===
                                                'thinking'
                                                    ? 'backdrop-blur-md shadow-[0_0_10px_rgba(216,54,255,0.3)] hover:shadow-[0_0_15px_rgba(216,54,255,0.5)]'
                                                    : ''}"
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
                                        {/if}
                                    </div>
                                </div>
                                <span
                                    class="text-[9px] font-pixel text-white/60 truncate group-hover:text-white transition-colors"
                                >
                                    {song.Title || "Untitled"}
                                </span>
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
                <div
                    class="w-full landscape:w-1/2 lg:w-1/2 flex flex-col gap-0 min-h-0 relative z-[41] shrink-0"
                >
                    <RadioPlayer
                        playlist={displayPlaylist}
                        showSongDetailButton={false}
                        onRegenerate={generateMix}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        onSelect={handleSelect}
                        onTrade={isMinted
                            ? () => {
                                  if (!userState.contractId) triggerLogin();
                                  else showTradeModal = true;
                              }
                            : undefined}
                        onMint={!isMinted ? triggerMint : undefined}
                        isMinting={minting}
                        isAuthenticated={userState.contractId !== null}
                        {currentIndex}
                        overlayControls={true}
                        {versions}
                        currentVersionId={selectedVersionId || ""}
                        onVersionSelect={(id) => {
                            selectedVersionId = id;
                            if (currentSong)
                                selectSong({ ...currentSong, Song_1: id });
                        }}
                    />
                </div>

                <div
                    class="w-full landscape:w-1/2 lg:w-1/2 flex flex-col min-h-0 mt-1 landscape:mt-0 lg:mt-0 bg-[#121212] border border-white/5 rounded-2xl relative flex-1 max-h-[50vh] landscape:max-h-full lg:max-h-full overflow-y-auto dark-scrollbar z-[40]"
                >
                    <div
                        class="flex items-center justify-between p-3 border-b border-white/5 bg-[#1a1a1a] flex-shrink-0"
                    >
                        <h3
                            class="text-white font-pixel tracking-wide uppercase text-[9px]"
                        >
                            Playlist ({displayPlaylist.length})
                        </h3>
                        <div class="flex items-center gap-2">
                            <button
                                onclick={activateTimeMachine}
                                class="flex flex-col items-end group/clock cursor-pointer"
                                title="Time Machine: Random Jump in History"
                            >
                                <span
                                    class="text-[10px] md:text-xs font-pixel tracking-widest tabular-nums text-lime-400 drop-shadow-[0_0_5px_rgba(163,230,53,0.5)] group-hover/clock:text-white transition-colors animate-pulse"
                                    >{timeString}</span
                                >
                                <span
                                    class="text-[6px] font-pixel text-lime-600/60 uppercase tracking-tight group-hover/clock:text-lime-400"
                                >
                                    {#if sortMode === "canon"}TIME TRAV
                                    {:else}PRESENT DAY{/if}
                                </span>
                            </button>
                        </div>
                    </div>

                    <ul class="divide-y divide-white/5">
                        {#each displayPlaylist.slice(0, 100) as song, index}
                            <li
                                class="w-full flex items-center gap-4 p-3 hover:bg-white/[0.07] transition-all cursor-pointer {index ===
                                currentIndex
                                    ? 'bg-lime-500/15 border-l-4 border-lime-500'
                                    : 'border-l-4 border-transparent'}"
                                onclick={() => handleSelect(index)}
                            >
                                <span
                                    class="text-white/20 w-4 text-center text-[9px] font-pixel"
                                    >{index + 1}</span
                                >
                                <div
                                    class="relative w-10 h-10 rounded-lg bg-slate-800 flex-shrink-0 overflow-hidden"
                                >
                                    <img
                                        src="{API_URL}/image/{song.Id}.png?scale=8"
                                        alt="Art"
                                        class="w-full h-full object-cover"
                                        loading="lazy"
                                    />
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
                                        class="text-[7px] text-white/30 truncate font-pixel uppercase"
                                    >
                                        {song.Address
                                            ? `${song.Address.slice(0, 4)}...${song.Address.slice(-4)}`
                                            : "Unknown"}
                                    </div>
                                </div>
                            </li>
                        {/each}
                    </ul>
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
        on:complete={() => (showTradeModal = false)}
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

<style>
    @keyframes sparkle {
        0%,
        100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.6;
            transform: scale(1.1);
        }
    }
    .animate-sparkle {
        animation: sparkle 1.5s ease-in-out infinite;
    }
</style>
