<script lang="ts">
    let { variant = 1, className = "" } = $props<{
        variant?: 1 | 2 | 3;
        className?: string;
    }>();
</script>

<svg
    viewBox="0 0 32 16"
    class={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    shape-rendering="crispEdges"
>
    <!-- Pixel Art Cloud Variants (32x16 grid) -->

    {#if variant === 1}
        <!-- Classic Puff (Mario-ish) -->
        <path
            d="
            M4 10 h1 v-1 h1 v-1 h1 v-1 h5 v-1 h6 v1 h3 v1 h1 v2 h1 v4 
            h-1 v1 h-18 v-1 h-1 v-4 z
        "
            fill="white"
        />
    {:else if variant === 2}
        <!-- Wide Flat -->
        <path
            d="
            M6 11 h1 v-1 h1 v-1 h1 v-1 h12 v1 h1 v1 h1 v4
            h-1 v1 h-16 v-1 h-1 v-3 z
        "
            fill="white"
        />
    {:else}
        <!-- Small/Tall Cluster -->
        <path
            d="
            M10 9 h1 v-1 h1 v-1 h6 v1 h1 v1 h1 v4
            h-1 v1 h-10 v-1 h-1 v-3 z
        "
            fill="white"
        />
    {/if}
</svg>

<style>
    svg {
        /* Ensures pixels stay sharp even if scaled up */
        image-rendering: pixelated;
    }
</style>
