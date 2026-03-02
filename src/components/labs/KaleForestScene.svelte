<script lang="ts">
    import { onMount } from "svelte";

    // Props for controlling the "vibe"
    let { active = true } = $props<{ active?: boolean }>();

    // Reduce Motion Check
    let prefersReducedMotion = $state(false);

    onMount(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        prefersReducedMotion = query.matches;

        const update = (e: MediaQueryListEvent) => {
            prefersReducedMotion = e.matches;
        };
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    });
</script>

<div
    class="scene-viewport"
    class:reduced-motion={prefersReducedMotion || !active}
>
    <!-- 1. Background Art (Moonlight Waterfall) -->
    <div class="layer bg-art"></div>

    <!-- 2. Moonlight Overlay (Cool Blue Night) -->
    <div class="layer moon-overlay"></div>

    <!-- 3. Waterfall Mist -->
    <div class="layer mist"></div>

    <!-- 4. Fireflies -->
    <div class="layer fireflies-1"></div>
    <div class="layer fireflies-2"></div>

    <!-- 5. Musical Notes (Floating Melody) -->
    {#each Array(6) as _, i}
        <div
            class="note note-{i % 3}"
            style="--delay: {i * 3}s; --x-pos: {20 + i * 15}%;"
        ></div>
    {/each}

    <!-- 6. Stardust -->
    <div class="layer stardust"></div>

    <!-- 7. Moonbeams -->
    <div class="layer light-shafts"></div>

    <!-- 8. Vignette -->
    <div class="layer vignette"></div>
</div>

<style>
    /* --- VIEWPORT --- */
    .scene-viewport {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #02050a;
        z-index: 1;
        pointer-events: none;
    }

    .layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        will-change: transform, opacity;
    }

    /* 1. ART */
    .bg-art {
        background-image: url("/kale-forest-bg-v2.jpg");
        background-size: cover;
        background-position: center bottom;
        z-index: 1;
        filter: contrast(1.1) brightness(0.9);
    }

    /* 2. MOON OVERLAY */
    .moon-overlay {
        background: linear-gradient(
            to bottom,
            rgba(10, 20, 40, 0.4),
            rgba(0, 0, 0, 0) 60%
        );
        z-index: 2;
        mix-blend-mode: multiply;
    }

    /* 3. MIST */
    .mist {
        background: radial-gradient(
            ellipse at 50% 60%,
            rgba(200, 240, 255, 0.15) 0%,
            transparent 60%
        );
        z-index: 3;
        filter: blur(20px);
        animation: mist-pulse 8s ease-in-out infinite alternate;
    }

    /* 4. FIREFLIES */
    .fireflies-1 {
        background-image: radial-gradient(
                2px 2px at 20px 30px,
                #ffeb3b,
                transparent
            ),
            radial-gradient(2px 2px at 40px 70px, #ff9800, transparent),
            radial-gradient(2px 2px at 60px 10px, #ffcc80, transparent);
        background-size: 200px 200px;
        z-index: 4;
        opacity: 0.7;
        animation: float-up 25s linear infinite;
    }
    .fireflies-2 {
        background-image: radial-gradient(
                2px 2px at 150px 150px,
                #fff59d,
                transparent
            ),
            radial-gradient(2px 2px at 100px 80px, #ffb74d, transparent);
        background-size: 300px 300px;
        z-index: 4;
        opacity: 0.4;
        animation: float-up 40s linear infinite reverse;
    }

    /* 5. MUSICAL NOTES */
    .note {
        position: absolute;
        bottom: -20px;
        left: var(--x-pos);
        color: rgba(253, 218, 36, 0.8);
        font-size: 24px;
        z-index: 5;
        opacity: 0;
        animation: float-note 15s linear infinite;
        animation-delay: var(--delay);
        text-shadow: 0 0 10px rgba(253, 218, 36, 0.5);
    }
    .note-0::before {
        content: "♪";
    }
    .note-1::before {
        content: "♫";
    }
    .note-2::before {
        content: "♩";
    }

    /* 6. STARDUST */
    .stardust {
        background-image: radial-gradient(
            1px 1px at 10px 10px,
            rgba(200, 230, 255, 0.5),
            transparent
        );
        background-size: 150px 150px;
        z-index: 5;
        opacity: 0.4;
        animation: drift-dust 30s linear infinite;
    }

    /* 7. LIGHT SHAFTS */
    .light-shafts {
        background: linear-gradient(
            60deg,
            transparent 40%,
            rgba(200, 230, 255, 0.08) 45%,
            transparent 50%,
            rgba(200, 230, 255, 0.04) 55%,
            transparent 60%
        );
        background-size: 200% 100%;
        z-index: 6;
        mix-blend-mode: screen;
        animation: shift-light 15s ease-in-out infinite alternate;
    }

    /* 8. VIGNETTE */
    .vignette {
        background: radial-gradient(
            circle at center,
            transparent 40%,
            rgba(2, 5, 10, 0.8) 100%
        );
        z-index: 7;
    }

    /* --- ANIMATIONS --- */
    @keyframes mist-pulse {
        0% {
            opacity: 0.5;
            transform: scale(1);
        }
        100% {
            opacity: 0.8;
            transform: scale(1.1);
        }
    }

    @keyframes float-up {
        0% {
            background-position: 0 0;
        }
        100% {
            background-position: 50px -200px;
        }
    }

    @keyframes float-note {
        0% {
            transform: translateY(0) rotate(-10deg);
            opacity: 0;
        }
        20% {
            opacity: 0.8;
        }
        80% {
            opacity: 0.5;
        }
        100% {
            transform: translateY(-80vh) rotate(10deg);
            opacity: 0;
        }
    }

    @keyframes drift-dust {
        0% {
            background-position: 0 0;
        }
        100% {
            background-position: 100px 50px;
        }
    }

    @keyframes shift-light {
        0% {
            background-position: 0% 0%;
            opacity: 0.3;
        }
        100% {
            background-position: 20% 0%;
            opacity: 0.6;
        }
    }

    .reduced-motion * {
        animation: none !important;
        transition: none !important;
    }
</style>
