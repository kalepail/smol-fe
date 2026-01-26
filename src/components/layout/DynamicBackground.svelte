<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import {
        initWeather,
        getWeatherCondition,
        weatherState,
    } from "../../hooks/useWeather.svelte.ts";
    import {
        backgroundState,
        getEffectiveAnimationsEnabled,
    } from "../../stores/background.svelte.ts";
    import { preferences } from "../../stores/preferences.svelte.ts";

    // Derive effective animations from function
    const effectiveAnimationsEnabled = $derived(
        getEffectiveAnimationsEnabled(),
    );

    // Sparkles Generation (Magic/Music Vibe)
    // Reduced count in fast mode for performance
    const sparkleCount = $derived(preferences.renderMode === "fast" ? 8 : 20);
    const sparkles = $derived(
        Array.from({ length: sparkleCount }).map(() => ({
            top: Math.random() * 100 + "%",
            left: Math.random() * 100 + "%",
            delay: Math.random() * 5 + "s",
            duration: 2 + Math.random() * 3 + "s",
        })),
    );

    // Musical Notes Generation
    // Reduced count in fast mode for performance
    const noteCount = $derived(preferences.renderMode === "fast" ? 6 : 12);
    const noteChars = ["♩", "♪", "♫", "♬", "♭", "♯"];
    const musicNotes = $derived(
        Array.from({ length: noteCount }).map(() => ({
            char: noteChars[Math.floor(Math.random() * noteChars.length)],
            top: 60 + Math.random() * 40 + "%", // Start lower (near fields)
            left: Math.random() * 100 + "%",
            delay: Math.random() * 8 + "s",
            duration: 4 + Math.random() * 4 + "s",
            size: 0.8 + Math.random() * 0.8 + "rem",
        })),
    );

    // Weather Simulation
    interface Props {
        disableWeather?: boolean;
        hidden?: boolean;
    }

    let { disableWeather = false, hidden = false }: Props = $props();

    // Sky Logic
    const hour = new Date().getHours();
    const isNight = hour >= 20 || hour < 6;

    const SIMULATE_WEATHER = false;
    const WEATHER_TYPES = ["clear", "cloudy", "rain", "storm", "snow"] as const;
    let simIndex = $state(0);

    onMount(() => {
        if (SIMULATE_WEATHER) {
            const interval = setInterval(() => {
                simIndex = (simIndex + 1) % WEATHER_TYPES.length;
            }, 5000);
            return () => clearInterval(interval);
        } else if (!disableWeather) {
            initWeather();
        }
    });

    // Derived Conditions
    const condition = $derived(
        SIMULATE_WEATHER ? WEATHER_TYPES[simIndex] : getWeatherCondition(),
    );
    const isRaining = $derived(condition === "rain" || condition === "storm");
    const isSnowing = $derived(condition === "snow");
    const isCloudy = $derived(condition === "cloudy" || isRaining || isSnowing);
    const isStormy = $derived(condition === "storm");

    let bgGradient = $derived.by(() => {
        // Snow Gradients
        if (isSnowing) {
            if (isNight)
                return "bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900";
            return "bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300"; // White/Grey Day
        }

        // Overlay greys if severe weather
        if (isRaining || isStormy) {
            if (isNight)
                return "bg-gradient-to-b from-slate-900 via-slate-800 to-slate-700";
            // Lighter grey for Day Rain
            return "bg-gradient-to-b from-slate-400 via-slate-500 to-slate-600";
        }
        if (condition === "cloudy" && !isNight)
            return "bg-gradient-to-b from-slate-300 via-slate-400 to-slate-500"; // Lighter cloudy day

        if (hour >= 6 && hour < 9)
            return "bg-gradient-to-b from-indigo-900 via-purple-700 to-orange-300"; // Dawn
        if (hour >= 9 && hour < 17)
            return "bg-gradient-to-b from-[#38bdf8] via-[#818cf8] to-[#c084fc]"; // Day (Sky/Indigo/Purple)
        if (hour >= 17 && hour < 20)
            return "bg-gradient-to-b from-indigo-900 via-purple-800 to-pink-500"; // Sunset
        return "bg-gradient-to-b from-[#020617] via-[#1e1b4b] to-[#312e81]"; // Night
    });

    // Star Generation
    // Reduced count in fast mode for performance
    const starCount = $derived(preferences.renderMode === "fast" ? 20 : 50);
    const stars = $derived(
        Array.from({ length: starCount }).map(() => ({
            top: Math.random() * 60 + "%", // Top 60% of screen only
            left: Math.random() * 100 + "%",
            delay: Math.random() * 2 + "s",
            size: Math.random() > 0.8 ? "w-1 h-1" : "w-0.5 h-0.5",
        })),
    );

    // Rain/Snow Generation
    // Reduced count in fast mode for performance
    const dropCount = $derived(preferences.renderMode === "fast" ? 15 : 40);
    const drops = $derived(
        Array.from({ length: dropCount }).map(() => ({
            left: Math.random() * 100 + "%",
            delay: Math.random() * 2 + "s",
            duration: 0.5 + Math.random() * 0.5 + "s",
        })),
    );
