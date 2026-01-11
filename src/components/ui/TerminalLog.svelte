<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        logs: string[];
    }

    let { logs = [] } = $props();

    let container: HTMLDivElement;

    $effect(() => {
        // Auto-scroll to bottom when logs change
        if (container && logs.length) {
            container.scrollTop = container.scrollHeight;
        }
    });
</script>

<div
    bind:this={container}
    class="font-pixel text-[10px] sm:text-xs text-lime-500 bg-slate-950/80 p-4 rounded-lg h-32 overflow-y-auto border border-lime-500/30 shadow-[0_0_10px_rgba(132,204,22,0.1)] leading-relaxed"
>
    {#each logs as log}
        <div class="mb-2 opacity-80">> {log}</div>
    {/each}
    <div class="animate-pulse">_</div>
</div>
