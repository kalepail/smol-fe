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

  import { initAudioContext } from "../../stores/audio.svelte";

  let canvasRef = $state<HTMLCanvasElement | null>(null);
  let animationId: number | null = null;

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

    // Gradient cache (will be created on first valid frame)
    let gradient: CanvasGradient | null = null;

    function draw() {
      // CRITICAL: Read playing state directly from store, not closure
      if (!isPlaying()) return;
      animationId = requestAnimationFrame(draw);

      const currentAnalyser = audioState.analyser;
      let isBroken = false;
      let isSilent = true;

      // 1. Try to get real data
      if (currentAnalyser) {
        currentAnalyser.getByteTimeDomainData(dataArray);

        let zeroCount = 0;
        let sumDeviation = 0;

        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          if (val === 0) zeroCount++;
          sumDeviation += Math.abs(val - 128);
        }

        // If >90% of frame is EXACTLY 0, it's a broken context (hardware issue)
        // Valid silence is 128. 0 is "dead".
        if (zeroCount > bufferLength * 0.9) {
          isBroken = true;
        }

        // Check for silence (allowing tiny noise floor)
        if (sumDeviation > bufferLength * 0.5) {
          // Average deviation > 0.5
          isSilent = false;
        }
      } else {
        // No analyser = Broken state (Force simulation)
        isBroken = true;
      }

      // 2. Track Broken State
      if (isBroken) {
        zeroFrames++;
      } else {
        zeroFrames = 0;
      }

      // Auto-heal if stuck in broken state for > 2 seconds (120 frames)
      if (zeroFrames > 120 && currentAnalyser) {
        // Only warn once per session to avoid spam
        if (zeroFrames === 121)
          console.warn("Visualizer stuck at 0. Auto-healing...");
        initAudioContext(true);
        zeroFrames = 0;
      }

      // 3. Draw Frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(168, 85, 247, 0.5)";

      // Create gradient on first valid frame (ensures canvas has dimensions)
      if (!gradient && canvas.width > 0) {
        gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, "#9ae600");
        gradient.addColorStop(0.5, "#a855f7");
        gradient.addColorStop(1, "#f97316");
      }
      ctx.strokeStyle = gradient || "#a855f7"; // Fallback to purple if gradient fails

      ctx.beginPath();

      // FIX: Only Simulate if BROKEN or NO ANALYSER.
      // Valid Silence (isSilent) should draw the flat line (or gentle hum).
      if (zeroFrames > 5 || !currentAnalyser) {
        // SIMULATION MODE (Graceful Fallback)
        phase += 0.02;
        const centerY = canvas.height / 2;
        ctx.moveTo(0, centerY);
        for (let x = 0; x <= canvas.width; x += 10) {
          // Gentle Sine Wave
          const y = centerY + Math.sin(x * 0.005 + phase) * 20;
          ctx.lineTo(x, y);
        }
      } else {
        // REAL MODE (Quadratic + Smoothness)

        // Apply Lerp for temporal smoothness
        for (let i = 0; i < bufferLength; i++) {
          // If pure 0 (broken data glitch), force to 128 to avoid spike
          const target = dataArray[i] === 0 ? 128 : dataArray[i];
          lastDataArray[i] += (target - lastDataArray[i]) * 0.2; // 0.2 = faster response than 0.15
        }

        const sliceWidth = canvas.width / bufferLength;
        const BOOST = 2.5;
        let x = 0;

        // Start point
        const v0 = (lastDataArray[0] - 128) / 128.0;
        const y0 = canvas.height / 2 + v0 * (canvas.height / 2) * BOOST;
        ctx.moveTo(0, y0);

        // Curve loop
        for (let i = 1; i < bufferLength - 2; i++) {
          const v = (lastDataArray[i] - 128) / 128.0;
          const y = canvas.height / 2 + v * (canvas.height / 2) * BOOST;

          const vNext = (lastDataArray[i + 1] - 128) / 128.0;
          // Lookahead for CP
          const yNext = canvas.height / 2 + vNext * (canvas.height / 2) * BOOST;

          const xc = (x + (x + sliceWidth)) / 2;
          const yc = (y + yNext) / 2;
          ctx.quadraticCurveTo(x, y, xc, yc);
          x += sliceWidth;
        }
        ctx.lineTo(canvas.width, canvas.height / 2);
      }

      ctx.stroke();

      // Cleanup shadow for next frame (performance)
      ctx.shadowBlur = 0;
    }

    // Kick off
    animationId = requestAnimationFrame(draw);
  }
</script>

<div class="w-full relative overflow-hidden">
  <div class="flex items-center gap-6">
    <!-- Album Art -->
    <span
      class="w-20 h-20 rounded-sm bg-black/40 flex-shrink-0 relative overflow-hidden border border-white/10 group"
    >
      {#if coverUrl}
        <img
          src={coverUrl}
          alt={songTitle}
          class="w-full h-full object-cover transition-all duration-500 grayscale group-hover:grayscale-0"
          onerror={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      {/if}
      <span
        class="absolute inset-0 flex items-center justify-center text-3xl text-white/10 group-hover:text-white/40 transition-colors font-mono"
        >📻</span
      >
    </span>

    <!-- Song Info -->
    <div class="flex-1 min-w-0 flex flex-col justify-center font-mono">
      <div class="text-white text-lg tracking-wide truncate">{songTitle}</div>
      {#if songTags}
        <div
          class="text-purple-500/70 text-[10px] uppercase tracking-widest truncate mt-1"
        >
          {songTags}
        </div>
      {/if}

      <!-- Matte Progress Bar -->
      <div class="mt-4 h-1 bg-white/5 rounded-none overflow-hidden w-full">
        <div
          class="h-full bg-purple-600 transition-all duration-200 relative"
          style="width: {progress}%;"
        ></div>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-4">
      <button
        class="tech-button w-12 h-12 flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20"
        onclick={handlePrev}
        title="Previous"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      <button
        class="tech-button w-16 h-16 flex items-center justify-center text-white border border-white/10 hover:border-purple-500 hover:bg-purple-500/10 active:scale-95 transition-all relative overflow-hidden group"
        onclick={playPause}
        title={playing ? "Pause" : "Play"}
      >
        {#if playing}
          <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        {:else}
          <svg class="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        {/if}
      </button>

      <button
        class="tech-button w-12 h-12 flex items-center justify-center text-white/60 hover:text-white active:scale-95 disabled:opacity-30 border border-white/5 hover:border-white/20"
        onclick={handleNext}
        title="Next"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Big Visualizer -->
  <div class="mt-8 pt-4 border-t border-white/5">
    <canvas
      bind:this={canvasRef}
      width="1024"
      height="128"
      class="w-full h-32 rounded-lg bg-black/20"
    ></canvas>
  </div>
</div>
