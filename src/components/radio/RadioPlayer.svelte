<script lang="ts">
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    togglePlayPause,
    isPlaying,
  } from "../../stores/audio.svelte";

  import LikeButton from "../ui/LikeButton.svelte";

  let {
    playlist = [],
    onNext,
    onPrev,
    onRegenerate,
    onSelect,
    currentIndex,
    accentColor = "#9ae600",
    onToggleLike,
    onTrade,
    versions,
    currentVersionId,
    onVersionSelect,
  }: {
    playlist: Smol[];
    onNext?: () => void;
    onPrev?: () => void;
    onRegenerate?: () => void;
    onSelect?: (index: number) => void;
    onToggleLike?: (index: number, liked: boolean) => void;
    onTrade?: () => void;
    currentIndex?: number;
    accentColor?: string;
    versions?: { id: string; label: string; isBest: boolean }[];
    currentVersionId?: string;
    onVersionSelect?: (id: string) => void;
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

  function handleRegenerate() {
    if (onRegenerate) onRegenerate();
  }

  const API_URL = import.meta.env.PUBLIC_API_URL;
  const coverUrl = $derived(
    currentSong ? `${API_URL}/image/${currentSong.Id}.png?scale=8` : null,
  );
  const songTitle = $derived(
    currentSong?.lyrics?.title || currentSong?.Title || "Select a song",
  );
  const songTags = $derived(
    currentSong?.lyrics?.style?.slice(0, 3).join(", ") || "",
  );

  import { initAudioContext } from "../../stores/audio.svelte";

  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let animationId: number | null = null;
  let containerRef = $state<HTMLDivElement | null>(null);
  let isFullscreen = $state(false);
  let showControls = $state(true);
  let showQueue = $state(false);
  let controlsTimeout: number | null = null;

  function toggleFullscreen() {
    if (!containerRef) return;

    if (!document.fullscreenElement) {
      containerRef.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  $effect(() => {
    const handleFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement;
      if (!isFullscreen && controlsTimeout) {
        clearTimeout(controlsTimeout);
        showControls = true;
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  });

  function handleMouseMove() {
    if (!isFullscreen) return;
    showControls = true;
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = window.setTimeout(() => {
      showControls = false;
    }, 3000);
  }

  $effect(() => {
    // This effect runs when `playing` changes
    const shouldAnimate = playing;

    // Always clean up previous animation first
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (shouldAnimate) {
      initAudioContext();
      startVis();
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    };
  });

  function startVis() {
    if (!canvasRef) return;
    const canvas = canvasRef;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Simulation state
    let zeroFrames = 0; // Count frames of TOTAL invalid zeros (broken context)
    let phase = 0;

    // Initialize with 128 (Silence) to prevent startup spike
    const bufferLength = 256; // Matching analyser.fftSize
    let lastDataArray = new Uint8Array(bufferLength).fill(128);
    let dataArray = new Uint8Array(bufferLength);

    function draw() {
      // CRITICAL: Read playing state directly from store, not closure
      if (!isPlaying()) return;
      animationId = requestAnimationFrame(draw);

      const currentAnalyser = audioState.analyser;
      let isBroken = false;

      // 1. Try to get real data
      if (currentAnalyser) {
        currentAnalyser.getByteTimeDomainData(dataArray);

        let zeroCount = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          if (val === 0) zeroCount++;
        }

        // If >90% of frame is EXACTLY 0, it's a broken context
        if (zeroCount > bufferLength * 0.9) {
          isBroken = true;
        }
      } else {
        isBroken = true;
      }

      // 2. Track Broken State
      if (isBroken) {
        zeroFrames++;
      } else {
        zeroFrames = 0;
      }

      // Auto-heal
      if (zeroFrames > 120 && currentAnalyser) {
        initAudioContext(true);
        zeroFrames = 0;
      }

      // 3. Draw Frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isFs = !!document.fullscreenElement;
      ctx.lineWidth = 5; // Thicker lines for visibility
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 25; // Stronger glow
      ctx.shadowColor = "rgba(168, 85, 247, 0.8)";

      // Gradient for the line
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, accentColor);
      gradient.addColorStop(0.5, "#a855f7");
      gradient.addColorStop(1, "#f97316");
      ctx.strokeStyle = gradient;

      ctx.beginPath();
      const centerY = canvas.height / 2;

      ctx.beginPath();

      if (zeroFrames > 5 || !currentAnalyser) {
        // Simulation fallback
        phase += 0.02; // Slower simulation (was 0.05)
        ctx.moveTo(0, centerY);
        for (let i = 0; i < canvas.width; i += 10) {
          const y = centerY + Math.sin(i * 0.01 + phase) * 20;
          ctx.lineTo(i, y);
        }
      } else {
        // Temporal Smoothing (Lerp)
        for (let i = 0; i < bufferLength; i++) {
          const target = dataArray[i];
          // Balanced reaction: fast enough for details, slow enough to be smooth (0.12)
          lastDataArray[i] += (target - lastDataArray[i]) * 0.12;
        }

        // Spatial Smoothing (Moving Average) - Removes "jaggies"
        const smoothed = new Float32Array(bufferLength);
        for (let i = 1; i < bufferLength - 1; i++) {
          smoothed[i] =
            (lastDataArray[i - 1] + lastDataArray[i] + lastDataArray[i + 1]) /
            3;
        }
        smoothed[0] = lastDataArray[0];
        smoothed[bufferLength - 1] = lastDataArray[bufferLength - 1];

        const sliceWidth = canvas.width / bufferLength;
        const BOOST = isFs ? 4.0 : 3.0; // Slightly bigger (was 2.5) for visibility
        let x = 0;

        // Start at first point
        let v0 = (smoothed[0] - 128) / 128.0;
        // Non-linear Expansion (Bass Boost): Exaggerate peaks
        // v * (1 + |v| * 3) -> louder sounds get much bigger
        v0 = v0 * (1 + Math.abs(v0) * 3);

        const y0 = centerY + v0 * (canvas.height / 2) * BOOST;
        ctx.moveTo(0, y0);

        // Curve Smoothing
        for (let i = 1; i < bufferLength - 2; i++) {
          let v = (smoothed[i] - 128) / 128.0;
          v = v * (1 + Math.abs(v) * 3); // Expand
          const y = centerY + v * (canvas.height / 2) * BOOST;

          let vNext = (smoothed[i + 1] - 128) / 128.0;
          vNext = vNext * (1 + Math.abs(vNext) * 3); // Expand
          const yNext = centerY + vNext * (canvas.height / 2) * BOOST;

          const xc = (x + (x + sliceWidth)) / 2;
          const yc = (y + yNext) / 2;

          ctx.quadraticCurveTo(x, y, xc, yc);
          x += sliceWidth;
        }

        // Connect to end
        ctx.lineTo(canvas.width, centerY);
      }

      ctx.stroke();
    }

    animationId = requestAnimationFrame(draw);
  }
</script>

<div
  bind:this={containerRef}
  class="w-full relative {isFullscreen
    ? 'overflow-hidden'
    : ''} group/fs {isFullscreen
    ? 'fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center'
    : ''}"
  onmousemove={handleMouseMove}
>
  <!-- FULLSCREEN BACKGROUND (BLURRED ART) -->
  {#if isFullscreen && coverUrl}
    <div class="absolute inset-0 z-0">
      <img
        src={coverUrl}
        alt=""
        class="w-full h-full object-cover opacity-30 blur-[100px] scale-110"
      />
      <div class="absolute inset-0 bg-black/40"></div>
    </div>
  {/if}

  <!-- MAIN PLAYER AREA -->
  <div
    class="relative transition-all duration-700 ease-in-out z-10 {isFullscreen
      ? 'w-full max-w-6xl px-8 flex flex-row items-center gap-12'
      : 'w-full'}"
  >
    <div class="flex-1 flex flex-col items-center">
      <!-- MERGED ALBUM ART + VISUALIZER -->
      <div
        class="relative w-full aspect-square {isFullscreen
          ? 'max-h-[60vh] max-w-[60vh]'
          : 'max-h-[320px] max-w-[320px] sm:max-h-[340px] sm:max-w-[340px]'} rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-2xl mx-auto transition-all duration-500 isolate"
        style="clip-path: inset(0 round 1rem);"
      >
        <!-- Album Art Background (Blurred & Zoomed) -->
        {#if coverUrl}
          <div class="absolute inset-0 z-0">
            <img
              src={coverUrl}
              alt=""
              class="w-full h-full object-cover opacity-50 blur-2xl scale-110"
            />
            <div class="absolute inset-0 bg-black/20"></div>
          </div>

          <!-- Main Art (Contained) -->
          <img
            src={coverUrl}
            alt={songTitle}
            class="absolute inset-0 w-full h-full object-contain z-10 rounded-2xl transition-opacity duration-300 {isFullscreen
              ? 'opacity-100'
              : 'opacity-100'}"
            onerror={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        {/if}

        <!-- Gradient overlay for text readability (only at bottom) -->
        <div
          class="absolute inset-0 z-20 bg-gradient-to-t from-black/95 via-transparent to-transparent pointer-events-none"
        ></div>

        <!-- Fallback icon -->
        <span
          class="absolute inset-0 flex items-center justify-center text-6xl text-white/5 font-mono"
          >📻</span
        >

        <!-- Visualizer Canvas (Bottom Bar) -->
        <div
          class="absolute bottom-0 left-0 right-0 h-24 z-30 pointer-events-none opacity-90"
        >
          <canvas
            bind:this={canvasRef}
            width="1024"
            height="128"
            class="w-full h-full"
          ></canvas>
        </div>

        <!-- Song Info Overlay (Top Left) -->
        <div class="absolute top-0 left-0 p-6 z-30">
          <div
            class="{isFullscreen
              ? 'text-4xl'
              : 'text-2xl'} text-white font-bold tracking-tight truncate drop-shadow-2xl"
          >
            {songTitle}
          </div>
          {#if songTags}
            <div
              class="{isFullscreen
                ? 'text-base mt-2'
                : 'text-xs mt-1'} text-purple-400 font-medium uppercase tracking-[0.2em] truncate drop-shadow-md"
            >
              {songTags}
            </div>
          {/if}

          <!-- VERSION SELECTOR -->
          {#if versions && versions.length > 0}
            <div class="flex items-center gap-2 mt-3">
              {#each versions as v}
                <button
                  class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded border transition-all {currentVersionId ===
                  v.id
                    ? 'bg-white text-black border-white'
                    : 'bg-transparent text-white/40 border-white/20 hover:text-white hover:border-white/40'}"
                  onclick={(e) => {
                    e.stopPropagation();
                    onVersionSelect?.(v.id);
                  }}
                >
                  {v.label}
                  {#if v.isBest}
                    <span class="ml-1 text-[#d836ff]">★</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- FULLSCREEN TOGGLE BUTTONS (TOP RIGHT OF ART) -->
        <div
          class="absolute top-4 right-4 z-40 flex gap-2 {isFullscreen
            ? 'opacity-0 group-hover/fs:opacity-100 transition-opacity'
            : ''}"
        >
          <!-- Queue Toggle (Fullscreen Only) -->
          {#if isFullscreen}
            <button
              class="tech-button p-2 text-white/40 hover:text-white transition-all bg-black/40 backdrop-blur-md rounded-lg border border-white/5 hover:border-white/20 {showQueue
                ? 'text-purple-400 border-purple-500/50 bg-purple-500/10'
                : ''}"
              onclick={(e) => {
                e.stopPropagation();
                showQueue = !showQueue;
              }}
              title="Toggle Queue"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          {/if}

          <button
            class="tech-button p-2 text-white/40 hover:text-white transition-all bg-black/40 backdrop-blur-md rounded-lg border border-white/5 hover:border-white/20"
            onclick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
          >
            {#if isFullscreen}
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            {:else}
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <!-- Controls (below art in standard, bottom in fullscreen) -->
      <div
        class="flex items-center justify-center gap-4 sm:gap-6 mt-3 pb-0 transition-all duration-500 {isFullscreen
          ? showControls
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
          : ''}"
      >
        <!-- LIKE BUTTON (Left of controls) -->
        {#if currentSong}
          {@const currentIdx = playlist.findIndex(
            (s) => s.Id === currentSong?.Id,
          )}
          {@const isLiked =
            currentIdx !== -1 ? playlist[currentIdx].Liked : false}

          <LikeButton
            smolId={currentSong.Id}
            liked={!!isLiked}
            classNames="tech-button w-12 h-12 flex items-center justify-center active:scale-95 disabled:opacity-30 border rounded-full backdrop-blur-md transition-all duration-300 border-[#ff424c] shadow-[0_0_20px_rgba(255,66,76,0.3)] {isLiked
              ? 'bg-[#ff424c] text-white'
              : 'bg-[#ff424c]/10 text-[#ff424c] hover:bg-[#ff424c]/20'}"
            on:likeChanged={(e) => {
              if (onToggleLike && currentIdx !== -1) {
                onToggleLike(currentIdx, e.detail.liked);
              }
            }}
          />
        {/if}

        <button
          class="tech-button w-12 h-12 flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20 rounded-full bg-white/5 backdrop-blur-md"
          onclick={handlePrev}
          title="Previous"
        >
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          class="tech-button w-20 h-20 flex items-center justify-center active:scale-95 transition-all relative overflow-hidden group rounded-full backdrop-blur-xl border border-[#089981] text-[#089981] bg-[#089981]/10 shadow-[0_0_30px_rgba(8,153,129,0.4)] hover:bg-[#089981]/20 hover:text-white hover:shadow-[0_0_40px_rgba(8,153,129,0.6)]"
          onclick={playPause}
          title={playing ? "Pause" : "Play"}
        >
          {#if playing}
            <svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          {:else}
            <svg class="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          {/if}
        </button>

        <!-- NEXT BUTTON -->
        <button
          class="tech-button w-12 h-12 flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20 rounded-full bg-white/5 backdrop-blur-md"
          onclick={handleNext}
          title="Next"
        >
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <!-- TRADE BUTTON -->
        {#if onTrade}
          <button
            class="tech-button w-12 h-12 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border border-blue-400 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            onclick={onTrade}
            title="Trade / Swap"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </button>
        {/if}

        {#if onRegenerate}
          <button
            class="tech-button w-12 h-12 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border border-[#F7931A] text-[#F7931A] bg-[#F7931A]/10 shadow-[0_0_20px_rgba(247,147,26,0.3)] hover:bg-[#F7931A]/20 hover:text-white"
            onclick={handleRegenerate}
            title="Regenerate Station"
          >
            <span class="text-xl">↻</span>
          </button>
        {/if}
      </div>

      <!-- Scrubber (Bottom of Player) -->
      <div class="px-8 pb-6 mt-6 w-full max-w-[400px] sm:max-w-[500px] mx-auto">
        <div
          class="h-1.5 bg-white/10 rounded-full overflow-hidden w-full backdrop-blur-sm"
        >
          <div
            class="h-full transition-all duration-200 ease-linear"
            style="width: {progress}%; background-color: {accentColor}; box-shadow: 0 0 10px {accentColor};"
          ></div>
        </div>
      </div>
    </div>

    <!-- FULLSCREEN QUEUE SIDE PANEL -->
    {#if isFullscreen && showQueue}
      <div
        class="w-96 h-[70vh] bg-black/40 backdrop-blur-3xl border border-white/10 rounded-2xl z-50 flex flex-col animate-in slide-in-from-right duration-700 shadow-2xl"
        onclick={(e) => e.stopPropagation()}
      >
        <div
          class="p-6 border-b border-white/10 flex items-center justify-between"
        >
          <h3 class="text-white font-bold tracking-widest uppercase text-xs">
            Queue
          </h3>
          <button
            class="text-white/40 hover:text-white transition-colors"
            onclick={() => (showQueue = false)}>✕</button
          >
        </div>
        <div class="flex-1 overflow-y-auto dark-scrollbar py-4 px-2">
          {#each playlist as song, index}
            <button
              class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left rounded-lg group/item {index ===
              currentIndex
                ? 'bg-purple-500/10'
                : ''}"
              onclick={() => {
                if (onSelect) onSelect(index);
              }}
            >
              <div
                class="relative w-10 h-10 rounded bg-white/5 flex-shrink-0 overflow-hidden"
              >
                <img
                  src="{API_URL}/image/{song.Id}.png"
                  alt=""
                  class="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-500"
                />
                {#if index === currentIndex}
                  <div
                    class="absolute inset-0 bg-purple-500/20 flex items-center justify-center"
                  >
                    <div
                      class="w-1.5 h-1.5 bg-purple-400 rounded-full animate-ping"
                    ></div>
                  </div>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div
                  class="text-sm font-bold {index === currentIndex
                    ? 'text-purple-400'
                    : 'text-white/80'} truncate lowercase tracking-tighter"
                >
                  {song.Title || "Untitled"}
                </div>
                <a
                  href="/artist/{song.Address}"
                  class="text-[10px] text-white/30 uppercase tracking-widest truncate mt-0.5 block transition-colors hover:underline"
                  style="--accent-hover: {accentColor}"
                  onmouseenter={(e) =>
                    (e.currentTarget.style.color = accentColor)}
                  onmouseleave={(e) => (e.currentTarget.style.color = "")}
                  onclick={(e) => e.stopPropagation()}
                >
                  {song.Address.slice(0, 12)}...
                </a>
              </div>

              <div onclick={(e) => e.stopPropagation()}>
                <LikeButton
                  smolId={song.Id}
                  liked={song.Liked || false}
                  classNames="p-2 text-white/40 hover:text-[#ff424c] hover:bg-white/5 rounded-full transition-colors"
                  on:likeChanged={(e) => {
                    if (onToggleLike) onToggleLike(index, e.detail.liked);
                  }}
                />
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
