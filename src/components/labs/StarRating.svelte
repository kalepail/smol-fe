<script lang="ts">
    /**
     * Rock Band-style star rating display for Smol Hero.
     *
     * - Filled/empty SVG stars based on `stars` count (0-5)
     * - Golden shimmer effect when `golden` is true (FC / perfect run)
     * - Animated entrance with stagger per star
     */
    interface Props {
        stars: number; // 0-5
        golden?: boolean;
        size?: number; // px per star (default 32)
        animate?: boolean; // stagger entrance animation
        label?: string; // e.g. "S+", "A", "B"
    }

    let {
        stars = 0,
        golden = false,
        size = 32,
        animate = true,
        label = "",
    }: Props = $props();

    const totalStars = 5;
</script>

<div
    class="star-rating inline-flex items-center gap-1"
    class:golden
    role="img"
    aria-label="{stars} out of 5 stars{golden ? ' (golden)' : ''}"
>
    {#each Array(totalStars) as _, i}
        {@const filled = i < stars}
        {@const delay = animate ? i * 120 : 0}
        <div
            class="star-wrapper"
            style="animation-delay: {delay}ms; width: {size}px; height: {size}px;"
            class:filled
            class:golden-star={golden && filled}
            class:animate-entrance={animate}
        >
            <svg
                viewBox="0 0 24 24"
                width={size}
                height={size}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                {#if filled}
                    <!-- Filled star -->
                    <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        fill={golden ? "url(#goldGradient)" : "#FDDA24"}
                        stroke={golden ? "#FFD700" : "#D4A800"}
                        stroke-width="0.5"
                    />
                    {#if golden}
                        <!-- Extra glow layer for golden stars -->
                        <path
                            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                            fill="url(#goldShimmer)"
                            opacity="0.5"
                        />
                    {/if}
                {:else}
                    <!-- Empty star -->
                    <path
                        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        fill="#1a1a1a"
                        stroke="#333"
                        stroke-width="0.5"
                    />
                {/if}

                <defs>
                    <linearGradient
                        id="goldGradient"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="100%"
                    >
                        <stop offset="0%" stop-color="#FFE55C" />
                        <stop offset="35%" stop-color="#FFD700" />
                        <stop offset="65%" stop-color="#FFC107" />
                        <stop offset="100%" stop-color="#FF8F00" />
                    </linearGradient>
                    <linearGradient
                        id="goldShimmer"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%"
                    >
                        <stop offset="0%" stop-color="transparent" />
                        <stop offset="40%" stop-color="rgba(255,255,255,0.6)" />
                        <stop offset="60%" stop-color="rgba(255,255,255,0.6)" />
                        <stop offset="100%" stop-color="transparent" />
                    </linearGradient>
                </defs>
            </svg>
        </div>
    {/each}

    {#if label}
        <span
            class="star-label ml-2 font-bold text-sm tracking-widest"
            class:golden-label={golden}
            style="font-size: {size * 0.5}px;"
        >
            {label}
        </span>
    {/if}
</div>

<style>
    .star-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
    }

    .star-wrapper.animate-entrance {
        animation: starPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    .star-wrapper.filled {
        filter: drop-shadow(0 0 4px rgba(253, 218, 36, 0.4));
    }

    .star-wrapper.golden-star {
        filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.7))
            drop-shadow(0 0 16px rgba(255, 215, 0, 0.3));
        animation:
            starPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
            goldenPulse 2s ease-in-out infinite;
    }

    .star-label {
        color: #fdda24;
        text-shadow: 0 0 8px rgba(253, 218, 36, 0.4);
    }

    .star-label.golden-label {
        color: #ffd700;
        text-shadow:
            0 0 12px rgba(255, 215, 0, 0.6),
            0 0 24px rgba(255, 215, 0, 0.3);
        animation: goldenTextPulse 2s ease-in-out infinite;
    }

    @keyframes starPop {
        0% {
            transform: scale(0) rotate(-30deg);
            opacity: 0;
        }
        60% {
            transform: scale(1.2) rotate(5deg);
        }
        100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
        }
    }

    @keyframes goldenPulse {
        0%,
        100% {
            filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.7))
                drop-shadow(0 0 16px rgba(255, 215, 0, 0.3));
        }
        50% {
            filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.9))
                drop-shadow(0 0 24px rgba(255, 215, 0, 0.5));
        }
    }

    @keyframes goldenTextPulse {
        0%,
        100% {
            text-shadow:
                0 0 12px rgba(255, 215, 0, 0.6),
                0 0 24px rgba(255, 215, 0, 0.3);
        }
        50% {
            text-shadow:
                0 0 16px rgba(255, 215, 0, 0.8),
                0 0 32px rgba(255, 215, 0, 0.5);
        }
    }
</style>
