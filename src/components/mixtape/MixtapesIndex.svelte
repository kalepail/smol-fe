<script lang="ts">
    import { onMount } from "svelte";
    import Loader from "../ui/Loader.svelte";
    import MixtapeCardsGrid from "./MixtapeCardsGrid.svelte";
    import { listMixtapes, type MixtapeSummary } from "../../services/api/mixtapes";

    let mixtapes: MixtapeSummary[] = [];
    let loading = true;

    onMount(async () => {
        loading = true;
        try {
            mixtapes = await listMixtapes();
        } finally {
            loading = false;
        }
    });
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
    <header class="mb-8 flex flex-col gap-2">
        <h1 class="text-3xl font-bold text-white">Mixtapes</h1>
        <p class="text-sm text-slate-400">
            Browse featured and published mixtapes. Publish your own to see it appear here.
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

