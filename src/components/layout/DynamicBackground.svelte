<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";

    // Sky Logic
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 6;

    let bgGradient = $derived.by(() => {
        if (hour >= 6 && hour < 9)
            return "bg-gradient-to-b from-indigo-900 via-purple-700 to-orange-300"; // Dawn
        if (hour >= 9 && hour < 17)
            return "bg-gradient-to-b from-[#38bdf8] via-[#818cf8] to-[#c084fc]"; // Day (Sky/Indigo/Purple)
        if (hour >= 17 && hour < 20)
            return "bg-gradient-to-b from-indigo-900 via-purple-800 to-pink-500"; // Sunset
        return "bg-gradient-to-b from-[#020617] via-[#1e1b4b] to-[#312e81]"; // Night
    });

    // Star Generation
    const stars = Array.from({ length: 50 }).map(() => ({
        top: Math.random() * 60 + "%", // Top 60% of screen only
        left: Math.random() * 100 + "%",
        delay: Math.random() * 2 + "s",
        size: Math.random() > 0.8 ? "w-1 h-1" : "w-0.5 h-0.5",
    }));
</script>

<div
    class="fixed inset-0 z-[-1] overflow-hidden pointer-events-none select-none"
>
    <!-- Dynamic Sky Gradient (Underlay) -->
    <div
        class="absolute inset-0 {bgGradient} transition-colors duration-[5000ms]"
    ></div>

    <!-- Stars (Night Only) -->
    {#if isNight}
        <div class="absolute inset-0" transition:fade={{ duration: 2000 }}>
            {#each stars as star}
                <div
                    class="absolute bg-white rounded-full opacity-80 animate-pulse {star.size}"
                    style="top: {star.top}; left: {star.left}; animation-delay: {star.delay};"
                ></div>
            {/each}
        </div>
    {/if}

    <!-- Kale Field (White Sky -> Transparent) -->
    <img
        src="/kale_landscape.png"
        alt=""
        class="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-60"
        style="image-rendering: pixelated;"
    />

    <!-- Global Vignette for UI Readability -->
    <div
        class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20"
    ></div>
</div>
