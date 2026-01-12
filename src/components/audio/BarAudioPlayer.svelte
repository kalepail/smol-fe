<script lang="ts">
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
  import LikeButton from "../ui/LikeButton.svelte";
  import { trackView } from "../../lib/analytics";
  import {
    audioState,
    setAudioElement,
    updateProgress,
    togglePlayPause,
    playNextSong,
  } from "../../stores/audio.svelte";

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

  /**
   * Effect: Sync audio source with current song
   * When the current song changes, update the audio element's src
   */
  $effect(() => {
    const song = audioState.currentSong;
    const audio = audioState.audioElement;

    if (!audio) return;

    if (song && song.Id && song.Song_1) {
      // Use audio proxy if available (enables Web Audio API visualizer via CORS)
      const audioProxyUrl = import.meta.env.PUBLIC_AUDIO_PROXY_URL;
      const songUrl = audioProxyUrl
        ? `${audioProxyUrl}/audio/${song.Song_1}`
        : `${API_URL}/song/${song.Song_1}.mp3`;

      // Only update src if it's different to avoid reloading
      if (audio.src !== songUrl) {
        audio.src = songUrl;
        audio.load();
        trackView(song.Id);
      }
    } else {
      // No song selected, clear audio
      audio.pause();
      audio.src = "";
      audio.currentTime = 0;
    }
  });

  /**
   * Effect: Sync playback state with playing ID
   * When playingId changes, play or pause the audio accordingly
   */
  $effect(() => {
    const playingId = audioState.playingId;
    const currentSong = audioState.currentSong;
    const audio = audioState.audioElement;

    if (!audio || !audio.src) return;

    if (currentSong && playingId === currentSong.Id) {
      // Prevent redundant play() calls that cause glitches on iOS
      if (!audio.paused) return;
      // Should be playing
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Error playing audio:", error);
          // Reset playing state on error
          audioState.playingId = null;
        });
      }
    } else {
      // Should be paused
      audio.pause();
    }
  });

  /**
   * Effect: Media Session API for iOS lock-screen playback
   * Keeps audio playing when phone is locked and shows controls on lock screen
   */
  $effect(() => {
    const song = audioState.currentSong;
    if (!("mediaSession" in navigator)) return;

    if (song) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.Title || "Untitled",
        artist: "SMOL",
        album: "SMOL Radio",
        artwork: [
          {
            src: `${API_URL}/image/${song.Id}.png?scale=8`,
            sizes: "512x512",
            type: "image/png",
          },
        ],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  });

  /**
   * Register Media Session action handlers on mount
   */
  onMount(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      if (audioState.currentSong && !audioState.playingId) {
        togglePlayPause();
      }
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      if (audioState.playingId) {
        togglePlayPause();
      }
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      playNextSong();
    });

    // Auto-resume on interruption end (e.g. phone call, alarm)
    const handleInterruptionEnd = () => {
      if (
        document.visibilityState === "visible" &&
        audioState.playingId &&
        audioState.audioElement?.paused
      ) {
        console.log("[Audio] Attempting auto-resume after interruption...");
        audioState.audioElement.play().catch((e) => {
          console.warn("[Audio] Auto-resume failed:", e);
        });
      }
    };

    document.addEventListener("visibilitychange", handleInterruptionEnd);
    window.addEventListener("focus", handleInterruptionEnd);

    // Clean up on unmount
    return () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
      }
      document.removeEventListener("visibilitychange", handleInterruptionEnd);
      window.removeEventListener("focus", handleInterruptionEnd);
    };
  });

  function handleTimeUpdate(event: Event) {
    const audio = event.target as HTMLAudioElement;
    updateProgress(audio.currentTime, audio.duration);
  }

  function handleEnded() {
    if (audioState.repeatMode === "one" && audioState.audioElement) {
      // Loop endlessly
      audioState.audioElement.currentTime = 0;
      audioState.audioElement.play();
    } else if (audioState.repeatMode === "once" && audioState.audioElement) {
      // Replay once then disable repeat
      audioState.audioElement.currentTime = 0;
      audioState.audioElement.play();
      audioState.repeatMode = "off";
    } else {
      playNextSong();
    }
  }

  function handleLikeChanged(liked: boolean) {
    if (audioState.currentSong) {
      audioState.currentSong.Liked = liked;
    }
  }
  let pathname = $state(window.location.pathname);

  // Update pathname on navigation (for View Transitions/SPA nav)
  $effect(() => {
    const handleUpdate = () => {
      const newPath = window.location.pathname;
      if (pathname !== newPath) {
        pathname = newPath;
      }
    };

    window.addEventListener("popstate", handleUpdate);
    document.addEventListener("astro:page-load", handleUpdate);
    document.addEventListener("astro:after-swap", handleUpdate);

    return () => {
      window.removeEventListener("popstate", handleUpdate);
      document.removeEventListener("astro:page-load", handleUpdate);
      document.removeEventListener("astro:after-swap", handleUpdate);
    };
  });

  const isMixtapesIndex = $derived(
    pathname === "/mixtapes" || pathname === "/mixtapes/",
  );

  const isFreshDrops = $derived(
    pathname === "/fresh-drops" || pathname === "/fresh-drops/",
  );

  const isHomePage = $derived(pathname === "/" || pathname === "");

  let { hideBottomBar = false } = $props();

  // Radio mode: on /radio page AND audio is actively playing
  const isRadioMode = $derived(
    (pathname === "/radio" || pathname === "/radio/") && audioState.playingId,
  );

  const isArtistPage = $derived(pathname.startsWith("/artist"));
  const isTagsPage = $derived(pathname.startsWith("/tags"));
  const isCreatedPage = $derived(pathname.startsWith("/created"));

  const shouldHidePlayer = $derived(
    hideBottomBar ||
      isMixtapesIndex ||
      isHomePage ||
      isRadioMode ||
      isArtistPage ||
      isTagsPage ||
      isCreatedPage,
  );
