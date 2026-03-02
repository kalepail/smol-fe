<script lang="ts">
    import { onMount } from "svelte";

    // CSS-based glitch effect placeholder
    let imageData = $state(null);
</script>

<div
    class="relative w-full aspect-square overflow-hidden bg-black rounded-xl border border-slate-700"
>
    <!-- Noise Layer -->
    <div class="absolute inset-0 opacity-20">
        <div
            class="w-full h-full bg-[url('https://media.giphy.com/media/oEI9uBYSzLpBK/giphy.gif')] bg-cover opacity-10 mix-blend-screen"
        ></div>
    </div>

    <!-- Glitch Bars -->
    <div
        class="absolute inset-0 flex flex-col justify-center items-center pointer-events-none z-10"
    >
        <div
            class="glitch-text font-pixel text-2xl sm:text-4xl text-white font-bold tracking-widest opacity-80 drop-shadow-[2px_2px_0_rgba(255,0,0,0.5)] text-center px-4"
        >
            {imageData ? "PROCESSING" : "DECODING"}
        </div>
        <div
            class="text-[10px] sm:text-xs text-lime-500 font-pixel mt-4 animate-pulse bg-black/80 px-2 py-1 rounded"
        >
            {imageData
                ? "RENDERING_FINAL_PIXELS..."
                : "AWAITING_DATA_STREAM..."}
        </div>
    </div>

    <!-- Scanning Line -->
    <div
        class="absolute top-0 left-0 w-full h-1 bg-lime-500/50 shadow-[0_0_15px_#84cc16] animate-scan"
    ></div>
</div>

<style>
    @keyframes scan {
        0% {
            top: -10%;
            opacity: 0;
        }
        10% {
            opacity: 1;
        }
        90% {
            opacity: 1;
        }
        100% {
            top: 110%;
            opacity: 0;
        }
    }

    .animate-scan {
        animation: scan 2s linear infinite;
    }
</style>
