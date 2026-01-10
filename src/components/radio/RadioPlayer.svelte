<script lang="ts">
  import type { Smol } from "../../types/domain";
  import {
    audioState,
    selectSong,
    togglePlayPause,
    isPlaying,
    registerSongNextCallback,
    seek,
    toggleRepeatMode,
  } from "../../stores/audio.svelte";
  import { navigate } from "astro:transitions/client";

  import LikeButton from "../ui/LikeButton.svelte";
  import AudioManager from "../audio/AudioManager.svelte";
  import { userState } from "../../stores/user.svelte";
  import { buildRadioUrl } from "../../utils/radio";

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
    onTip,
    onTogglePublish,
    isPublished,
    likeOnArt = false,
    enableContextBack = false,
    replaceDetailWithRegenerate = false,
    showSongDetailButton = true,
    playButtonVariant = "default",
    overlayControls = false,
    variant = "default",
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
    overlayControlsOnMobile?: boolean; // legacy
    overlayControls?: boolean;
    onShare?: () => void;
    onTip?: () => void;
    onShuffle?: () => void;
    onTogglePublish?: () => void;
    isPublished?: boolean;
    likeOnArt?: boolean;
    enableContextBack?: boolean;
    backContext?: { label: string; type: "radio" | "default" };
    replaceDetailWithRegenerate?: boolean;
    showSongDetailButton?: boolean;
    playButtonVariant?: "default" | "silver";
    variant?: "default" | "arcade";
  } = $props();

  const isOverlay = $derived(overlayControls || overlayControlsOnMobile);

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

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
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
  let isMinimized = $state(false); // Mobile minimize mode - hide art, show playlist
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
      // ctx.shadowBlur = 25; // Removed for performance & sharp hardware look
      // ctx.shadowColor = "rgba(168, 85, 247, 0.8)";

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

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      playPause();
    }
  }

  // --- Mobile Gestures ---
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwipe = false;
  const SWIPE_THRESHOLD = 50;

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwipe = false;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.changedTouches.length !== 1) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Check availability of actions
    const canPrev = !!onPrev;
    const canNext = !!onNext;

    // Check if horizontal swipe dominant
    if (
      Math.abs(deltaX) > Math.abs(deltaY) &&
      Math.abs(deltaX) > SWIPE_THRESHOLD
    ) {
      // Swipe detected
      isSwipe = true;
      if (deltaX > 0 && canPrev) {
        // Swipe Right -> Prev
        handlePrev();
      } else if (deltaX < 0 && canNext) {
        // Swipe Left -> Next
        handleNext();
      }
    }
  }

  function handleArtClick(e: MouseEvent) {
    if (isSwipe) {
      isSwipe = false;
      return;
    }
    // Only toggle if not clicking a child button/scrubber
    // (Though most children stop propagation, good to be safe)
    playPause();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  bind:this={containerRef}
  class="w-full relative {isFullscreen
    ? 'overflow-hidden'
    : 'w-full'} group/fs {isFullscreen
    ? 'fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center'
    : ''}"
  onmousemove={handleMouseMove}
