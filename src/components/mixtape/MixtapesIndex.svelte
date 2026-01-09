<script lang="ts">
    import { onMount } from "svelte";
    import Loader from "../ui/Loader.svelte";
    import MixtapeCardsGrid from "./MixtapeCardsGrid.svelte";
    import {
        listMixtapes,
        type MixtapeSummary,
    } from "../../services/api/mixtapes";

    let mixtapes = $state<MixtapeSummary[]>([]);
    let loading = $state(true);

    onMount(async () => {
        loading = true;
        try {
            mixtapes = await listMixtapes();
        } finally {
            loading = false;
        }
    });
</script>

<div class="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-40">
    <header class="mb-8 flex flex-col gap-2">
        <h1
            class="text-4xl md:text-5xl font-pixel font-bold uppercase tracking-widest animate-rainbow-flow drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            style="filter: saturate(1.8) brightness(1.3);"
        >
            Mixtapes
        </h1>
        <p class="text-xs font-pixel uppercase tracking-wide text-slate-400">
            Browse featured and published mixtapes. Publish your own to see it
            appear here.
        </p>
    </header>

    {#if loading}
        <div class="flex justify-center py-10">
            <Loader classNames="w-10 h-10" />
        </div>
    {:else}
        <MixtapeCardsGrid {mixtapes} />
    {/if}
</div>

<style>
    @keyframes rainbow-flow {
        0% {
            background-position: 200% 50%;
        }
        100% {
            background-position: 0% 50%;
        }
    }
    .animate-rainbow-flow {
        background: linear-gradient(
            to right,
            #ff0000,
            #ff8000,
            #ffff00,
            #00ff00,
            #00ffff,
            #0000ff,
            #8000ff,
            #ff00ff,
            #ff0000
        );
        background-size: 200% auto;
        animation: rainbow-flow 4s linear infinite;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
</style>
