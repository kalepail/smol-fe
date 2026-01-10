<script lang="ts">
    import { onMount, untrack } from "svelte";
    import type {
        MixtapeSummary,
        MixtapeDetail,
    } from "../../services/api/mixtapes";
    import { getMixtapeDetail } from "../../services/api/mixtapes";
    import {
        audioState,
        togglePlayPause,
        selectSong,
        registerSongNextCallback,
    } from "../../stores/audio.svelte";
    import { useMixtapePlayback } from "../../hooks/useMixtapePlayback";
    import type { Smol } from "../../types/domain";
    import Loader from "../ui/Loader.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import MixtapeSupportBanner from "./MixtapeSupportBanner.svelte";
    import { navigate } from "astro:transitions/client";
    import { userState } from "../../stores/user.svelte";
    import { preferences, THEMES } from "../../stores/preferences.svelte";
    import { buildRadioUrl } from "../../utils/radio";
    import { safeFetchSmols } from "../../services/api/smols";
    import { fade } from "svelte/transition";

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

    interface Props {
        mixtapes?: MixtapeSummary[];
    }

    let { mixtapes = [] }: Props = $props();

    // Playback State
    let loadingMixtapeId = $state<string | null>(null);
    let activeMixtapeId = $state<string | null>(null);
    let mixtapeTracks = $state<Smol[]>([]);
    let currentTrackIndex = $state(-1);
    let isPlayingAll = $state(false);

    // Support modal state
    let showSupportModal = $state(false);
    let activeMixtapeCurator = $state<string | null>(null);
    let supportModalDismissed = $state<Set<string>>(new Set());

    // Snapshot state for minting detection
    let snapshotCache = $state<Smol[]>([]);
    let isSnapshotLoading = $state(false);

    // Derived State
    const isAnyPlaying = $derived(
        audioState.playingId !== null && audioState.currentSong !== null,
    );

    // Slideshow state for active mixtape
    let activeSlideIndex = $state(0);
    let slideInterval: any = null;

    $effect(() => {
        if (activeMixtapeId && mixtapeTracks.length > 0) {
            slideInterval = setInterval(() => {
                activeSlideIndex =
                    (activeSlideIndex + 1) % mixtapeTracks.length;
            }, 3000);
        } else {
            if (slideInterval) clearInterval(slideInterval);
            activeSlideIndex = 0;
        }
        return () => {
            if (slideInterval) clearInterval(slideInterval);
        };
    });

    // Initialize playback hook
    const playbackHook = useMixtapePlayback({
        get mixtapeTracks() {
            return mixtapeTracks;
        },
        get currentTrackIndex() {
            return currentTrackIndex;
        },
        get isPlayingAll() {
            return isPlayingAll;
        },
        onTrackIndexChange: (index: number) => {
            currentTrackIndex = index;
        },
        onPlayingAllChange: (playing: boolean) => {
            isPlayingAll = playing;
        },
    });

    async function loadTracksForMixtape(
        mixtapeId: string,
        autoResetLoading = true,
    ) {
        if (activeMixtapeId === mixtapeId && mixtapeTracks.length > 0) {
            return { mixtapeTracks, creator: activeMixtapeCurator };
        }

        loadingMixtapeId = mixtapeId;
        try {
            const detail = await getMixtapeDetail(mixtapeId);
            if (!detail) throw new Error("Mixtape not found");

            const snapshot = await safeFetchSmols();
            const snapshotMap = new Map(snapshot.map((s) => [s.Id, s]));

            activeMixtapeId = mixtapeId;
            activeMixtapeCurator = detail.creator;

            mixtapeTracks = detail.tracks.map((t) => {
                const snapshotTrack = snapshotMap.get(t.Id);
                return {
                    Id: t.Id,
                    Title: t.Title,
                    Address: t.Address || snapshotTrack?.Address,
                    Song_1: t.Song_1 || snapshotTrack?.Song_1,
                    Mint_Token: t.Mint_Token,
                    Mint_Amm: t.Mint_Amm,
                    Minted_By: t.Minted_By || snapshotTrack?.Minted_By,
                } as Smol;
            });

            return { mixtapeTracks, creator: detail.creator };
        } catch (err) {
            console.error("Failed to load mixtape tracks:", err);
            throw err;
        } finally {
            if (autoResetLoading) {
                loadingMixtapeId = null;
            }
        }
    }

    async function handlePlayToggle(mixtapeId: string) {
        if (activeMixtapeId === mixtapeId && mixtapeTracks.length > 0) {
            togglePlayPause();
            return;
        }

        try {
            // Pass false to keep loading state active until we start playback
            // This prevents the effect from clearing state before the new song is ready
            const detail = await loadTracksForMixtape(mixtapeId, false);

            // Show support modal if not dismissed and not the creator
            if (
                !supportModalDismissed.has(mixtapeId) &&
                userState.contractId !== detail.creator
            ) {
                showSupportModal = true;
            }

            // Setup audio state for the first track
            playbackHook.handlePlayAll();
            isPlayingAll = true;
        } catch (err) {
            alert("failed to load mixtape tracks. please try again.");
        } finally {
            // Now safe to clear loading state
            loadingMixtapeId = null;
        }
    }

    async function handleMintClick(e: MouseEvent, mixtapeId: string) {
        e.stopPropagation();
        e.preventDefault();

        try {
            await loadTracksForMixtape(mixtapeId);
            showSupportModal = true;
        } catch (err) {
            alert("failed to load tracks for minting. please try again.");
        }
    }

    function handleNext(e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();
        playbackHook.playNext();
    }

    function handlePrev(e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();
        playbackHook.playPrevious();
    }

    // Register callback for auto-playing next track
    $effect(() => {
        if (activeMixtapeId) {
            registerSongNextCallback(playbackHook.playNext);
        }
        return () => {
            if (activeMixtapeId) registerSongNextCallback(null);
        };
    });

    async function fetchSnapshot() {
        if (snapshotCache.length > 0) return snapshotCache;
        isSnapshotLoading = true;
        try {
            const snapshot = await safeFetchSmols(true);
            snapshotCache = snapshot;
            return snapshot;
        } catch (err) {
            console.error("Failed to fetch smol snapshot:", err);
            return [];
        } finally {
            isSnapshotLoading = false;
        }
    }

    onMount(() => {
        fetchSnapshot();
    });

    const mintedTracksMap = $derived(
        new Map(
            snapshotCache
                .filter((s) => s.Mint_Token && s.Mint_Amm)
                .map((s) => [s.Id, true]),
        ),
    );

    function isMixtapeMinted(mixtape: MixtapeSummary) {
        if (!mixtape.smolIds) return false;
        return mixtape.smolIds.some((id) => mintedTracksMap.has(id));
    }

    function handleTradeClick(e: MouseEvent, mixtapeId: string) {
        e.stopPropagation();
        e.preventDefault();
        navigate(`/mixtapes/${mixtapeId}`);
    }

    // Sync active state with global audio player
    $effect(() => {
        // If we are currently loading, do not interfere with state
        if (loadingMixtapeId) return;

        if (audioState.currentSong) {
            // If the current song is NOT from our current tracks list, clear active mixtape
            const isOurTrack = mixtapeTracks.some(
                (t) => t.Id === audioState.currentSong?.Id,
            );
            if (!isOurTrack && activeMixtapeId) {
                untrack(() => {
                    activeMixtapeId = null;
                    mixtapeTracks = [];
                    currentTrackIndex = -1;
                    isPlayingAll = false;
                });
            }
        }
    });