>
  <!-- AudioManager works fine inside div -->
  <AudioManager {playlist} />

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
        class="{isOverlay ? 'relative' : ''} w-full flex flex-col items-center"
      >
        <!-- MINIMIZED HEADER BAR (Mobile Only - just song info + expand button) -->
        {#if isMinimized}
          <div
            class="md:hidden w-full bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 mb-3 min-h-[160px]"
          >
            <!-- Song Info Row with Expand Button -->
            <div class="flex items-center gap-3">
              <img
                src={coverUrl || "/placeholder.png"}
                alt={songTitle}
                class="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
              <!-- Main Player View -->
              <div class="flex-1 min-w-0" data-role="player-mobile">
                <div class="flex flex-col h-full justify-end">
                  <div
                    class="text-white font-pixel font-bold tracking-wide uppercase text-xs truncate"
                  >
                    {songTitle}
                  </div>
                  <div
                    class="text-white/50 font-pixel tracking-wide uppercase text-[10px] truncate"
                  >
                    {songTags || "Now Playing"}
                  </div>
                </div>
              </div>

              <!-- Extra Mobile Buttons (Radio, Song, Artist) -->
              <div class="flex items-center gap-2 mr-2 relative z-50">
                <!-- Radio / Regenerate (Orange Tower) -->
                {#if onRegenerate}
                  <button
                    class="w-7 h-7 flex items-center justify-center rounded-full bg-[#f7931a]/10 hover:bg-[#f7931a]/20 border border-[#f7931a]/30 text-[#f7931a] transition-colors active:scale-95"
                    onclick={(e) => {
                      e.stopPropagation();
                      handleRegenerate();
                    }}
                    title="Send to Radio"
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                      />
                    </svg>
                  </button>
                {/if}

                <!-- Song ID (Pink Double Note) -->
                <a
                  href={`/${currentSong?.Id || ""}`}
                  class="w-7 h-7 flex items-center justify-center rounded-full bg-[#d836ff]/10 hover:bg-[#d836ff]/20 border border-[#d836ff]/30 text-[#d836ff] transition-colors active:scale-95"
                  onclick={(e) => e.stopPropagation()}
                  title="Song Details"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                </a>

                <!-- Artist Page (Green Profile) -->
                <a
                  href={`/artist/${currentSong?.Address || ""}${currentSong?.Id ? `?play=${currentSong.Id}` : ""}`}
                  class="w-7 h-7 flex items-center justify-center rounded-full bg-[#089981]/10 hover:bg-[#089981]/20 border border-[#089981]/30 text-[#089981] transition-colors active:scale-95"
                  onclick={(e) => e.stopPropagation()}
                  title="Artist Profile"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </a>
              </div>

              <!-- Expand Button -->
              <button
                class="w-10 h-10 flex items-center justify-center rounded-full bg-lime-500/20 hover:bg-lime-500/30 text-lime-400 transition-colors active:scale-95"
                onclick={() => (isMinimized = false)}
                title="Expand Player"
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
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
        {/if}

        <!-- MERGED ALBUM ART + VISUALIZER (hidden on mobile when minimized) -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          class="relative shrink-0 shadow-2xl mx-auto transition-all duration-200 rounded-2xl overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center w-full cursor-pointer active:scale-[0.98] {isFullscreen
            ? 'max-h-[85vh] max-w-[85vh]'
            : 'max-w-full lg:max-h-[400px] aspect-square min-h-[320px]'} {isMinimized
            ? 'hidden md:flex'
            : ''}"
          style="transform: translateZ(0); -webkit-transform: translateZ(0); -webkit-backdrop-filter: blur(10px);"
          ontouchstart={handleTouchStart}
          ontouchend={handleTouchEnd}
          onclick={handleArtClick}
          role="button"
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
            class="absolute bottom-20 left-0 right-0 h-24 z-30 pointer-events-none opacity-90"
          >
            <canvas
              bind:this={canvasRef}
              width="1024"
              height="128"
              class="w-full h-full"
            ></canvas>
          </div>

          <!-- CONTEXT AWARE BACK BUTTON (BOTTOM LEFT) - Hidden on Song ID pages -->
          {#if backContext && !isFullscreen && !window.location.pathname.match(/^\/[a-f0-9]{64}$/i)}
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
                  <!-- Radio Icon (Broadcast Tower) -->
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C6.48 1 2 5.48 2 11h2c0-4.42 3.58-8 8-8s8 3.58 8 8h2c0-5.52-4.48-10-10-10z"
                    />
                    <path d="M13 13h-2v10h2V13z" />
                  </svg>
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
                ? 'text-xl md:text-2xl'
                : 'text-lg md:text-xl'} font-pixel font-black tracking-tighter leading-tight uppercase text-white drop-shadow-lg"
              style="image-rendering: pixelated; text-shadow: 2px 2px 0px rgba(0,0,0,0.8);"
            >
              {songTitle}
            </div>
            {#if songTags}
              <div
                class="{isFullscreen
                  ? 'text-xs mt-3'
                  : 'text-[9px] mt-2'} text-[#9ae600] font-pixel font-black tracking-[0.2em] truncate uppercase"
              >
                {songTags}
              </div>
            {/if}
          </div>

          <!-- Sidebar Controls (Top Right of Art) -->
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

            <!-- Mobile Minimize Button (toggles album art collapse) -->
            <button
              class="md:hidden tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-lg border border-white/10 hover:border-white/30 {isMinimized
                ? 'text-lime-400 border-lime-500/50'
                : ''}"
              onclick={(e) => {
                e.stopPropagation();
                isMinimized = !isMinimized;
              }}
              title={isMinimized ? "Show Album Art" : "Show Playlist"}
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {#if isMinimized}
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                {:else}
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M20 12H4"
                  />
                {/if}
              </svg>
            </button>

            <button
              class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-lg border border-white/10 hover:border-white/30"
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

            {#if variant === "arcade"}
              <!-- ARCADE LAYOUT: Station Gen -> Song Page -> Artist Page -->

              <!-- 1. Station Gen (Amber) -->
              {#if onRegenerate}
                <button
                  class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-full border border-amber-500/50 text-amber-500 hover:bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                  onclick={(e) => {
                    e.stopPropagation();
                    onRegenerate();
                  }}
                  title="Generate Station From Song"
                >
                  <!-- Radio Icon (Broadcast Tower) -->
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C6.48 1 2 5.48 2 11h2c0-4.42 3.58-8 8-8s8 3.58 8 8h2c0-5.52-4.48-10-10-10z"
                    />
                    <path d="M13 13h-2v10h2V13z" />
                  </svg>
                </button>
              {/if}

              <!-- 2. Song Details (Pink Double Note) -->
              {#if currentSong}
                <button
                  class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-full border border-[#ff3399]/50 text-[#ff3399] hover:bg-[#ff3399]/20 shadow-[0_0_15px_rgba(255,51,153,0.3)]"
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
              {/if}

              <!-- 3. Artist Page (User Icon) -->
              {#if currentSong}
                <button
                  class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-full border border-[#9ae600]/50 text-[#9ae600] hover:bg-[#9ae600]/20 shadow-[0_0_15px_rgba(154,230,0,0.3)]"
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

              <!-- Shuffle for Arcade (Optional, keep if requested or omit. Keeping for now but bottom priority in stack) -->
              {#if onShuffle}
                <button
                  class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/20 backdrop-blur-md rounded-full border border-lime-500/50 text-lime-400 hover:bg-lime-500/20 shadow-[0_0_15px_rgba(154,230,0,0.2)] opacity-60 hover:opacity-100"
                  onclick={(e) => {
                    e.stopPropagation();
                    onShuffle();
                  }}
                  title="Shuffle Station"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                    />
                  </svg>
                </button>
              {/if}
            {:else}
              <!-- DEFAULT LAYOUT (Artist Page): Radio -> Song -> Artist -->

              <!-- 1. Radio Gen (Amber/Orange) -->
              <button
                class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-full border border-[#f97316]/50 text-[#f97316] hover:bg-[#f97316]/20 shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                onclick={(e) => {
                  e.stopPropagation();
                  const target = currentSong ? buildRadioUrl(currentSong) : "/radio";
                  navigate(target);
                }}
                title="Start Radio from Song"
              >
                <!-- Radio Icon (Broadcast Tower) -->
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C6.48 1 2 5.48 2 11h2c0-4.42 3.58-8 8-8s8 3.58 8 8h2c0-5.52-4.48-10-10-10z"
                  />
                  <path d="M13 13h-2v10h2V13z" />
                </svg>
              </button>

              <!-- 2. Song Details (Pink) -->
              {#if currentSong}
                <button
                  class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-full border border-[#d836ff]/50 text-[#d836ff] hover:bg-[#d836ff]/20 shadow-[0_0_15px_rgba(216,54,255,0.3)]"
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
              {/if}

              <!-- 3. Artist Page (Lime) -->
              {#if currentSong}
                <button
                  class="tech-button w-9 h-9 flex items-center justify-center transition-all bg-black/40 backdrop-blur-md rounded-full border border-[#9ae600]/50 text-[#9ae600] hover:bg-[#9ae600]/20 shadow-[0_0_15px_rgba(154,230,0,0.3)]"
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

              <!-- Mobile Controls (Mirror Desktop) -->
              {#if overlayControlsOnMobile && currentSong && !isFullscreen}
                <!-- The controls above are visible on mobile due to flex layout in parent. We don't need duplicates here unless sidebar is hidden on mobile? -->
                <!-- Parent container line 564 is 'absolute top-4 right-4 z-40 flex flex-col gap-2'. It works on mobile. -->
                <!-- Previously I had a block 'Mobile Controls' but lines 733+ were duplicates of Regenerate/Song/Artist for mobile only. -->
                <!-- Since I made the top buttons generic, they will show on mobile too. -->
                <!-- I will remove the duplicate mobile block to clean up. -->
              {/if}
            {/if}
          </div>

          <!-- Bottom action buttons handled by isOverlay section below -->

          <!-- VERSION SELECTOR (BOTTOM CENTER OF ART - ABOVE PLAY BUTTON) -->
          {#if versions && versions.length > 1 && onVersionSelect}
            <div
              class="absolute bottom-28 lg:bottom-32 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2"
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
          class="flex items-center justify-center gap-2 sm:gap-4 md:gap-6 transition-all duration-500 {isOverlay
            ? isMinimized
              ? 'absolute bottom-16 left-0 right-0 z-40'
              : 'absolute bottom-14 left-0 right-0 z-40'
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
            class="tech-button {isMinimized
              ? 'w-7 h-7'
              : 'w-8 h-8 sm:w-10 sm:h-10'} flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20 rounded-full bg-white/5 backdrop-blur-md touch-manipulation"
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
            <svg
              class={isMinimized ? "w-4 h-4" : "w-5 h-5"}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            class="tech-button {isMinimized
              ? 'w-11 h-11'
              : 'w-12 h-12 sm:w-16 sm:h-16'} flex items-center justify-center active:scale-95 transition-all relative overflow-hidden group rounded-full backdrop-blur-xl touch-manipulation {playButtonVariant ===
            'silver'
              ? 'bg-gradient-to-br from-white via-neutral-300 to-neutral-500 border-[2px] border-white text-neutral-800 shadow-[inset_0_2px_4px_rgba(255,255,255,0.9),inset_0_-4px_6px_rgba(0,0,0,0.2),0_4px_15px_rgba(0,0,0,0.5),0_0_25px_rgba(255,255,255,0.5)] hover:brightness-110'
              : 'border border-[#089981] text-[#089981] bg-[#089981]/10 shadow-[0_0_30px_rgba(8,153,129,0.4)] hover:bg-[#089981]/20 hover:text-white hover:shadow-[0_0_40px_rgba(8,153,129,0.6)]'}"
            onclick={(e) => {
              if (!playing)
                window.dispatchEvent(new CustomEvent("smol:action-play"));
              playPause();
            }}
            title={playing ? "Pause" : "Play"}
          >
            {#if playing}
              <svg
                class={isMinimized ? "w-5 h-5" : "w-6 h-6"}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            {:else}
              <svg
                class="{isMinimized ? 'w-5 h-5' : 'w-6 h-6'} ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            {/if}
          </button>

          <!-- NEXT BUTTON -->
          <button
            class="tech-button {isMinimized
              ? 'w-7 h-7'
              : 'w-8 h-8 sm:w-10 sm:h-10'} flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20 rounded-full bg-white/5 backdrop-blur-md touch-manipulation"
            onclick={handleNext}
            title="Next"
          >
            <svg
              class={isMinimized ? "w-4 h-4" : "w-5 h-5"}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          <!-- REPLAY BUTTON (Toggle: Off -> Once -> One) -->
          <button
            class="tech-button {isMinimized
              ? 'w-7 h-7'
              : 'w-8 h-8 sm:w-10 sm:h-10'} flex items-center justify-center active:scale-95 disabled:opacity-30 border rounded-full backdrop-blur-md touch-manipulation transition-all {audioState.repeatMode !==
            'off'
              ? 'text-lime-400 border-lime-500/50 bg-lime-500/10 hover:bg-lime-500/20 shadow-[0_0_15px_rgba(154,230,0,0.3)]'
              : 'text-white/60 hover:text-white border-white/5 hover:border-white/20 bg-white/5'}"
            onclick={(e) => {
              toggleRepeatMode();
            }}
            title={audioState.repeatMode === "one"
              ? "Loop One (Click to Disable)"
              : audioState.repeatMode === "once"
                ? "Repeat Once (Click to Loop)"
                : "Repeat Off (Click to Repeat Once)"}
          >
            <!-- Show Loop Icon for 'off' and 'once', show '1' for 'one' -->
            <div class="relative">
              <svg
                class={isMinimized ? "w-3.5 h-3.5" : "w-4 h-4"}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
                />
              </svg>
              {#if audioState.repeatMode === "one"}
                <div
                  class="absolute -top-1 -right-1.5 flex items-center justify-center bg-black rounded-full"
                >
                  <span
                    class="text-[8px] font-bold leading-none text-lime-400 font-pixel"
                    >1</span
                  >
                </div>
              {/if}
            </div>
          </button>

          <!-- KALE TIP BUTTON (Right of Replay) -->
          {#if onTip}
            <button
              class="tech-button {isMinimized
                ? 'w-7 h-7'
                : 'w-8 h-8 sm:w-10 sm:h-10'} flex items-center justify-center active:scale-95 disabled:opacity-30 border rounded-full backdrop-blur-md transition-all duration-300 border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/20 shadow-[0_0_15px_rgba(74,222,128,0.1)] touch-manipulation"
              onclick={(e) => {
                window.dispatchEvent(new CustomEvent("smol:action-tip"));
                onTip && onTip();
              }}
              title="Tip Artist"
            >
              <img
                src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                alt="Kale"
                class="{isMinimized
                  ? 'w-3.5 h-3.5'
                  : 'w-4 h-4 sm:w-5 sm:h-5'} object-contain brightness-110 drop-shadow-[0_0_2px_rgba(74,222,128,0.5)]"
              />
            </button>
          {/if}

          <!-- SHUFFLE BUTTON (mobile only when overlayControlsOnMobile) -->
          {#if onShuffle && overlayControlsOnMobile}
            <button
              class="tech-button w-8 h-8 sm:w-10 sm:h-10 flex lg:hidden items-center justify-center text-lime-400 hover:text-lime-300 active:scale-95 border border-lime-500/30 hover:border-lime-400/50 rounded-full bg-lime-500/10 backdrop-blur-md touch-manipulation"
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
            {#if replaceDetailWithRegenerate && onRegenerate}
              <button
                class="tech-button w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border border-[#F7931A] text-[#F7931A] bg-[#F7931A]/10 shadow-[0_0_20px_rgba(247,147,26,0.3)] hover:bg-[#F7931A]/20 hover:text-white {overlayControlsOnMobile
                  ? 'hidden lg:flex'
                  : ''}"
                onclick={handleRegenerate}
                title="Regenerate"
              >
                <span class="text-xl">↻</span>
              </button>
            {:else if showSongDetailButton}
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

          {#if onRegenerate && !replaceDetailWithRegenerate}
            <button
              class="tech-button w-10 h-10 flex items-center justify-center active:scale-95 transition-all rounded-full backdrop-blur-md border border-[#F7931A] text-[#F7931A] bg-[#F7931A]/10 shadow-[0_0_20px_rgba(247,147,26,0.3)] hover:bg-[#F7931A]/20 hover:text-white"
              onclick={handleRegenerate}
              title="Regenerate Station"
            >
              <span class="text-xl">↻</span>
            </button>
          {/if}
        </div>

        <!-- Compact Mint/Share buttons (below controls when isOverlay) -->
        {#if isOverlay}
          <div
            class="absolute {isMinimized
              ? 'bottom-4'
              : 'bottom-2'} left-0 right-0 z-40 flex justify-center gap-2 px-4"
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
                class="{isMinimized
                  ? 'flex-1 max-w-[120px] py-1.5 text-[10px]'
                  : 'flex-[1.5] max-w-[200px] py-2.5 text-xs'} bg-[#d836ff]/80 backdrop-blur-md text-white font-pixel rounded-lg uppercase tracking-wider hover:bg-[#d836ff] transition-all shadow-lg hover:shadow-[#d836ff]/40"
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
                class="{isMinimized
                  ? 'flex-1 max-w-[120px] py-1.5 text-[10px]'
                  : 'flex-[1.5] max-w-[200px] py-2.5 text-xs'} bg-[#2775ca]/80 backdrop-blur-md text-white font-pixel rounded-lg uppercase tracking-wider hover:bg-[#2775ca] transition-all shadow-lg hover:shadow-[#2775ca]/40"
              >
                Trade
              </button>
            {/if}
            {#if onShare}
              <button
                onclick={onShare}
                class="{isMinimized
                  ? 'px-4 py-1.5 text-[10px]'
                  : 'px-6 py-2.5 text-xs'} bg-white/10 backdrop-blur-md text-white font-pixel rounded-lg uppercase tracking-wider border border-white/10 hover:bg-white/20 transition-all shadow-lg"
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
                  class="text-sm font-pixel font-black {index === currentIndex
                    ? 'text-lime-400'
                    : 'text-white/80'} truncate lowercase tracking-tighter"
                >
                  {song.Title || "Untitled"}
                </div>
                <a
                  href="/artist/{song.Address}"
                  class="text-[9px] text-white/30 uppercase tracking-widest truncate mt-0.5 block transition-colors hover:underline font-pixel"
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
