<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { MixtapeDetail, SmolTrackData } from "../../utils/api/mixtapes";
    import { getSmolTrackData } from "../../utils/api/mixtapes";
    import Loader from "../Loader.svelte";
    import BarAudioPlayer from "../BarAudioPlayer.svelte";
    import MiniAudioPlayer from "../MiniAudioPlayer.svelte";
    import LikeButton from "../LikeButton.svelte";
    import { playingId, currentSong, selectSong, togglePlayPause, audioProgress } from "../../store/audio";
    import { contractId } from "../../store/contractId";

    export let mixtape: MixtapeDetail | null = null;

    let trackDataMap = new Map<string, SmolTrackData | null>();
    let loadingTracks = new Set<string>();
    let mixtapeTracks: any[] = []; // Full track data for playback
    let trackLikedStates = new Map<string, boolean>(); // Track liked states
    let currentTrackIndex = -1;
    let isPlayingAll = false;
    let likes: string[] = []; // Array of liked song IDs
    let likesLoaded = false; // Track if likes have been loaded

    // Reactive: Check if any audio is currently playing
    $: isAnyPlaying = $playingId !== null && $currentSong !== null;

    // Reactively update liked states when likes are loaded or change
    $: if (likesLoaded && likes.length >= 0) {
        // Update liked states for all loaded tracks
        mixtapeTracks.forEach((track, index) => {
            if (track?.Id) {
                const isLiked = likes.includes(track.Id);
                if (track.Liked !== isLiked) {
                    track.Liked = isLiked;
                    trackLikedStates.set(track.Id, isLiked);
                }
            }
        });
        trackLikedStates = trackLikedStates;
    }

    onMount(() => {
        if (!mixtape) return;

        // Setup media session handlers for browser media controls
        if ("mediaSession" in navigator) {
            navigator.mediaSession.setActionHandler("previoustrack", () => {
                playPrevious();
            });

            navigator.mediaSession.setActionHandler("nexttrack", () => {
                playNext();
            });

            navigator.mediaSession.setActionHandler("play", () => {
                togglePlayPause();
            });

            navigator.mediaSession.setActionHandler("pause", () => {
                togglePlayPause();
            });
        }

        // Add keyboard event listener
        window.addEventListener("keydown", handleKeyboard);

        // Handle async operations without awaiting
        (async () => {
            // Fetch likes FIRST and wait for it to complete if user is connected
            if ($contractId && !likesLoaded) {
                likes = await fetch(`${import.meta.env.PUBLIC_API_URL}/likes`, {
                    credentials: "include",
                }).then(async (res) => {
                    if (res.ok) return res.json();
                    return [];
                });
                likesLoaded = true;
            }

            // Check for autoplay parameter in URL
            const urlParams = new URLSearchParams(window.location.search);
            const shouldAutoplay = urlParams.get("autoplay") === "true";

            // Load track data dynamically - this now runs AFTER likes are loaded
            const loadPromises = mixtape.tracks.map(async (track, index) => {
                loadingTracks.add(track.id);
                loadingTracks = loadingTracks; // Trigger reactivity

                try {
                    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${track.id}`, {
                        credentials: "include",
                    });
                    if (response.ok) {
                        const fullData = await response.json();
                        const d1 = fullData?.d1;
                        const kv_do = fullData?.kv_do;

                        // Store simplified track data for display
                        const trackData: SmolTrackData = {
                            id: track.id,
                            title: kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null,
                            creator: d1?.Address ?? null,
                            coverUrl: `${import.meta.env.PUBLIC_API_URL}/image/${track.id}.png`,
                            audioUrl: null, // Not needed for display
                            lyrics: kv_do?.lyrics ? {
                                title: kv_do.lyrics.title,
                                style: kv_do.lyrics.style,
                            } : null,
                        };

                        trackDataMap.set(track.id, trackData);

                        // Check if this track is in the user's likes (prefer /likes endpoint, fallback to individual response)
                        const isLiked = likesLoaded ? likes.includes(track.id) : (fullData?.liked || false);

                        // Store full data for playback (compatible with BarAudioPlayer)
                        mixtapeTracks[index] = {
                            Id: track.id,
                            Title: trackData.title,
                            Song_1: d1?.Song_1,
                            Liked: isLiked,
                            ...d1
                        };

                        // Initialize liked state
                        trackLikedStates.set(track.id, isLiked);
                    } else {
                        trackDataMap.set(track.id, null);
                    }
                } catch (error) {
                    trackDataMap.set(track.id, null);
                } finally {
                    trackDataMap = trackDataMap; // Trigger reactivity
                    loadingTracks.delete(track.id);
                    loadingTracks = loadingTracks; // Trigger reactivity
                }
            });

            // If autoplay is requested, wait for at least the first track to load
            if (shouldAutoplay) {
                // Wait for first track to load
                await Promise.race([loadPromises[0], new Promise(resolve => setTimeout(resolve, 5000))]);

                // Remove autoplay parameter from URL
                urlParams.delete("autoplay");
                const newUrl = window.location.pathname + (urlParams.toString() ? "?" + urlParams.toString() : "");
                window.history.replaceState({}, "", newUrl);

                // Trigger play all after a short delay to ensure audio elements are bound
                setTimeout(() => handlePlayAll(), 500);
            }
        })();

        return () => {
            window.removeEventListener("keydown", handleKeyboard);
        };
    });

    $: coverUrls = mixtape
        ? Array.from({ length: 4 }, (_, i) => {
              const trackData = mixtape.tracks[i]
                  ? trackDataMap.get(mixtape.tracks[i].id)
                  : null;
              return trackData?.coverUrl ?? null;
          })
        : [];

    function handlePlayAll() {
        if (!mixtape || mixtape.tracks.length === 0) return;

        // Find first playable track
        const firstTrackIndex = mixtapeTracks.findIndex(t => t?.Song_1);

        if (firstTrackIndex === -1) {
            alert("No playable tracks found yet. Please wait for tracks to load.");
            return;
        }

        isPlayingAll = true;
        currentTrackIndex = firstTrackIndex;
        selectSong(mixtapeTracks[firstTrackIndex]);
    }

    function stopPlayAll() {
        isPlayingAll = false;
        selectSong(null);
        currentTrackIndex = -1;
    }

    function handleTrackClick(index: number) {
        const track = mixtapeTracks[index];
        if (!track || !track.Song_1) return;

        // If clicking the currently selected track, toggle play/pause
        if ($currentSong?.Id === track.Id) {
            togglePlayPause();
        } else {
            // Otherwise, select and play the new track
            currentTrackIndex = index;
            isPlayingAll = true;
            selectSong(track);
        }
    }

    function playNext() {
        if (!mixtape) return;

        // Find the next track with audio
        for (let i = currentTrackIndex + 1; i < mixtapeTracks.length; i++) {
            if (mixtapeTracks[i]?.Song_1) {
                currentTrackIndex = i;
                selectSong(mixtapeTracks[i]);
                return;
            }
        }

        // If Play All is enabled, wrap around to beginning
        if (isPlayingAll) {
            for (let i = 0; i <= currentTrackIndex; i++) {
                if (mixtapeTracks[i]?.Song_1) {
                    currentTrackIndex = i;
                    selectSong(mixtapeTracks[i]);
                    return;
                }
            }
        }

        // No more tracks
        isPlayingAll = false;
        currentTrackIndex = -1;
    }

    function playPrevious() {
        if (!mixtape || currentTrackIndex < 0) return;

        // Find the previous track with audio
        for (let i = currentTrackIndex - 1; i >= 0; i--) {
            if (mixtapeTracks[i]?.Song_1) {
                currentTrackIndex = i;
                selectSong(mixtapeTracks[i]);
                return;
            }
        }

        // Wrap around to end
        for (let i = mixtapeTracks.length - 1; i >= currentTrackIndex; i--) {
            if (mixtapeTracks[i]?.Song_1) {
                currentTrackIndex = i;
                selectSong(mixtapeTracks[i]);
                return;
            }
        }
    }

    function handleKeyboard(event: KeyboardEvent) {
        // Ignore if user is typing in an input/textarea
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
            return;
        }

        switch (event.key) {
            case " ":
                event.preventDefault();
                togglePlayPause();
                break;
            case "ArrowRight":
                event.preventDefault();
                playNext();
                break;
            case "ArrowLeft":
                event.preventDefault();
                playPrevious();
                break;
        }
    }

    function handlePurchase() {
        if (!mixtape) return;
        alert("Purchasing mixtapes is coming soon. Stay tuned!");
    }


    // Monitor current playing song and update track index
    $: if ($currentSong && mixtape) {
        const index = mixtapeTracks.findIndex(t => t?.Id === $currentSong.Id);
        if (index !== -1 && index !== currentTrackIndex) {
            currentTrackIndex = index;
        }

        // Sync liked state from currentSong to trackLikedStates
        if ($currentSong.Id && $currentSong.Liked !== undefined) {
            const currentLikedState = trackLikedStates.get($currentSong.Id);
            if (currentLikedState !== $currentSong.Liked) {
                trackLikedStates.set($currentSong.Id, $currentSong.Liked);
                trackLikedStates = trackLikedStates;
            }
        }

        // Update media session metadata
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: $currentSong.Title || "Unknown Track",
                artist: mixtape.title || "Mixtape",
                album: mixtape.title || "Smol Mixtape",
                artwork: [
                    {
                        src: `${import.meta.env.PUBLIC_API_URL}/image/${$currentSong.Id}.png?scale=8`,
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
            });
        }
    }

    // Detect when playback stops completely
    $: if (!$playingId && !$currentSong) {
        isPlayingAll = false;
        currentTrackIndex = -1;

        // Clear media session metadata
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = null;
        }
    }

    // Auto-disable Play All mode when user pauses (playingId becomes null but currentSong exists)
    $: if (!$playingId && $currentSong && isPlayingAll) {
        isPlayingAll = false;
    }

    // Re-enable Play All mode when user resumes playing
    $: if ($playingId && $currentSong && !isPlayingAll && currentTrackIndex >= 0) {
        isPlayingAll = true;
    }

    function truncateAddress(address: string | null): string {
        if (!address) return "";
        if (address.length <= 12) return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
</script>

{#if !mixtape}
    <div class="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">
        <p>We couldn't find that mixtape. Double-check the link or publish a new one.</p>
    </div>
{:else}
    <div class="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
        <header class="flex flex-col gap-6 rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-xl md:flex-row">
            <div class="grid h-48 w-48 grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl bg-slate-800">
                {#each Array.from({ length: 4 }) as _, index}
                    <div class="aspect-square bg-slate-900">
                        {#if coverUrls[index]}
                            <img
                                src={`${coverUrls[index]}${coverUrls[index]?.includes("?") ? "" : "?scale=4"}`}
                                alt={mixtape.title}
                                class="h-full w-full object-cover pixelated"
                                on:error={(e) => {
                                    // @ts-ignore
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        {:else}
                            <div class="flex h-full w-full items-center justify-center text-xs text-slate-500">
                                {#if mixtape.tracks[index] && loadingTracks.has(mixtape.tracks[index].id)}
                                    <Loader classNames="w-6 h-6" />
                                {:else}
                                    SMOL
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            <div class="flex flex-1 flex-col gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white">{mixtape.title}</h1>
                    <p class="mt-2 text-sm text-slate-400">{mixtape.description}</p>
                </div>

                <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                    {#if isPlayingAll && isAnyPlaying}
                        <button
                            class="flex items-center justify-center gap-2 rounded bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
                            on:click={stopPlayAll}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                                <rect width="6" height="12" x="2" y="2" rx="1"/>
                                <rect width="6" height="12" x="8" y="2" rx="1"/>
                            </svg>
                            Stop Playing
                        </button>
                    {:else}
                        <button
                            class="flex items-center justify-center gap-2 rounded bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-300"
                            on:click={handlePlayAll}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                                <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732Z"/>
                            </svg>
                            Play All
                        </button>
                    {/if}
                    <button
                        class="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                        on:click={handlePurchase}
                    >Buy Mixtape</button>
                </div>
            </div>
        </header>

        <section class="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-lg">
            <header class="mb-4 flex items-center justify-between">
                <h2 class="text-xl font-semibold text-white">Tracklist</h2>
                <span class="text-xs uppercase tracking-wide text-slate-500">{mixtape.trackCount} Smol{mixtape.trackCount === 1 ? "" : "s"}</span>
            </header>

            {#if mixtape.tracks.length === 0}
                <p class="rounded border border-dashed border-slate-600 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
                    Track details will appear here after the backend is connected.
                </p>
            {:else}
                <ul class="flex flex-col gap-3">
                    {#each mixtape.tracks as track, index (track.id)}
                        {@const trackData = trackDataMap.get(track.id)}
                        {@const isLoading = loadingTracks.has(track.id)}
                        {@const isCurrentTrack = $currentSong?.Id === track.id}
                        {@const isCurrentlyPlaying = isCurrentTrack && $playingId === track.id}
                        <li
                            class="flex items-center gap-3 rounded-xl border p-4 transition-colors cursor-pointer {isCurrentTrack ? 'border-lime-500 bg-slate-800' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-800/60'}"
                            on:click={() => handleTrackClick(index)}
                        >
                            <a
                                href={`/${track.id}`}
                                target="_blank"
                                class="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-900 group"
                                on:click|stopPropagation
                            >
                                {#if isLoading}
                                    <div class="flex h-full w-full items-center justify-center">
                                        <Loader classNames="w-6 h-6" />
                                    </div>
                                {:else if trackData?.coverUrl}
                                    <img
                                        src={`${trackData.coverUrl}${trackData.coverUrl.includes("?") ? "" : "?scale=4"}`}
                                        alt={trackData.title ?? "Track"}
                                        class="h-full w-full object-cover pixelated transition-transform group-hover:scale-110"
                                        on:error={(e) => {
                                            // @ts-ignore
                                            e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="%23334155" width="64" height="64"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-family="monospace" font-size="12">SMOL</text></svg>';
                                        }}
                                    />
                                {:else}
                                    <div class="flex h-full w-full items-center justify-center text-xs text-slate-500">
                                        {index + 1}
                                    </div>
                                {/if}
                            </a>

                            <div class="flex flex-1 flex-col min-w-0">
                                <div class="font-semibold text-white truncate">
                                    {#if isLoading}
                                        Loading...
                                    {:else}
                                        {trackData?.title ?? "Unknown Track"}
                                    {/if}
                                </div>
                                {#if trackData?.creator}
                                    <span class="text-xs text-slate-400 truncate" title={trackData.creator}>
                                        {truncateAddress(trackData.creator)}
                                    </span>
                                {/if}
                                {#if trackData?.lyrics?.style && trackData.lyrics.style.length > 0}
                                    <div class="mt-1 flex flex-wrap gap-1">
                                        {#each trackData.lyrics.style.slice(0, 3) as tag}
                                            <span class="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded-full">
                                                {tag}
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>

                            <div class="flex items-center gap-2">
                                {#if mixtapeTracks[index]?.Song_1}
                                    <div class="relative z-2" on:click|stopPropagation>
                                        <MiniAudioPlayer
                                            id={track.id}
                                            playing_id={$playingId}
                                            songToggle={() => handleTrackClick(index)}
                                            songNext={playNext}
                                            progress={$currentSong?.Id === track.id ? $audioProgress : 0}
                                        />
                                    </div>
                                {/if}

                                <div on:click|stopPropagation>
                                    <LikeButton
                                        smolId={track.id}
                                        liked={trackLikedStates.get(track.id) || false}
                                        classNames="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
                                        on:likeChanged={(e) => {
                                            trackLikedStates.set(e.detail.smolId, e.detail.liked);
                                            trackLikedStates = trackLikedStates;

                                            // Update mixtapeTracks array as well
                                            if (mixtapeTracks[index]) {
                                                mixtapeTracks[index].Liked = e.detail.liked;
                                            }

                                            // If this is the currently playing song, update currentSong
                                            if ($currentSong?.Id === e.detail.smolId) {
                                                $currentSong.Liked = e.detail.liked;
                                            }
                                        }}
                                    />
                                </div>

                                <div class="text-sm text-slate-500 font-mono">
                                    #{index + 1}
                                </div>
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    </div>
{/if}

<BarAudioPlayer
    classNames="fixed z-30 p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
    songNext={playNext}
/>

