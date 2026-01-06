<script lang="ts">
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    togglePlayPause,
    isPlaying,
    registerSongNextCallback,
  } from "../../stores/audio.svelte";
  import { likeSmol, unlikeSmol } from "../../services/api/smols";
  import { userState } from "../../stores/user.svelte";
  import { getNextTrack } from "../../lib/audio/queue";

  let { playlist = [] }: { playlist: Smol[] } = $props();

  let shuffleEnabled = $state(false);
  let currentIndex = $state(0);
  let internalPlaylist = $state<Smol[]>([]);

  // Initialize playlist on mount only
  $effect(() => {
    if (playlist.length > 0 && internalPlaylist.length === 0) {
      internalPlaylist = [...playlist];

      // Check for ?play param to auto-continue playback from /[id] page
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const playId = urlParams.get("play");
        if (playId) {
          const songIndex = internalPlaylist.findIndex((s) => s.Id === playId);
          if (songIndex >= 0) {
            currentIndex = songIndex;
            selectSong(internalPlaylist[songIndex]);
            // Clean up URL without reload
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      }
    }
  });

  // Register next callback for global audio
  $effect(() => {
    registerSongNextCallback(() => {
      playNext();
    });

    return () => {
      registerSongNextCallback(null);
    };
  });

  // Track current song from global state
  const currentSong = $derived(audioState.currentSong);
  const playing = $derived(isPlaying());
  const progress = $derived(audioState.progress);
  const duration = $derived(audioState.duration);

  // Local seek state to prevent jumping while dragging
  let isSeeking = $state(false);
  let seekValue = $state(0);

  // Display value prefers local seek value while dragging
  const displayProgress = $derived(isSeeking ? seekValue : progress);

  function handleSeekInput(e: Event) {
    const target = e.target as HTMLInputElement;
    isSeeking = true;
    seekValue = parseFloat(target.value);
  }

  function handleSeekEnd(e: Event) {
    const target = e.target as HTMLInputElement;
    const finalPercent = parseFloat(target.value);

    // Strict safety Rule 4: Only set currentTime
    if (audioState.audioElement && duration > 0) {
      const newTime = (finalPercent / 100) * duration;
      audioState.audioElement.currentTime = newTime;
    }

    // Reset seeking state after a tiny delay to let audio update catch up
    // ensuring smooth transition back to 'progress' tracking
    setTimeout(() => {
      isSeeking = false;
    }, 50);
  }

  // Like state for current song
  let isLiked = $derived(currentSong?.Liked ?? false);

  // Lyrics state
  let lyrics = $state<string>("");
  let lyricsLines = $derived(
    lyrics
      ? lyrics
          .split("\n")
          .map((l) => l.replace(/\[.*?\]/g, "").trim()) // Remove [brackets]
          .filter((l) => l.length > 0) // Remove empty lines
      : [],
  );
  let lyricsContainerRef = $state<HTMLDivElement | null>(null);

  // Fetch lyrics when song changes
  $effect(() => {
    const song = currentSong;
    if (!song?.Id) {
      lyrics = "";
      return;
    }

    // Fetch full song data with lyrics
    fetch(`${import.meta.env.PUBLIC_API_URL}/${song.Id}`)
      .then((res) => res.json())
      .then((data) => {
        const songLyrics = data?.kv_do?.lyrics?.lyrics || "";
        lyrics = songLyrics;
      })
      .catch(() => {
        lyrics = "";
      });
  });

  // Auto-scroll lyrics based on progress
  $effect(() => {
    const container = lyricsContainerRef;
    const isPlaying = playing;
    const lines = lyricsLines;

    if (!container || !isPlaying || lines.length === 0) return;

    // Simple direct scroll every 1 second
    const interval = setInterval(() => {
      const currentProgress = audioState.progress;
      const maxScroll = container.scrollHeight - container.clientHeight;
      const targetScroll = (currentProgress / 100) * maxScroll;
      container.scrollTop = targetScroll;
    }, 1000);

    return () => clearInterval(interval);
  });

  // Shared Audio Context Visualizer
  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let animationId: number | null = null;

  // Ensure global context is init (idempotent)
  $effect(() => {
    if (audioState.audioElement) {
      // Import dynamically to avoid circular deps if needed,
      // or just rely on the store being valid
      import("../../stores/audio.svelte").then(({ initAudioContext }) => {
        initAudioContext();
      });
    }
  });

  // Start visualizer loop using shared analyser
  $effect(() => {
    if (!canvasRef || !audioState.analyser) return;

    // Start drawing if not already running
    if (!animationId) {
      startVisualization();
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    };
  });

  function startVisualization() {
    if (!canvasRef) return;

    // Get latest state safely
    // Note: audioState.analyser is a live reference from the store
    if (!audioState.analyser) return;

    const canvas = canvasRef;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use the global analyser
    const analyser = audioState.analyser;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      const currentAnalyser = audioState.analyser;
      if (!ctx || !currentAnalyser || !canvas) return;

      animationId = requestAnimationFrame(draw);
      currentAnalyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw oscilloscope waveform
      ctx.beginPath();
      // Use the lime-500 color to match the theme
      ctx.strokeStyle = "#84cc16";
      ctx.lineWidth = 2;

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }

    draw();
  }

  function shuffleArray(arr: Smol[]): Smol[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function playFirst() {
    if (internalPlaylist.length > 0) {
      currentIndex = 0;
      selectSong(internalPlaylist[0]);
    }
  }

  function playPause() {
    if (!currentSong && internalPlaylist.length > 0) {
      playFirst();
    } else {
      togglePlayPause();
    }
  }

  function playNext() {
    const nextSong = getNextTrack(internalPlaylist, currentSong?.Id ?? null);
    if (nextSong) {
      // Sync local index in case it drifted (e.g. initial load)
      currentIndex = internalPlaylist.findIndex((s) => s.Id === nextSong.Id);
      selectSong(nextSong);
    }
  }

  // Register the next song callback with the global store
  $effect(() => {
    registerSongNextCallback(playNext);
    return () => registerSongNextCallback(null);
  });

  function playPrevious() {
    if (internalPlaylist.length === 0) return;
    currentIndex =
      (currentIndex - 1 + internalPlaylist.length) % internalPlaylist.length;
    selectSong(internalPlaylist[currentIndex]);
  }

  function toggleShuffle() {
    shuffleEnabled = !shuffleEnabled;

    if (shuffleEnabled) {
      // Shuffle the playlist
      const current = currentSong;
      let shuffled = shuffleArray(playlist);

      if (current) {
        // Move current song to front
        const idx = shuffled.findIndex((s) => s.Id === current.Id);
        if (idx > 0) {
          const temp = shuffled[0];
          shuffled[0] = shuffled[idx];
          shuffled[idx] = temp;
        }
        currentIndex = 0;
        // Skip to next song to demonstrate shuffle worked
        internalPlaylist = shuffled;
        playNext();
      } else {
        // No song playing - start first shuffled song
        internalPlaylist = shuffled;
        currentIndex = 0;
        selectSong(shuffled[0]);
      }
    } else {
      // Restore original order
      internalPlaylist = [...playlist];
      if (currentSong) {
        currentIndex = internalPlaylist.findIndex(
          (s) => s.Id === currentSong.Id,
        );
        if (currentIndex < 0) currentIndex = 0;
      }
    }
  }

  async function toggleLike() {
    if (!currentSong || !userState.contractId) return;

    try {
      if (isLiked) {
        await unlikeSmol(currentSong.Id);
        if (currentSong) currentSong.Liked = false;
      } else {
        await likeSmol(currentSong.Id);
        if (currentSong) currentSong.Liked = true;
      }
    } catch (e) {
      console.error("Failed to toggle like:", e);
    }
  }
</script>

<div
  class="w-full bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-4 mt-4"
>
  <div class="flex items-center gap-4">
    <!-- Controls -->
    <div class="flex items-center gap-2">
      <!-- Previous -->
      <button
        class="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white touch-manipulation active:scale-90"
        onclick={playPrevious}
        title="Previous"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      <!-- Play/Pause -->
      <button
        class="w-12 h-12 flex items-center justify-center rounded-full bg-lime-500 hover:bg-lime-400 transition-colors text-slate-900 touch-manipulation active:scale-95"
        onclick={playPause}
        title={playing ? "Pause" : "Play"}
      >
        {#if playing}
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        {:else}
          <svg class="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        {/if}
      </button>

      <!-- Next -->
      <button
        class="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white touch-manipulation active:scale-90"
        onclick={playNext}
        title="Next"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>

      <!-- Shuffle -->
      <button
        class="w-10 h-10 flex items-center justify-center rounded-full transition-colors touch-manipulation active:scale-90 {shuffleEnabled
          ? 'bg-lime-500/20 text-lime-400'
          : 'bg-white/5 text-white/50 hover:text-white'}"
        onclick={toggleShuffle}
        title="Shuffle"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
          />
        </svg>
      </button>
    </div>

    <!-- Song Info + Progress -->
    <div class="flex-1 min-w-0">
      <div class="text-white font-medium truncate text-sm">
        {currentSong?.Title ?? "No song selected"}
      </div>

      <!-- Progress Bar (Scrubber) -->
      <div class="mt-2 relative h-4 flex items-center group">
        <!-- Background Track -->
        <div
          class="absolute inset-x-0 h-1 bg-white/10 rounded-full overflow-hidden pointer-events-none"
        >
          <div
            class="h-full bg-lime-500 transition-all duration-100 ease-out"
            style="width: {displayProgress}%"
          ></div>
        </div>

        <!-- Interactive Slider -->
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={displayProgress}
          oninput={handleSeekInput}
          onchange={handleSeekEnd}
          class="absolute inset-0 w-full h-full opacity-0 hover:opacity-100 cursor-pointer accent-lime-500 z-10"
          aria-label="Seek slider"
        />
      </div>
    </div>

    <!-- Like Button -->
    <button
      class="w-10 h-10 flex items-center justify-center rounded-full transition-colors {isLiked
        ? 'text-red-500'
        : 'text-white/50 hover:text-red-400'}"
      onclick={toggleLike}
      title={isLiked ? "Unlike" : "Like"}
      disabled={!userState.contractId}
    >
      <svg
        class="w-6 h-6"
        fill={isLiked ? "currentColor" : "none"}
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  </div>

  <!-- Expanded Section: Album Art + Up Next -->
  {#if currentSong}
    <div class="flex gap-4 mt-4 pt-4 border-t border-white/10">
      <!-- Album Art -->
      <div class="flex-shrink-0">
        <img
          src={`${import.meta.env.PUBLIC_API_URL}/image/${currentSong.Id}.png?scale=8`}
          alt={currentSong.Title}
          class="w-24 h-24 rounded-lg object-cover shadow-lg"
        />
      </div>

      <!-- Lyrics Panel -->
      <div class="flex-1 relative h-24 overflow-hidden">
        {#if lyricsLines.length > 0}
          <!-- Fade overlay top -->
          <div
            class="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-slate-900/80 to-transparent z-10 pointer-events-none"
          ></div>

          <!-- Scrollable lyrics -->
          <div
            bind:this={lyricsContainerRef}
            class="lyrics-scroll h-full overflow-y-auto text-sm text-white/70 leading-relaxed px-2 py-1"
            style="scroll-behavior: smooth;"
          >
            {#each lyricsLines as line}
              <div class="py-0.5">
                {line}
              </div>
            {/each}
          </div>

          <!-- Fade overlay bottom -->
          <div
            class="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-slate-900/80 to-transparent z-10 pointer-events-none"
          ></div>
        {:else}
          <div
            class="h-full flex items-center justify-center text-white/30 text-sm italic"
          >
            Loading lyrics...
          </div>
        {/if}
      </div>
    </div>

    <!-- Full Width Waveform Visualizer -->
    <div class="mt-4 pt-4 border-t border-white/10">
      <canvas
        bind:this={canvasRef}
        width="512"
        height="64"
        class="w-full h-16 rounded-lg bg-black/40"
      ></canvas>
    </div>

    <!-- Up Next -->
    <div class="flex-1 min-w-0 mt-4">
      <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
        Up Next
      </h4>
      <div class="upnext-scroll space-y-1 max-h-20 overflow-y-auto">
        {#each internalPlaylist.slice(currentIndex + 1, currentIndex + 5) as track, i}
          <button
            class="w-full text-left text-sm truncate py-1 px-2 rounded hover:bg-white/5 transition-colors {i ===
            0
              ? 'text-lime-400'
              : 'text-white/70'}"
            onclick={() => {
              currentIndex = currentIndex + 1 + i;
              selectSong(track);
            }}
          >
            {i === 0 ? "▸ " : ""}{track.Title}
          </button>
        {/each}
        {#if internalPlaylist.length <= currentIndex + 1}
          <div class="text-white/30 text-sm italic">End of playlist</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Dark scrollbars */
  .lyrics-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .lyrics-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .lyrics-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }
  .lyrics-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .upnext-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .upnext-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .upnext-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }
  .upnext-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  /* Firefox */
  .lyrics-scroll,
  .upnext-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }
</style>