</script>

{#if !hidden}
    <div
        class="fixed inset-0 z-[-1] overflow-hidden pointer-events-none select-none"
    >
        <!-- Dynamic Sky Gradient (Underlay) -->
        {#if effectiveAnimationsEnabled}
            <div
                class="absolute inset-0 {bgGradient} transition-colors duration-[2000ms]"
            ></div>
        {:else}
            <!-- Premium Matte Plastic (Performance Mode) -->
            <div class="absolute inset-0 bg-[#1e1e1e]">
                <!-- Subtle Noise Texture -->
                <div
                    class="absolute inset-0 opacity-[0.03] mix-blend-overlay"
                    style="background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMDAnIGhlaWdodD0nMTAwJz48ZmlsdGVyIGlkPSdub2lzZSc+PGZlVHVyYnVsZW5jZSB0eXBlPSdmcmFjdGFsTm9pc2UnIGJhc2VGcmVxdWVuY3k9JzAuOCcgbnVtT2N0YXZlcz0nMycgc3RpdGNoVGlsZXM9J3N0aXRjaCcvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbHRlcj0ndXJsKCUyM25vaXNlKScgb3BhY2l0eT0nMScvPjwvc3ZnPg==');"
                ></div>
                <!-- Vignette -->
                <div
                    class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"
                ></div>
            </div>
        {/if}

        <!-- Stars (Night Only, Clear Only) -->
        {#if effectiveAnimationsEnabled}
            {#if isNight && !isCloudy}
                <div
                    class="absolute inset-0"
                    transition:fade={{ duration: 2000 }}
                >
                    {#each stars as star}
                        <div
                            class="absolute bg-white rounded-full opacity-80 animate-pulse {star.size}"
                            style="top: {star.top}; left: {star.left}; animation-delay: {star.delay};"
                        ></div>
                    {/each}
                </div>
            {/if}

            <!-- Sun (Day Only, Clear Only) -->
            {#if !isNight && condition === "clear"}
                <div
                    class="absolute top-[10%] left-[80%] w-32 h-32 bg-yellow-100/20 blur-[60px] rounded-full"
                    transition:fade={{ duration: 2000 }}
                ></div>
            {/if}

            <!-- Clouds (Abstract CSS) -->
            {#if isCloudy}
                <div
                    class="absolute inset-0 opacity-40"
                    transition:fade={{ duration: 2000 }}
                >
                    <div
                        class="absolute top-[10%] left-[-20%] w-[40%] h-[100px] bg-white/20 blur-[40px] rounded-full animate-float-slow"
                    ></div>
                    <div
                        class="absolute top-[30%] right-[-20%] w-[50%] h-[120px] bg-white/10 blur-[50px] rounded-full animate-float-slower"
                    ></div>
                </div>
            {/if}

            <!-- Kale Field (White Sky -> Transparent) -->
            <img
                src="/kale_landscape.png"
                alt=""
                class="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-60"
                style="image-rendering: pixelated;"
            />

            <!-- Magic Sparkles (Foreground Overlay) -->
            <div class="absolute inset-0 z-10 pointer-events-none">
                {#each sparkles as sparkle}
                    <div
                        class="absolute w-[3px] h-[3px] bg-yellow-100 rounded-full animate-twinkle opacity-0"
                        style="top: {sparkle.top}; left: {sparkle.left}; animation-delay: {sparkle.delay}; animation-duration: {sparkle.duration}; box-shadow: 0 0 6px gold;"
                    ></div>
                {/each}
                {#each musicNotes as note}
                    <div
                        class="absolute text-[#FDDA24] animate-float-note opacity-0"
                        style="top: {note.top}; left: {note.left}; font-size: {note.size}; animation-delay: {note.delay}; animation-duration: {note.duration}; text-shadow: 0 0 10px rgba(253, 218, 36, 0.8);"
                    >
                        {note.char}
                    </div>
                {/each}
            </div>

            <!-- Rain -->
            {#if isRaining}
                <div class="absolute inset-0" transition:fade>
                    {#each drops as drop}
                        <div
                            class="absolute w-[1px] h-[20px] bg-blue-200/40 opacity-50 animate-rain"
                            style="left: {drop.left}; animation-delay: {drop.delay}; animation-duration: {drop.duration}; top: -20px;"
                        ></div>
                    {/each}
                </div>
            {/if}

            <!-- Snow -->
            {#if isSnowing}
                <div class="absolute inset-0" transition:fade>
                    {#each drops as drop}
                        <div
                            class="absolute w-[4px] h-[4px] bg-white opacity-80 rounded-full animate-snow"
                            style="left: {drop.left}; animation-delay: {drop.delay}; animation-duration: {parseFloat(
                                drop.duration,
                            ) *
                                3 +
                                's'}; top: -20px;"
                        ></div>
                    {/each}
                </div>
            {/if}

            <!-- Global Vignette for UI Readability -->
            <div
                class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20"
            ></div>

            <!-- Storm Flash -->
            {#if isStormy}
                <div
                    class="absolute inset-0 bg-white/10 mix-blend-overlay animate-lightning opacity-0 pointer-events-none"
                ></div>
            {/if}
        {/if}
    </div>
{/if}

<style>
    @keyframes float-note {
        0% {
            opacity: 0;
            transform: translateY(0) rotate(-10deg);
        }
        20% {
            opacity: 0.7;
            transform: translateY(-20px) rotate(10deg);
        }
        80% {
            opacity: 0.5;
            transform: translateY(-80px) rotate(-10deg);
        }
        100% {
            opacity: 0;
            transform: translateY(-100px) rotate(10deg);
        }
    }
    .animate-float-note {
        animation-name: float-note;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
    }

    @keyframes twinkle {
        0% {
            opacity: 0;
            transform: scale(0.5) translateY(0);
        }
        50% {
            opacity: 0.8;
            transform: scale(1.2) translateY(-15px);
        }
        100% {
            opacity: 0;
            transform: scale(0.5) translateY(-30px);
        }
    }
    .animate-twinkle {
        animation-name: twinkle;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
    }

    @keyframes rain {
        0% {
            transform: translateY(0);
        }
        100% {
            transform: translateY(110vh);
        }
    }
    .animate-rain {
        animation-name: rain;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
    }

    @keyframes float-slow {
        0% {
            transform: translateX(0);
        }
        50% {
            transform: translateX(20px);
        }
        100% {
            transform: translateX(0);
        }
    }
    .animate-float-slow {
        animation: float-slow 10s ease-in-out infinite;
    }
    .animate-float-slower {
        animation: float-slow 15s ease-in-out infinite reverse;
    }

    @keyframes lightning {
        0%,
        95% {
            opacity: 0;
        }
        96% {
            opacity: 0.3;
        }
        97% {
            opacity: 0;
        }
        98% {
            opacity: 0.3;
        }
        100% {
            opacity: 0;
        }
    }
    .animate-lightning {
        animation: lightning 8s infinite random;
    }

    @keyframes snow {
        0% {
            transform: translateY(0) translateX(0);
        }
        50% {
            transform: translateY(50vh) translateX(20px);
        }
        100% {
            transform: translateY(110vh) translateX(-10px);
        }
    }
    .animate-snow {
        animation-name: snow;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
    }
</style>
