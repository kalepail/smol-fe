<script lang="ts">
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    togglePlayPause,
    isPlaying,
    registerSongNextCallback,
    seek,
  } from "../../stores/audio.svelte";
  import { navigate } from "astro:transitions/client";

  import LikeButton from "../ui/LikeButton.svelte";
  import { userState } from "../../stores/user.svelte";

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
    onMint,
    isMinting,
    versions,
    currentVersionId,
    onVersionSelect,
    isAuthenticated,
    showMiniActions = true,
    overlayControlsOnMobile = false,
    onShare,
    onShuffle,
    onTogglePublish,
    isPublished,
    likeOnArt = false,
    enableContextBack = false,
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
    onMint?: () => void;
    isMinting?: boolean;
    isAuthenticated?: boolean;
    showMiniActions?: boolean;
    overlayControlsOnMobile?: boolean;
    onShare?: () => void;
    onShuffle?: () => void;
    onTogglePublish?: () => void;
    isPublished?: boolean;
    likeOnArt?: boolean;
    enableContextBack?: boolean;
  } = $props();

  // Context-aware back navigation
  let backContext = $state<{
    type: "radio" | "artist" | "home";
    label: string;
    url: string;
  } | null>(null);

  $effect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const from = params.get("from");
      if (from === "radio") {
        backContext = { type: "radio", label: "Back to Radio", url: "back" };
      } else if (from === "artist") {
        backContext = { type: "artist", label: "Back to Artist", url: "back" };
      }
    }
  });

  function handleContextBack() {
    if (backContext && backContext.url === "back") {
      window.history.back();
    } else {
      window.history.back();
    }
  }

  const currentSong = $derived(audioState.currentSong);
  const playing = $derived(isPlaying());
  const progress = $derived(audioState.progress);

  function playPause() {
    initAudioContext(); // ENSURE GESTURE UNLOCKS AUDIO CONTEXT FOR VISUALIZER
    if (!currentSong && playlist.length > 0) {
      selectSong(playlist[0]);
    } else {
      togglePlayPause();
    }
  }

  function triggerLogin() {
    window.dispatchEvent(new CustomEvent("smol:request-login"));
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

  // Register next callback for global audio
  $effect(() => {
    if (onNext) {
      registerSongNextCallback(() => {
        onNext && onNext();
      });
    }

    return () => {
      registerSongNextCallback(null);
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
      if (!ctx) return;
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

  function handleSeek(e: MouseEvent) {
    e.stopPropagation(); // prevent closing fullscreen or other clicks
    const bar = e.currentTarget as HTMLDivElement;
    const rect = bar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickProgress = Math.max(0, Math.min(100, (x / rect.width) * 100));
    seek(clickProgress);
  }
</script>

<div
  bind:this={containerRef}
  class="w-full relative {isFullscreen
    ? 'overflow-hidden'
    : 'w-full'} group/fs {isFullscreen
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
    class="relative transition-all duration-700 ease-in-out z-10 flex flex-col min-h-0 {isFullscreen
      ? 'w-full max-w-6xl px-8 flex-row items-center gap-12 h-screen'
      : 'w-full'}"
  >
    <div class="flex-1 flex flex-col items-center">
      <!-- ALBUM ART + CONTROLS WRAPPER (relative for absolute controls on mobile) -->
      <div
        class="{overlayControlsOnMobile
          ? 'relative'
          : ''} w-full flex flex-col items-center"
      >
        <!-- MERGED ALBUM ART + VISUALIZER -->
        <div
          class="relative shrink-0 shadow-2xl mx-auto transition-all duration-500 rounded-2xl overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center {isFullscreen
            ? 'max-h-[60vh] max-w-[60vh]'
            : 'max-w-full max-h-[35vh] lg:max-h-[400px] aspect-square min-h-[320px]'}"
          style="transform: translateZ(0); -webkit-transform: translateZ(0); -webkit-backdrop-filter: blur(10px);"
        >
          <!-- TOP SCRUBBER (mobile only when overlayControlsOnMobile) -->
          {#if overlayControlsOnMobile}
            <div
              class="absolute top-0 left-0 right-0 h-1 z-50 bg-white/10 group-hover/fs:h-2 transition-all cursor-pointer lg:hidden"
              onpointerdown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const p = x / rect.width;
                if (
                  audioState.audioElement &&
                  Number.isFinite(audioState.duration)
                ) {
                  audioState.audioElement.currentTime = p * audioState.duration;
                }
              }}
            >
              <div
                class="h-full bg-white/60 transition-all duration-200 ease-linear relative"
                style="width: {progress}%;"
              >
                <div
                  class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover/fs:opacity-100 transition-opacity"
                ></div>
              </div>
            </div>
          {/if}

          <!-- SPACER FOR ASPECT RATIO (Forces container to fit parent min dimension) -->
          <img
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E"
            alt=""
            class="block w-full h-full object-contain opacity-0 pointer-events-none relative z-0 {isFullscreen
              ? 'h-[60vh] w-[60vh]'
              : ''}"
            aria-hidden="true"
          />

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
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          {/if}

          <!-- Gradient overlay for text readability (only at bottom) -->
          <div
            class="absolute inset-0 z-20 bg-gradient-to-t from-black/95 via-transparent to-transparent pointer-events-none"
          ></div>
          <!-- Top Gradient for Text Contrast -->
          <div
            class="absolute inset-0 z-20 bg-gradient-to-b from-black/40 via-transparent to-transparent pointer-events-none h-32"
          ></div>

          <!-- Fallback icon -->
          <span
            class="absolute inset-0 flex items-center justify-center text-6xl text-white/5 font-mono"
            >📻</span
          >

          <!-- Visualizer Canvas (Bottom Bar) -->
          <div
            class="absolute bottom-16 left-0 right-0 h-24 z-30 pointer-events-none opacity-90"
          >
            <canvas
              bind:this={canvasRef}
              width="1024"
              height="128"
              class="w-full h-full"
            ></canvas>
          </div>

          <!-- CONTEXT AWARE BACK BUTTON (BOTTOM LEFT) -->
          {#if backContext && !isFullscreen}
            <div
              class="absolute bottom-4 left-4 z-40 animate-in fade-in zoom-in duration-300"
            >
              <button
                class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-full border shadow-[0_0_15px_rgba(0,0,0,0.3)] hover:scale-105 active:scale-95 group/back {backContext.type ===
                'radio'
                  ? 'border-[#f97316]/50 text-[#f97316] hover:bg-[#f97316]/20 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                  : 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]'}"
                onclick={(e) => {
                  e.stopPropagation();
                  handleContextBack();
                }}
                title={backContext.label}
              >
                {#if backContext.type === "radio"}
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"
                    ><path
                      d="M3.24 6.15C2.51 6.43 2 7.17 2 8v12a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8c0-.83-.51-1.57-1.24-1.85L13.24.47a1 1 0 0 0-.7.01L3.24 6.15zM4 8l8-4.66L20 8v12H4V8zm10 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"
                    /></svg
                  >
                {:else}
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"
                    ><path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    /></svg
                  >
                {/if}
              </button>
            </div>
          {/if}

          <!-- Song Info Overlay (Top Left) -->
          <div
            class="absolute top-0 left-0 right-16 p-6 z-30 pointer-events-none"
          >
            <div
              class="{isFullscreen
                ? songTitle?.length > 25
                  ? 'text-2xl'
                  : 'text-4xl'
                : songTitle?.length > 25
                  ? 'text-lg'
                  : 'text-2xl'} text-white font-bold tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] leading-tight"
              style="text-shadow: 0 0 2px rgba(0,0,0,0.5);"
            >
              {songTitle}
            </div>
            {#if songTags}
              <div
                class="{isFullscreen
                  ? 'text-base mt-2'
                  : 'text-xs mt-1'} text-purple-400 font-medium uppercase tracking-[0.2em] truncate drop-shadow-md"
                style="text-shadow: 0 2px 4px rgba(0,0,0,0.5);"
              >
                {songTags}
              </div>
            {/if}
          </div>

          <!-- FULLSCREEN TOGGLE BUTTONS (TOP RIGHT OF ART) -->
          <div
            class="absolute top-4 right-4 z-40 flex flex-col gap-2 {isFullscreen
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

            <!-- Radio Button (Orange Neon) -->
            {#if !isFullscreen}
              <button
                class="tech-button w-9 h-9 items-center justify-center transition-all bg-black/20 backdrop-blur-md rounded-full border border-[#f97316]/50 text-[#f97316] hover:bg-[#f97316]/20 shadow-[0_0_15px_rgba(249,115,22,0.2)] flex"
                onclick={(e) => {
                  e.stopPropagation();
                  const target = currentSong
                    ? `/radio?play=${currentSong.Id}`
                    : "/radio";
                  navigate(target);
                }}
                title="Go to Radio"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                  />
                </svg>
              </button>
            {/if}

            <!-- Mobile Song Detail Button (Double Note) - Under Radio -->
            {#if overlayControlsOnMobile && currentSong && !isFullscreen}
              <button
                class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/20 backdrop-blur-md rounded-full border border-[#d836ff]/50 text-[#d836ff] hover:bg-[#d836ff]/20 shadow-[0_0_15px_rgba(216,54,255,0.2)]"
                onclick={(e) => {
                  e.stopPropagation();
                  let from = "";
                  const path = window.location.pathname;
                  if (path.includes("/radio")) from = "?from=radio";
                  else if (path.includes("/artist")) from = "?from=artist";
                  navigate(`/${currentSong.Id}${from}`);
                }}
                title="View Song Details"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M21 3v12.5a3.5 3.5 0 1 1-2-3.163V5.44L9 7.557v9.943a3.5 3.5 0 1 1-2-3.163V5l14-2z"
                  />
                </svg>
              </button>

              <!-- Artist Link Button (Under Song Detail) -->
              <button
                class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/20 backdrop-blur-md rounded-full border border-[#9ae600]/50 text-[#9ae600] hover:bg-[#9ae600]/20 shadow-[0_0_15px_rgba(154,230,0,0.2)]"
                onclick={(e) => {
                  e.stopPropagation();
                  navigate(`/artist/${currentSong.Address}`);
                }}
                title="View Artist Page"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  />
                </svg>
              </button>
            {/if}
          </div>

          <!-- VERSION SELECTOR (BOTTOM CENTER OF ART - ABOVE PLAY BUTTON) -->
          {#if versions && versions.length > 1 && onVersionSelect}
            <div
              class="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2"
            >
              {#each versions as v}
                <button
                  class="px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border transition-all backdrop-blur-sm {currentVersionId ===
                  v.id
                    ? 'bg-white/20 text-white border-white/40'
                    : 'bg-black/20 text-white/30 border-white/10 hover:text-white hover:border-white/30'}"
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

          <!-- LIKE BUTTON ON ART WRAPPER (Top right of artwork, or relative placement) -->
          {#if likeOnArt && currentSong}
            {@const currentIdx = playlist.findIndex(
              (s) => s.Id === currentSong?.Id,
            )}
            {@const isLiked =
              currentIdx !== -1 ? playlist[currentIdx].Liked : false}

            <div class="absolute bottom-4 right-4 z-40">
              <LikeButton
                smolId={currentSong.Id}
                liked={!!isLiked}
                classNames="tech-button w-10 h-10 flex items-center justify-center active:scale-95 disabled:opacity-30 border rounded-full backdrop-blur-md transition-all duration-300 border-[#ff424c] shadow-[0_0_20px_rgba(255,66,76,0.3)] {isLiked
                  ? 'bg-[#ff424c] text-white'
                  : 'bg-[#ff424c]/10 text-[#ff424c] hover:bg-[#ff424c]/20'}"
                on:likeChanged={(e) => {
                  if (onToggleLike && currentIdx !== -1) {
                    onToggleLike(currentIdx, e.detail.liked);
                  }
                }}
              />
            </div>
          {/if}

          <!-- TOP SCRUBBER (mobile only when overlayControlsOnMobile) -->
          {#if overlayControlsOnMobile}
            <div
              role="button"
              tabindex="0"
              class="absolute top-0 left-0 right-0 h-4 -mt-2 z-50 flex items-center lg:hidden cursor-pointer group"
              onclick={handleSeek}
              onkeydown={(e) => {
                if (e.key === "Enter") handleSeek(e as unknown as MouseEvent);
              }}
            >
              <div
                class="w-full h-1 bg-white/10 transition-all group-hover:h-2"
              >
                <div
                  class="h-full bg-white/60 transition-all duration-200 ease-linear group-hover:bg-lime-400"
                  style="width: {progress}%;"
                ></div>
              </div>
            </div>
          {/if}

          <!-- DESKTOP/STANDARD SCRUBBER (Top of art) -->
          {#if !overlayControlsOnMobile}
            <div
              role="button"
              tabindex="0"
              class="absolute top-0 left-0 right-0 h-4 -mt-2 z-50 flex items-center cursor-pointer group"
              onclick={handleSeek}
              onkeydown={(e) => {
                if (e.key === "Enter") handleSeek(e as unknown as MouseEvent);
              }}
            >
              <div
                class="w-full h-1 bg-white/10 transition-all group-hover:h-2"
              >
                <div
                  class="h-full bg-white/80 transition-all duration-200 ease-linear group-hover:bg-white"
                  style="width: {progress}%;"
                ></div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Controls (below art in standard, absolute on art for overlayControlsOnMobile on mobile) -->
        <div
          class="flex items-center justify-center gap-2 sm:gap-4 md:gap-6 transition-all duration-500 {overlayControlsOnMobile
            ? 'absolute bottom-12 left-0 right-0 z-40 lg:relative lg:bottom-auto lg:mt-1 lg:pb-0'
            : 'mt-1 pb-0'} {isFullscreen
            ? showControls
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4 pointer-events-none'
            : ''}"
        >
          <!-- LIKE BUTTON (Left of controls) - HIDDEN IF ON ART -->
          {#if currentSong && !likeOnArt}
            {@const currentIdx = playlist.findIndex(
              (s) => s.Id === currentSong?.Id,
            )}
            {@const isLiked =
              currentIdx !== -1 ? playlist[currentIdx].Liked : false}

            <LikeButton
              smolId={currentSong.Id}
              liked={!!isLiked}
              classNames="tech-button w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center active:scale-95 disabled:opacity-30 border rounded-full backdrop-blur-md transition-all duration-300 border-[#ff424c] shadow-[0_0_20px_rgba(255,66,76,0.3)] {isLiked
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
            class="tech-button w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20 rounded-full bg-white/5 backdrop-blur-md"
            onclick={(e) => {
              if (backContext && enableContextBack) {
                window.history.back();
              } else {
                handlePrev && handlePrev();
              }
            }}
            title={backContext && enableContextBack
              ? backContext.label
              : "Previous"}
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            class="tech-button w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center active:scale-95 transition-all relative overflow-hidden group rounded-full backdrop-blur-xl border border-[#089981] text-[#089981] bg-[#089981]/10 shadow-[0_0_30px_rgba(8,153,129,0.4)] hover:bg-[#089981]/20 hover:text-white hover:shadow-[0_0_40px_rgba(8,153,129,0.6)]"
            onclick={playPause}
            title={playing ? "Pause" : "Play"}
          >
            {#if playing}
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            {:else}
              <svg class="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            {/if}
          </button>

          <!-- NEXT BUTTON -->
          <button
            class="tech-button w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20 rounded-full bg-white/5 backdrop-blur-md"
            onclick={handleNext}
            title="Next"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          <!-- SHUFFLE BUTTON (mobile only when overlayControlsOnMobile) -->
          {#if onShuffle && overlayControlsOnMobile}
            <button
              class="tech-button w-8 h-8 sm:w-10 sm:h-10 flex lg:hidden items-center justify-center text-lime-400 hover:text-lime-300 active:scale-95 border border-lime-500/30 hover:border-lime-400/50 rounded-full bg-lime-500/10 backdrop-blur-md"
              onclick={onShuffle}
              title="Shuffle Playlist"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path
                  d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                />
              </svg>
            </button>
          {/if}

          <!-- SONG DETAIL BUTTON (hidden on mobile when overlayControlsOnMobile) -->
          {#if currentSong && showMiniActions}
            <a
              href={`/${currentSong.Id}`}
              class="tech-button w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border border-[#d836ff] text-[#d836ff] bg-[#d836ff]/10 hover:bg-[#d836ff]/20 shadow-[0_0_15px_rgba(216,54,255,0.3)] {overlayControlsOnMobile
                ? 'hidden lg:flex'
                : ''}"
              title="View Song Details"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path
                  d="M21 3v12.5a3.5 3.5 0 1 1-2-3.163V5.44L9 7.557v9.943a3.5 3.5 0 1 1-2-3.163V5l14-2z"
                />
              </svg>
            </a>
          {/if}

          <!-- TRADE BUTTON (hidden on mobile when overlayControlsOnMobile) -->
          {#if onTrade && showMiniActions}
            <button
              class="tech-button w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border border-blue-400 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.3)] {overlayControlsOnMobile
                ? 'hidden lg:flex'
                : ''}"
              onclick={() => {
                if (!userState.contractId) {
                  triggerLogin();
                  return;
                }
                onTrade?.();
              }}
              title="Trade / Swap"
            >
              <svg
                class="w-4 h-4"
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

          <!-- PUBLISH/UNPUBLISH BUTTON (Owner Only) -->
          {#if onTogglePublish}
            <button
              class="px-3 h-10 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border text-[10px] font-bold uppercase tracking-widest {isPublished
                ? 'border-amber-500/50 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                : 'border-blue-500/50 text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.3)]'} {overlayControlsOnMobile
                ? 'hidden lg:flex'
                : ''}"
              onclick={onTogglePublish}
            >
              {isPublished ? "Unpublish" : "Publish"}
            </button>
          {/if}

          {#if onRegenerate}
            <button
              class="tech-button w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border border-[#F7931A] text-[#F7931A] bg-[#F7931A]/10 shadow-[0_0_20px_rgba(247,147,26,0.3)] hover:bg-[#F7931A]/20 hover:text-white"
              onclick={handleRegenerate}
              title="Regenerate Station"
            >
              <span class="text-xl">↻</span>
            </button>
          {/if}
        </div>

        <!-- Compact Mint/Share buttons for mobile (below controls when overlayControlsOnMobile) -->
        {#if overlayControlsOnMobile}
          <div
            class="absolute bottom-2 left-0 right-0 z-40 flex justify-center gap-2 px-4 lg:hidden"
          >
            {#if onMint}
              <button
                onclick={() => {
                  if (!userState.contractId) {
                    triggerLogin();
                    return;
                  }
                  onMint?.();
                }}
                disabled={isMinting}
                class="flex-1 max-w-[140px] py-1.5 bg-[#d836ff]/80 backdrop-blur-md text-white text-[10px] font-bold rounded-lg uppercase tracking-wider"
              >
                {isMinting ? "..." : "Mint"}
              </button>
            {/if}
            {#if onTrade}
              <button
                onclick={() => {
                  if (!userState.contractId) {
                    triggerLogin();
                    return;
                  }
                  onTrade?.();
                }}
                class="flex-1 max-w-[140px] py-1.5 bg-[#2775ca]/80 backdrop-blur-md text-white text-[10px] font-bold rounded-lg uppercase tracking-wider"
              >
                Trade
              </button>
            {/if}
            {#if onShare}
              <button
                onclick={onShare}
                class="px-4 py-1.5 bg-white/10 backdrop-blur-md text-white text-[10px] font-bold rounded-lg uppercase tracking-wider border border-white/10"
              >
                Share
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Scrubber (Bottom of Player - hidden on mobile when overlayControlsOnMobile) -->
      <div
        class="px-8 pb-1 mt-2 w-full max-w-[400px] sm:max-w-[500px] mx-auto cursor-pointer {overlayControlsOnMobile
          ? 'hidden lg:block'
          : ''}"
        onpointerdown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const p = Math.max(0, Math.min(1, x / rect.width));
          if (audioState.audioElement && Number.isFinite(audioState.duration)) {
            audioState.audioElement.currentTime = p * audioState.duration;
          }
        }}
      >
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
                  src="{API_URL}/image/{song.Id}.png?scale=8"
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
                    ((e.currentTarget as HTMLElement).style.color =
                      accentColor)}
                  onmouseleave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "")}
                  onclick={(e) => e.stopPropagation()}
                >
                  {song.Address?.slice(0, 12) || "Unknown"}...
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

  {#if isFullscreen}
    <button
      class="fixed top-6 right-6 z-[120] text-white/40 hover:text-white hover:bg-white/10 p-3 rounded-full transition-all backdrop-blur-md bg-black/20"
      onclick={toggleFullscreen}
      title="Exit Fullscreen"
    >
      <svg
        class="w-6 h-6"
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
    </button>
  {/if}
</div>
