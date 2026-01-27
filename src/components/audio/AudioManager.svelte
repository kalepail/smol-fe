<script lang="ts">
    import {
        audioState,
        playNextSong,
        togglePlayPause,
    } from "../../stores/audio.svelte.ts";
    import { onMount } from "svelte";
    import type { Smol } from "../../types/domain";

    let { playlist = [] }: { playlist?: Smol[] } = $props();

    const STORAGE_KEY = "smol_audio_state_v1";
    let lastSave = 0;
    const isBrowser = typeof window !== "undefined";

    // --- 1. LocalStorage Persistence ---
    function loadState() {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;

            const saved = JSON.parse(raw);
            // Only restore if memory is empty and we are not playing
            if (
                !audioState.currentSong &&
                saved.currentSong &&
                !audioState.playingId
            ) {
                // Restore song reference but do NOT auto-play to avoid "autoplay policy" blocks
                audioState.currentSong = saved.currentSong;
                // audioState.progress = saved.progress || 0; // Optional: restoring progress is tricky without audio element ready
                // Note: Actual restoration of currentTime happens when Audio element mounts and reads this state
            }
        } catch (e) {
            console.error("[AudioManager] Failed to load state", e);
        }
    }

    function saveState() {
        if (!isBrowser || typeof localStorage === "undefined") return;
        if (!audioState.currentSong) return;

        // Throttle saving: max once per 2 seconds
        const now = Date.now();
        if (now - lastSave < 2000) return;

        const stateToSave = {
            currentSong: audioState.currentSong,
            progress: audioState.progress,
            timestamp: now,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
        lastSave = now;
    }

    // --- 2. Media Session API ---
    function updateMediaSession() {
        if (
            typeof navigator === "undefined" ||
            !navigator.mediaSession ||
            !audioState.currentSong
        )
            return;

        const song = audioState.currentSong;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.Title,
            artist: "Smol AI",
            album: "Smol Mixtape",
            artwork: [
                {
                    src: `https://api.smol.xyz/image/${song.Id}.png?scale=4`,
                    sizes: "96x96",
                    type: "image/png",
                },
                {
                    src: `https://api.smol.xyz/image/${song.Id}.png?scale=8`,
                    sizes: "128x128",
                    type: "image/png",
                },
                {
                    src: `https://api.smol.xyz/image/${song.Id}.png?scale=16`,
                    sizes: "512x512",
                    type: "image/png",
                },
            ],
        });

        navigator.mediaSession.setActionHandler("play", () => {
            // We can use our store action
            if (
                audioState.currentSong &&
                audioState.playingId !== audioState.currentSong.Id
            ) {
                togglePlayPause();
            }
        });
        navigator.mediaSession.setActionHandler("pause", () => {
            if (
                audioState.currentSong &&
                audioState.playingId === audioState.currentSong.Id
            ) {
                togglePlayPause();
            }
        });
        navigator.mediaSession.setActionHandler("nexttrack", () => {
            playNextSong();
        });

        // Optional: Previoustrack if we had access to handlePrev from store
    }

    // --- 3. Time-Sync URL (On Pause) ---
    function syncUrlTime() {
        if (typeof window === "undefined" || !audioState.audioElement) return;

        // Only sync if we are "deep" into the song (> 5s) to avoid cluttering short navigations
        if (audioState.audioElement.currentTime < 5) return;

        const time = Math.floor(audioState.audioElement.currentTime);
        const url = new URL(window.location.href);
        const currentT = url.searchParams.get("t");

        // Only replace if significantly different
        if (currentT && Math.abs(parseInt(currentT) - time) < 2) return;

        url.searchParams.set("t", time.toString());
        window.history.replaceState(history.state, "", url.toString());
    }

    // --- 4. Smart Pre-fetching ---
    // Track prefetch links to clean up old ones (prevents memory leak)
    let currentPrefetchLinks: HTMLLinkElement[] = [];

    function prefetchNext() {
        if (!isBrowser || typeof document === "undefined") return;
        if (!audioState.currentSong || playlist.length === 0) return;

        const currentIdx = playlist.findIndex(
            (s) => s.Id === audioState.currentSong?.Id,
        );
        if (currentIdx === -1 || currentIdx >= playlist.length - 1) return;

        const nextSong = playlist[currentIdx + 1];
        const nextUrl = `https://api.smol.xyz/song/${nextSong.Id}.mp3`;
        const imgUrl = `https://api.smol.xyz/image/${nextSong.Id}.png?scale=8`;

        // Clean up previous prefetch links to prevent DOM accumulation
        for (const link of currentPrefetchLinks) {
            link.remove();
        }
        currentPrefetchLinks = [];

        // Prefetch Audio
        const linkAudio = document.createElement("link");
        linkAudio.rel = "prefetch";
        linkAudio.href = nextUrl;
        linkAudio.as = "audio";
        document.head.appendChild(linkAudio);
        currentPrefetchLinks.push(linkAudio);

        // Prefetch Image
        const linkImg = document.createElement("link");
        linkImg.rel = "prefetch";
        linkImg.href = imgUrl;
        linkImg.as = "image";
        document.head.appendChild(linkImg);
        currentPrefetchLinks.push(linkImg);
    }

    // --- Lifecycle & Effects ---

    onMount(() => {
        try {
            // Delay loadState slightly to prioritize render
            setTimeout(() => {
                loadState();
            }, 0);
        } catch (e) {
            console.warn("[AudioManager] Load failed gracefully", e);
        }

        // Handle URL Time Param on Load
        const urlParams = new URLSearchParams(window.location.search);
        const t = urlParams.get("t");
        if (t && audioState.audioElement) {
            const time = parseInt(t);
            // Only apply URL time if valid AND we are not currently playing a song (to avoid skipping back on history nav)
            if (!isNaN(time) && !audioState.playingId) {
                audioState.audioElement.currentTime = time;
            }
        }
    });

    // Effect: Update MediaSession & Prefetch when song changes
    $effect(() => {
        const _ = audioState.currentSong; // Dependency
        updateMediaSession();
        prefetchNext();
    });

    // Effect: Periodic Save & Sync on Pause
    $effect(() => {
        // We'll rely on the fact that this effect runs when dependencies change.
        // But for "Pause" detection, we need to bind to the playingId or manual events.
        // Let's hook into playingId.

        if (audioState.playingId === null && audioState.currentSong) {
            // Paused
            syncUrlTime();
            saveState(); // Force save on pause
        }
    });

    // Effect: Progress Loop for Saving
    $effect(() => {
        const _p = audioState.progress;
        saveState();
    });
</script>
