<script lang="ts">
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    togglePlayPause,
    isPlaying,
  } from "../../stores/audio.svelte";

  let {
    playlist = [],
    onNext,
    onPrev,
  }: {
    playlist: Smol[];
    onNext?: () => void;
    onPrev?: () => void;
  } = $props();

  const currentSong = $derived(audioState.currentSong);
  const playing = $derived(isPlaying());
  const progress = $derived(audioState.progress);

  function playPause() {
    if (!currentSong && playlist.length > 0) {
      selectSong(playlist[0]);
    } else {
      togglePlayPause();
    }
  }

  function handlePrev() {
    if (onPrev) onPrev();
  }

  function handleNext() {
    if (onNext) onNext();
  }

  const API_URL = import.meta.env.PUBLIC_API_URL;
  const coverUrl = $derived(
    currentSong ? `${API_URL}/image/${currentSong.Id}.png` : null,
  );
  const songTitle = $derived(
    currentSong?.lyrics?.title || currentSong?.Title || "Select a song",
  );
  const songTags = $derived(
    currentSong?.lyrics?.style?.slice(0, 3).join(", ") || "",
  );
</script>

<div
  class="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-purple-500/20 p-4"
>
  <div class="flex items-center gap-4">
    <!-- Album Art -->
    <span
      class="w-16 h-16 rounded-lg bg-slate-800 flex-shrink-0 relative overflow-hidden shadow-lg"
    >
      {#if coverUrl}
        <img
          src={coverUrl}
          alt={songTitle}
          class="w-full h-full object-cover"
          onerror={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      {/if}
      <span
        class="absolute inset-0 flex items-center justify-center text-2xl text-slate-500"
        >📻</span
      >
    </span>

    <!-- Song Info -->
    <div class="flex-1 min-w-0">
      <div class="text-white font-medium truncate">{songTitle}</div>
      {#if songTags}
        <div class="text-purple-400 text-sm truncate">{songTags}</div>
      {/if}
      <!-- Progress Bar -->
      <div class="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          class="h-full bg-purple-500 transition-all duration-200"
          style="width: {progress}%"
        ></div>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-2">
      <button
        class="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white disabled:opacity-30"
        onclick={handlePrev}
        title="Previous"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      <button
        class="w-14 h-14 flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-500 transition-colors text-white"
        onclick={playPause}
        title={playing ? "Pause" : "Play"}
      >
        {#if playing}
          <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        {:else}
          <svg class="w-7 h-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        {/if}
      </button>

      <button
        class="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white disabled:opacity-30"
        onclick={handleNext}
        title="Next"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>
    </div>
  </div>
</div>