</script>

<div
    class="grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 place-items-center"
>
    {#each mixtapes as mixtape (mixtape.id)}
        {@const isActive = activeMixtapeId === mixtape.id}
        {@const isLoading = loadingMixtapeId === mixtape.id}
        {@const isPlaying = isActive && audioState.playingId !== null}

        <article
            class="group flex flex-col rounded-xl md:rounded-[1.2rem] border p-2 md:p-4 shadow-2xl transition-all duration-500 mx-auto w-full max-w-[400px] relative
            {isActive
                ? 'border-white/20 bg-[#111] shadow-[0_0_50px_rgba(255,255,255,0.15)] ring-1 ring-white/10'
                : 'border-white/5 bg-black/40 backdrop-blur-md hover:bg-black/60 hover:-translate-y-1'}"
            onclick={() => handlePlayToggle(mixtape.id)}
        >
            <!-- HDR Arcade Button Glow (Razor Thin Rainbow) -->
            {#if isActive && !isLoading}
                <!-- Intense Tight HDR Glow -->
                <div
                    class="absolute -inset-2 rounded-xl md:rounded-[1.5rem] blur-[15px] opacity-90 animate-color-cycle pointer-events-none z-0 saturate-150 brightness-125 {THEMES[
                        preferences.glowTheme
                    ].gradient
                        ? `bg-gradient-to-r ${THEMES[preferences.glowTheme].gradient}`
                        : ''}"
                    style={THEMES[preferences.glowTheme].style || ""}
                ></div>

                <!-- Razor-thin HDR Rainbow Border -->
                <div
                    class="absolute -inset-[1px] rounded-xl md:rounded-[1.5rem] animate-color-cycle pointer-events-none z-0 shadow-[0_0_20px_rgba(255,255,255,0.4)] saturate-150 brightness-150 {THEMES[
                        preferences.glowTheme
                    ].gradient
                        ? `bg-gradient-to-r ${THEMES[preferences.glowTheme].gradient}`
                        : ''} p-[1px]"
                    style={THEMES[preferences.glowTheme].style || ""}
                >
                    <div
                        class="h-full w-full rounded-xl md:rounded-[1.5rem] bg-[#111]"
                    ></div>
                </div>
            {/if}

            <!-- Main Content Container (Hardware Look) -->
            <div
                class="relative flex flex-col gap-3 p-3 rounded-xl md:rounded-[1.5rem] bg-[#111] border transition-all duration-300 group z-10
                {isActive
                    ? 'border-transparent shadow-[0_0_40px_rgba(255,255,255,0.05)]'
                    : 'border-white/10 hover:border-white/20 shadow-2xl backdrop-blur-md bg-black/40'}"
            >
                <!-- Cover Visualization (Hardware Overlay) -->
                <div
                    class="relative grid grid-cols-2 grid-rows-2 gap-[1px] rounded-lg md:rounded-2xl overflow-hidden border border-white/20 bg-black/60 shadow-inner isolate cursor-pointer
                    {isActive ? 'border-white/40' : ''}"
                    onclick={(e) => {
                        e.stopPropagation();
                        handlePlayToggle(mixtape.id);
                    }}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            handlePlayToggle(mixtape.id);
                        }
                    }}
                >
                    {#each Array.from({ length: 4 }) as _, index}
                        <div
                            class="aspect-square bg-slate-900 relative z-20 overflow-hidden"
                        >
                            {#if mixtape.coverUrls[index]}
                                <img
                                    src={`${mixtape.coverUrls[index]}${mixtape.coverUrls[index]?.includes("?") ? "" : "?scale=4"}`}
                                    alt={mixtape.title}
                                    class="h-full w-full object-cover transition-all duration-700
                                    {isActive
                                        ? 'opacity-20 grayscale'
                                        : 'opacity-80 group-hover:opacity-100'}"
                                    loading="lazy"
                                />
                            {:else}
                                <div
                                    class="flex h-full w-full items-center justify-center text-[10px] font-pixel text-slate-800 uppercase tracking-tighter"
                                >
                                    SMOL
                                </div>
                            {/if}
                        </div>
                    {/each}

                    <!-- Center Hardware Player Overlay (Slideshow) -->
                    {#if isActive || isLoading}
                        <div
                            class="absolute inset-0 flex flex-col items-center justify-center bg-[#111]/80 backdrop-blur-sm transition-all duration-500 z-30
                            {isLoading ? 'opacity-90' : 'opacity-100'}"
                        >
                            {#if isLoading}
                                <Loader classNames="w-8 h-8 text-white" />
                            {:else}
                                <!-- Collage / Slideshow Background (Cross-fade Effect) -->
                                {#if mixtapeTracks.length > 0}
                                    <div
                                        class="absolute inset-0 z-0 overflow-hidden"
                                    >
                                        {#each mixtapeTracks as track, i}
                                            <div
                                                class="absolute inset-0 transition-opacity duration-[1500ms] flex items-center justify-center
                                                {i === activeSlideIndex
                                                    ? 'opacity-50'
                                                    : 'opacity-0'}"
                                            >
                                                <img
                                                    src={`${API_URL}/image/${track.Id}.png?scale=8`}
                                                    alt=""
                                                    class="h-full w-full object-cover saturate-150 brightness-110"
                                                    onerror={(e) => {
                                                        const target =
                                                            e.target as HTMLImageElement;
                                                        if (
                                                            !target.src.includes(
                                                                "placeholder",
                                                            )
                                                        ) {
                                                            target.src = `https://api.smol.xyz/smols/${track.Id}/image?scale=8`;
                                                        }
                                                    }}
                                                />
                                            </div>
                                        {/each}
                                        <!-- Vignette and Glow Overlay -->
                                        <div
                                            class="absolute inset-0 bg-gradient-to-t from-[#111] via-[#111]/40 to-transparent opacity-90"
                                        ></div>
                                        <div
                                            class="absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.9)]"
                                        ></div>
                                    </div>
                                {/if}

                                <div
                                    class="relative z-10 flex flex-col items-stretch h-full w-full p-4 overflow-hidden"
                                >
                                    <!-- TOP OVERLAYS -->
                                    <div
                                        class="flex justify-between items-start w-full relative z-20"
                                    >
                                        <!-- Top Left Title Info (Pixel Font) -->
                                        {#if mixtapeTracks[currentTrackIndex]}
                                            <div
                                                class="flex flex-col gap-0.5 max-w-[65%] pointer-events-none"
                                            >
                                                <div
                                                    class="text-[10px] md:text-xs font-pixel font-bold tracking-tight uppercase text-white drop-shadow-md line-clamp-2"
                                                    style="image-rendering: pixelated; text-shadow: 1px 1px 0px rgba(0,0,0,0.8);"
                                                >
                                                    {mixtapeTracks[
                                                        currentTrackIndex
                                                    ].Title}
                                                </div>
                                                <div
                                                    class="text-[7px] md:text-[8px] text-[#9ae600] font-pixel font-black tracking-widest truncate uppercase opacity-80"
                                                >
                                                    SMOL MIX
                                                </div>
                                            </div>
                                        {/if}

                                        <!-- Top Right Hardware Navigation Buttons -->
                                        {#if mixtapeTracks[currentTrackIndex]}
                                            <div
                                                class="flex flex-col gap-2 scale-75 origin-top-right"
                                            >
                                                <!-- Radio Generator (Amber) -->
                                                <button
                                                    class="tech-button w-8 h-8 flex items-center justify-center rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)] transition-all active:scale-95"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(buildRadioUrl(mixtapeTracks[currentTrackIndex]));
                                                    }}
                                                    title="Start Radio"
                                                >
                                                    <svg
                                                        class="w-3.5 h-3.5"
                                                        fill="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C6.48 1 2 5.48 2 11h2c0-4.42 3.58-8 8-8s8 3.58 8 8h2c0-5.52-4.48-10-10-10z"
                                                        />
                                                        <path
                                                            d="M13 13h-2v10h2V13z"
                                                        />
                                                    </svg>
                                                </button>

                                                <!-- Song Details (Pink) -->
                                                <button
                                                    class="tech-button w-8 h-8 flex items-center justify-center rounded-full bg-[#d836ff]/10 hover:bg-[#d836ff]/20 border border-[#d836ff]/30 text-[#d836ff] shadow-[0_0_10px_rgba(216,54,255,0.2)] transition-all active:scale-95"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(
                                                            `/${mixtapeTracks[currentTrackIndex].Id}?from=mixtapes`,
                                                        );
                                                    }}
                                                    title="Song Details"
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
                                                </button>

                                                <!-- Artist Profile (Lime) -->
                                                <button
                                                    class="tech-button w-8 h-8 flex items-center justify-center rounded-full bg-[#9ae600]/10 hover:bg-[#9ae600]/20 border border-[#9ae600]/30 text-[#9ae600] shadow-[0_0_10px_rgba(154,230,0,0.2)] transition-all active:scale-95"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(
                                                            `/artist/${mixtapeTracks[currentTrackIndex].Address}`,
                                                        );
                                                    }}
                                                    title="Artist Profile"
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
                                                </button>
                                            </div>
                                        {/if}
                                    </div>

                                    <!-- CENTER CONTROLS -->
                                    <div
                                        class="flex-1 flex flex-col items-center justify-center"
                                    >
                                        <div
                                            class="flex items-center gap-4 scale-75 mt-2"
                                        >
                                            <button
                                                class="tech-button p-2.5 rounded-full bg-black/40 border border-white/5 text-white/50 hover:text-white hover:border-white/20 hover:scale-110 transition-all active:scale-95 backdrop-blur-md"
                                                onclick={handlePrev}
                                                title="Previous Track"
                                            >
                                                <svg
                                                    class="size-4"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        d="M6 6h2v12H6zm3.5 6l8.5 6V6z"
                                                    />
                                                </svg>
                                            </button>

                                            <button
                                                class="tech-button p-4 rounded-full border border-[#089981] text-[#089981] bg-[#089981]/10 shadow-[0_0_30px_rgba(8,153,129,0.4)] hover:bg-[#089981]/20 hover:text-white hover:shadow-[0_0_40px_rgba(8,153,129,0.6)] transition-all active:scale-90 relative overflow-hidden group backdrop-blur-xl"
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    togglePlayPause();
                                                }}
                                                title={isPlaying
                                                    ? "Pause"
                                                    : "Play"}
                                            >
                                                {#if isPlaying}
                                                    <svg
                                                        class="size-6"
                                                        fill="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"
                                                        />
                                                    </svg>
                                                {:else}
                                                    <svg
                                                        class="size-6 ml-0.5"
                                                        fill="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            d="M8 5v14l11-7z"
                                                        />
                                                    </svg>
                                                {/if}
                                            </button>

                                            <button
                                                class="tech-button p-2.5 rounded-full bg-black/40 border border-white/5 text-white/50 hover:text-white hover:border-white/20 hover:scale-110 transition-all active:scale-95 backdrop-blur-md"
                                                onclick={handleNext}
                                                title="Next Track"
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
                                    </div>

                                    <!-- BOTTOM OVERLAYS -->
                                    <div
                                        class="flex justify-end items-end w-full relative z-20"
                                    >
                                        <!-- Bottom Right Like Button -->
                                        {#if mixtapeTracks[currentTrackIndex]}
                                            <div
                                                class="scale-75 origin-bottom-right"
                                            >
                                                <LikeButton
                                                    smolId={mixtapeTracks[
                                                        currentTrackIndex
                                                    ].Id}
                                                    liked={audioState
                                                        .currentSong?.Id ===
                                                    mixtapeTracks[
                                                        currentTrackIndex
                                                    ].Id
                                                        ? audioState.currentSong
                                                              .Liked
                                                        : false}
                                                    classNames="tech-button w-10 h-10 flex items-center justify-center active:scale-95 border rounded-full backdrop-blur-md transition-all duration-300 border-[#ff424c] shadow-[0_0_15px_rgba(255,66,76,0.2)] bg-[#ff424c]/10 text-[#ff424c] hover:bg-[#ff424c]/20"
                                                />
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <div
                    class="mt-1 flex flex-col gap-2 relative z-10"
                    onclick={(e) => e.stopPropagation()}
                >
                    <div class="flex justify-between items-start gap-2">
                        <a href={`/mixtapes/${mixtape.id}`} class="min-w-0">
                            <h3
                                class="text-[10px] md:text-xs font-pixel font-bold uppercase tracking-tight transition-colors line-clamp-2
                                {isActive ? 'text-white' : 'text-lime-400'}"
                            >
                                {mixtape.title}
                            </h3>
                        </a>
                        <span
                            class="shrink-0 text-[8px] font-pixel text-[#d836ff] font-bold uppercase tracking-tighter"
                            >{mixtape.trackCount} TRK</span
                        >
                    </div>
                    <p
                        class="line-clamp-2 text-[9px] font-pixel uppercase leading-tight text-slate-500/80"
                    >
                        {mixtape.description}
                    </p>
                </div>

                <div class="mt-auto flex flex-col gap-1.5 pt-3 relative z-10">
                    {#if isMixtapeMinted(mixtape)}
                        <button
                            class="w-full rounded-xl px-2 py-3 text-[9px] font-pixel font-bold uppercase tracking-widest transition-all duration-500 bg-[#2775ca] border border-[#2775ca] text-white hover:bg-[#3b82f6] hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:cursor-wait"
                            onclick={(e) => handleTradeClick(e, mixtape.id)}
                            disabled={isLoading}
                        >
                            Trade
                        </button>
                    {:else}
                        <button
                            class="w-full rounded-xl px-2 py-3 text-[9px] font-pixel font-bold uppercase tracking-widest transition-all duration-500 bg-[#d836ff] border border-[#d836ff] text-white hover:bg-[#e056ff] hover:shadow-[0_0_20px_rgba(216,54,255,0.4)] disabled:opacity-50 disabled:cursor-wait"
                            onclick={(e) => handleMintClick(e, mixtape.id)}
                            disabled={isLoading}
                        >
                            {#if isLoading}
                                <div
                                    class="flex items-center justify-center gap-1.5"
                                >
                                    <Loader classNames="w-3 h-3 text-white" />
                                    Loading...
                                </div>
                            {:else}
                                Mint
                            {/if}
                        </button>
                    {/if}

                    <a
                        class="w-full rounded-xl border border-white/5 bg-black/40 px-2 py-2 text-center text-[8px] font-pixel uppercase tracking-widest text-white/30 hover:text-white hover:bg-white/5 transition-all outline-none"
                        href={`/mixtapes/${mixtape.id}`}
                        onclick={(e) => e.stopPropagation()}
                    >
                        Tracks
                    </a>
                </div>
            </div>
        </article>
    {/each}

    {#if mixtapes.length === 0}
        <div
            class="col-span-full rounded border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-400"
        >
            No mixtapes yet. Publish one to see it here!
        </div>
    {/if}
</div>

<!-- Support Modal Overlay -->
{#if showSupportModal && activeMixtapeId && activeMixtapeCurator && mixtapeTracks.length > 0}
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        transition:fade={{ duration: 200 }}
        onclick={() => {
            showSupportModal = false;
            if (activeMixtapeId) supportModalDismissed.add(activeMixtapeId);
        }}
    >
        <div class="w-full max-w-md" onclick={(e) => e.stopPropagation()}>
            <MixtapeSupportBanner
                curatorAddress={activeMixtapeCurator}
                curatorName={activeMixtapeCurator.slice(0, 8) + "..."}
                tracks={mixtapeTracks}
                onDismiss={() => {
                    showSupportModal = false;
                    if (activeMixtapeId)
                        supportModalDismissed.add(activeMixtapeId);
                }}
            />
        </div>
    </div>
{/if}

<style>
    @keyframes color-cycle {
        from {
            filter: hue-rotate(0deg);
        }
        to {
            filter: hue-rotate(360deg);
        }
    }
    .animate-color-cycle {
        animation: color-cycle 4s linear infinite;
    }
</style>
