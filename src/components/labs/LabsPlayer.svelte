<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    interface Props {
        src: string;
        autoplay?: boolean;
        volume?: number;
        onEnded?: () => void;
        onError?: (e: Event) => void;
        onPlay?: () => void;
        onPause?: () => void;
    }

    let {
        src,
        autoplay = false,
        volume = 0.5,
        onEnded,
        onError,
        onPlay,
        onPause,
    }: Props = $props();

    let audio: HTMLAudioElement;
    let isPlaying = $state(false);
    let duration = $state(0);
    let currentTime = $state(0);
    let error = $state<string | null>(null);

    $effect(() => {
        if (audio) {
            audio.volume = volume;
        }
    });

    $effect(() => {
        if (audio && src) {
            // Reset state on new src
            error = null;
            if (autoplay) {
                audio.play().catch((e) => {
                    console.warn("LabsPlayer: Autoplay blocked", e);
                });
            }
        }
    });

    function togglePlay() {
        if (!audio) return;
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    }

    function handleTimeUpdate() {
        currentTime = audio.currentTime;
    }

    function handleLoadedMetadata() {
        duration = audio.duration;
    }

    function handlePlay() {
        isPlaying = true;
        onPlay?.();
    }

    function handlePause() {
        isPlaying = false;
        onPause?.();
    }

    function handleEnded() {
        isPlaying = false;
        onEnded?.();
    }

    function handleError(e: Event) {
        error = "Audio load failed";
        console.error("LabsPlayer Error:", e);
        onError?.(e);
    }

    // Cleanup on unmount handled automatically by Svelte/DOM,
    // but we ensure pause happens.
    onDestroy(() => {
        if (audio) {
            audio.pause();
            audio.src = "";
        }
    });
</script>

<div
    class="flex items-center gap-4 bg-[#111] border border-[#333] p-3 rounded-lg w-full max-w-md font-mono text-xs"
>
    <!-- Play/Pause Button -->
    <button
        onclick={togglePlay}
        class="w-8 h-8 flex items-center justify-center bg-[#222] hover:bg-[#9ae600] hover:text-black text-[#9ae600] rounded transition-colors"
        aria-label={isPlaying ? "Pause" : "Play"}
    >
        {#if isPlaying}
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
                ><path d="M14,19H18V5H14M6,19H10V5H6V19Z" /></svg
            >
        {:else}
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"
                ><path d="M8,5.14V19.14L19,12.14L8,5.14Z" /></svg
            >
        {/if}
    </button>

    <!-- Progress Bar -->
    <div class="flex-1 flex flex-col gap-1">
        <div
            class="flex justify-between text-[#555] uppercase tracking-wider text-[10px]"
        >
            <span>{error ? "ERROR" : isPlaying ? "PLAYING" : "PAUSED"}</span>
            <span>{Math.floor(currentTime)}s / {Math.floor(duration)}s</span>
        </div>

        <div class="h-1 bg-[#222] w-full rounded-full overflow-hidden relative">
            <div
                class="absolute top-0 left-0 h-full bg-[#9ae600] transition-all duration-100"
                style="width: {(currentTime / duration) * 100}%"
            ></div>
        </div>
    </div>

    <!-- Hidden Audio Element -->
    <audio
        bind:this={audio}
        {src}
        onplay={handlePlay}
        onpause={handlePause}
        onended={handleEnded}
        ontimeupdate={handleTimeUpdate}
        onloadedmetadata={handleLoadedMetadata}
        onerror={handleError}
        class="hidden"
    ></audio>
</div>