</script>

{#if audioState.currentSong && !shouldHidePlayer}
  <div
    class="fixed z-[150] p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
    transition:fade={{ duration: 200 }}
  >
    <div class="flex items-center justify-between max-w-7xl mx-auto">
      <div class="flex items-center gap-4 mr-4">
        <img
          src={`${API_URL}/image/${audioState.currentSong.Id}.png?scale=8`}
          alt={audioState.currentSong.Title}
          class="w-12 h-12 rounded object-cover"
        />
        <div>
          <h3 class="text-white font-medium leading-5">
            {audioState.currentSong.Title}
          </h3>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <LikeButton
          smolId={audioState.currentSong.Id}
          liked={audioState.currentSong?.Liked || false}
          on:likeChanged={(e) => handleLikeChanged(e.detail.liked)}
        />

        <!-- Shuffle/Radio Button -->
        <a
          href="/radio"
          class="w-8 h-8 flex items-center justify-center text-[#f7931a] hover:text-white hover:bg-[#f7931a]/20 active:scale-95 border border-[#f7931a]/30 hover:border-[#f7931a] transition-all rounded-full bg-[#f7931a]/5"
          title="Open Radio"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
            />
          </svg>
        </a>

        {#if audioState.currentSong.Id && audioState.currentSong.Song_1}
          <MiniAudioPlayer
            id={audioState.currentSong.Id}
            playing_id={audioState.playingId}
            songToggle={togglePlayPause}
            songNext={playNextSong}
            progress={audioState.progress}
          />
        {/if}
      </div>
    </div>
  </div>
{/if}

<audio
  preload="auto"
  crossorigin="anonymous"
  bind:this={audioState.audioElement}
  ontimeupdate={handleTimeUpdate}
  onended={handleEnded}
  onloadedmetadata={(e) => {
    const audio = e.target as HTMLAudioElement;
    if (audio.duration && audio.duration !== Infinity) {
      updateProgress(audio.currentTime, audio.duration);
    }
  }}
  onloadeddata={() => {
    if (
      audioState.currentSong &&
      audioState.playingId === audioState.currentSong.Id &&
      audioState.audioElement
    ) {
      const playPromise = audioState.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Error playing audio on load:", error);
          audioState.playingId = null;
        });
      }
    }
  }}
></audio>
