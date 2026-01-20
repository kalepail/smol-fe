<script lang="ts">
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
  import LikeButton from "../ui/LikeButton.svelte";
  import CastButton from "../ui/CastButton.svelte";
  import { trackView } from "../../lib/analytics";
  import {
    audioState,
    setAudioElement,
    updateProgress,
    togglePlayPause,
    playNextSong,
    saveState,
    seek,
  } from "../../stores/audio.svelte";
  import { onDestroy } from "svelte";

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

  import { castService } from "../../services/cast";

  /**
   * Effect: Sync playback state with playing ID
   * When playingId changes, play or pause the audio accordingly
   */
  $effect(() => {
    const playingId = audioState.playingId;
    const currentSong = audioState.currentSong;
    const audio = audioState.audioElement;

    if (!audio || !audio.src) return;

    // If casting, ensure local audio is paused and delegate to cast service
    if (audioState.isCasting) {
      if (!audio.paused) audio.pause();

      // Sync local state to cast service
      if (currentSong && playingId === currentSong.Id) {
        castService.play();
      } else {
        castService.pause();
      }
      return;
    }

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
   * Effect: Sync Current Song with Cast Service
   */
  $effect(() => {
    if (audioState.isCasting && audioState.currentSong) {
      castService.loadMedia(audioState.currentSong);
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
            src: `${API_URL}/image/${song.Id}.png?scale=16`,
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
    let resumeAttempts = 0;
    const maxResumeAttempts = 3;
    let resumeCheckInterval: number | null = null;

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

    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined && audioState.audioElement) {
        audioState.audioElement.currentTime = details.seekTime;
        updateProgress(details.seekTime, audioState.audioElement.duration);
      }
    });

    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      if (audioState.audioElement) {
        const skipTime = details.seekOffset || 10;
        audioState.audioElement.currentTime = Math.max(
          audioState.audioElement.currentTime - skipTime,
          0,
        );
        updateProgress(
          audioState.audioElement.currentTime,
          audioState.audioElement.duration,
        );
      }
    });

    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      if (audioState.audioElement) {
        const skipTime = details.seekOffset || 10;
        audioState.audioElement.currentTime = Math.min(
          audioState.audioElement.currentTime + skipTime,
          audioState.audioElement.duration,
        );
        updateProgress(
          audioState.audioElement.currentTime,
          audioState.audioElement.duration,
        );
      }
    });

    // Start polling for resume when interrupted
    const startResumePolling = () => {
      if (resumeCheckInterval) return; // Already polling

      console.log("[Audio] Starting resume polling for CarPlay/iOS");
      resumeCheckInterval = window.setInterval(() => {
        if (
          audioState.wasInterrupted &&
          document.visibilityState === "visible"
        ) {
          console.log("[Audio] Polling check - attempting resume");
          attemptResume();
        }
      }, 2000); // Check every 2 seconds
    };

    // Stop polling when no longer needed
    const stopResumePolling = () => {
      if (resumeCheckInterval) {
        console.log("[Audio] Stopping resume polling");
        clearInterval(resumeCheckInterval);
        resumeCheckInterval = null;
      }
    };

    // Track audio interruptions via pause event
    const handleAudioPause = () => {
      // If audio paused but playingId is still set, it's an interruption
      if (audioState.playingId && audioState.currentSong) {
        console.log(
          "[Audio] Interruption detected - audio paused unexpectedly",
        );
        audioState.wasInterrupted = true;
        startResumePolling(); // Start polling for iOS/CarPlay
      }
    };

    // Clear interruption flag when audio successfully plays
    const handleAudioPlay = () => {
      if (audioState.wasInterrupted) {
        console.log("[Audio] Playback resumed successfully after interruption");
        audioState.wasInterrupted = false;
        resumeAttempts = 0;
        stopResumePolling(); // Stop polling when playing
      }
    };

    // Handle when audio becomes playable - good time to resume on CarPlay reconnect
    const handleCanPlay = () => {
      if (
        audioState.wasInterrupted &&
        audioState.playingId &&
        audioState.currentSong
      ) {
        console.log(
          "[Audio] Audio can play and was interrupted - attempting resume",
        );
        setTimeout(attemptResume, 100);
      }
    };

    // Attempt to resume playback with retry logic
    const attemptResume = async () => {
      if (
        !audioState.wasInterrupted ||
        !audioState.playingId ||
        !audioState.audioElement ||
        !audioState.currentSong
      ) {
        return;
      }

      // Don't resume if audio is already playing
      if (!audioState.audioElement.paused) {
        audioState.wasInterrupted = false;
        return;
      }

      resumeAttempts++;
      console.log(
        `[Audio] Attempting auto-resume after interruption (attempt ${resumeAttempts}/${maxResumeAttempts})...`,
      );

      try {
        // Resume audio context if it's suspended (important for Bluetooth reconnection)
        if (
          audioState.audioContext &&
          audioState.audioContext.state === "suspended"
        ) {
          console.log("[Audio] Resuming suspended audio context...");
          await audioState.audioContext.resume();
        }

        await audioState.audioElement.play();
        console.log("[Audio] Auto-resume successful");
        audioState.wasInterrupted = false;
        resumeAttempts = 0;
      } catch (error) {
        console.warn(
          `[Audio] Auto-resume failed (attempt ${resumeAttempts}):`,
          error,
        );

        // Retry with exponential backoff
        if (resumeAttempts < maxResumeAttempts) {
          const delay = Math.min(1000 * Math.pow(2, resumeAttempts - 1), 4000);
          console.log(`[Audio] Retrying in ${delay}ms...`);
          setTimeout(attemptResume, delay);
        } else {
          console.warn(
            "[Audio] Max resume attempts reached. User interaction may be required.",
          );
          resumeAttempts = 0;
        }
      }
    };

    // iOS-specific: Handle visibility changes (phone calls, switching apps, CarPlay reconnection)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[Audio] Page became visible - checking for resume");
        // Small delay to let the system settle
        setTimeout(attemptResume, 100);
        // For CarPlay, try again after a longer delay
        setTimeout(attemptResume, 500);
      }
    };

    // iOS-specific: Handle window focus (returning from notifications, Siri, etc.)
    const handleFocus = () => {
      console.log("[Audio] Window gained focus - checking for resume");
      setTimeout(attemptResume, 100);
      // For CarPlay, try again after a longer delay
      setTimeout(attemptResume, 500);
    };

    // iOS-specific: Handle audio session interruptions (CarPlay disconnect)
    const handleBeginInactive = () => {
      console.log(
        "[Audio] iOS audio session becoming inactive (CarPlay disconnect?)",
      );
      if (audioState.playingId && audioState.currentSong) {
        audioState.wasInterrupted = true;
        startResumePolling(); // Start polling for reconnection
      }
    };

    const handleEndInactive = () => {
      console.log(
        "[Audio] iOS audio session ending inactive state (CarPlay reconnect?)",
      );
      // Try multiple times with different delays for CarPlay
      setTimeout(attemptResume, 100);
      setTimeout(attemptResume, 500);
      setTimeout(attemptResume, 1000);
    };

    // Handle audio context state changes (Bluetooth connection, system audio changes)
    const handleAudioContextStateChange = () => {
      if (!audioState.audioContext) return;

      console.log(
        `[Audio] Audio context state changed to: ${audioState.audioContext.state}`,
      );

      // If context becomes suspended while we're supposed to be playing, mark as interrupted
      if (
        audioState.audioContext.state === "suspended" &&
        audioState.playingId &&
        audioState.currentSong
      ) {
        console.log(
          "[Audio] Audio context suspended during playback - marking as interrupted",
        );
        audioState.wasInterrupted = true;
      }

      // If context resumes from suspended, attempt to resume playback
      if (
        audioState.audioContext.state === "running" &&
        audioState.wasInterrupted
      ) {
        console.log(
          "[Audio] Audio context resumed - attempting to resume playback",
        );
        setTimeout(attemptResume, 100);
      }
    };

    // Register all event listeners
    if (audioState.audioElement) {
      audioState.audioElement.addEventListener("pause", handleAudioPause);
      audioState.audioElement.addEventListener("play", handleAudioPlay);
      // iOS/CarPlay: Try to resume when audio becomes playable after reconnection
      audioState.audioElement.addEventListener("canplay", handleCanPlay);
      audioState.audioElement.addEventListener("canplaythrough", handleCanPlay);
    }

    // Monitor audio context state changes for Bluetooth and device changes (non-iOS)
    if (audioState.audioContext) {
      audioState.audioContext.addEventListener(
        "statechange",
        handleAudioContextStateChange,
      );
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    // iOS-specific webkit events
    document.addEventListener("webkitbegininactive", handleBeginInactive);
    document.addEventListener("webkitendactive", handleEndInactive);

    // Clean up on unmount
    return () => {
      stopResumePolling(); // Stop polling interval

      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("seekto", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
      }

      if (audioState.audioElement) {
        audioState.audioElement.removeEventListener("pause", handleAudioPause);
        audioState.audioElement.removeEventListener("play", handleAudioPlay);
        audioState.audioElement.removeEventListener("canplay", handleCanPlay);
        audioState.audioElement.removeEventListener(
          "canplaythrough",
          handleCanPlay,
        );
      }

      if (audioState.audioContext) {
        audioState.audioContext.removeEventListener(
          "statechange",
          handleAudioContextStateChange,
        );
      }

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("webkitbegininactive", handleBeginInactive);
      document.removeEventListener("webkitendactive", handleEndInactive);
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

  // Keep Document Title Updated with "Now Playing" info
  $effect(() => {
    const updateTitle = () => {
      if (!audioState.currentSong) return;

      const artist =
        audioState.currentSong.Username ||
        audioState.currentSong.Creator ||
        audioState.currentSong.artist ||
        "Smol";
      const title = audioState.currentSong.Title || "Untitled";

      let newTitle = `${title} • ${artist}`;
      if (audioState.playingId) {
        newTitle = `▶ ${newTitle}`;
      }

      if (document.title !== newTitle) {
        document.title = newTitle;
      }
    };

    // Reactively update when song/play state changes
    updateTitle();

    // Also re-apply on navigation (Astro swaps title on nav, we want to persist song info if playing)
    const handleNav = () => {
      // Tiny timeout to let Astro finish its title swap
      setTimeout(() => {
        if (audioState.playingId) updateTitle();
      }, 50);
    };

    document.addEventListener("astro:page-load", handleNav);
    return () => {
      document.removeEventListener("astro:page-load", handleNav);
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

  /**
   * Effect: Persist audio state when it changes
   * This ensures we can resume after reload/crash
   */
  $effect(() => {
    // Access properties to trigger dependency tracking
    const _p = audioState.playingId;
    const _c = audioState.currentSong;
    const _d = audioState.duration;
    const _pr = audioState.progress;
    // Debounce save slightly probably overkill but safe
    saveState();
  });

  /**
   * Effect: Pre-cache Next Song
   * Fetches the next song details in the background
   */
  $effect(() => {
    const nextSong = audioState.nextSong;
    if (nextSong && nextSong.Id && nextSong.Song_1) {
      // Use audio proxy if available
      const audioProxyUrl = import.meta.env.PUBLIC_AUDIO_PROXY_URL;
      const songUrl = audioProxyUrl
        ? `${audioProxyUrl}/audio/${nextSong.Song_1}`
        : `${API_URL}/song/${nextSong.Song_1}.mp3`;

      // Use Fetch with low priority to populate browser cache
      // @ts-ignore - priority is valid but TS might complain
      fetch(songUrl, { priority: "low" }).catch((err) => {
        console.warn("[Audio] Pre-cache failed:", err);
      });
    }
  });
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

        <CastButton
          size={16}
          classNames="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-full bg-white/5 border border-white/5"
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
    if (audioState.audioElement) {
      // If we restored progress from saved state, verify we need to seek
      // Only seek if we're significantly off (e.g. > 1s) to avoid jitter
      // But wait... audioState.progress is % (0-100), currentTime is seconds.
      const targetTime =
        (audioState.progress / 100) * audioState.audioElement.duration;
      if (Math.abs(audioState.audioElement.currentTime - targetTime) > 1) {
        console.log("[Audio] Restoring playback position:", targetTime);
        audioState.audioElement.currentTime = targetTime;
      }
    }

    if (
      audioState.currentSong &&
      audioState.playingId === audioState.currentSong.Id &&
      audioState.audioElement
    ) {
      const playPromise = audioState.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Error playing audio on load:", error);
          // Don't clear playingId if it's an auto-play restriction
          // This preserves the "Intent to Play" so we can resume when the car connects
          if (error.name === "NotAllowedError") {
            console.log(
              "[Audio] Auto-play blocked. Preserving state and entering interrupted mode.",
            );
            audioState.wasInterrupted = true;
            // We can't access startResumePolling here easily because it's inside onMount closure
            // But setting wasInterrupted is enough for the effect hooks to pick it up later
          } else {
            audioState.playingId = null;
          }
        });
      }
    }
  }}
></audio>
