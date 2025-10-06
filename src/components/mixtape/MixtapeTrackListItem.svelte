<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { SHADOW_PLACEHOLDER_ITEM_ID } from "svelte-dnd-action";
    import type { MixtapeTrack } from "../../types/domain";

    interface Props {
        track: MixtapeTrack;
        index: number;
        total: number;
    }

    let { track, index, total }: Props = $props();

    const dispatch = createEventDispatcher<{
        move: { direction: "up" | "down" };
        remove: void;
    }>();

    function moveUp() {
        dispatch("move", { direction: "up" });
    }

    function moveDown() {
        dispatch("move", { direction: "down" });
    }

    function remove() {
        dispatch("remove");
    }

    const positionLabel = index + 1;
    const isPlaceholder = track.id === SHADOW_PLACEHOLDER_ITEM_ID;
</script>

<li
    class={`flex items-center gap-3 p-3 rounded bg-slate-800/80 ${
        isPlaceholder ? "opacity-60" : ""
    }`}
    data-mixtape-track-id={track.id}
>
    <div class="relative w-12 h-12 shrink-0 rounded overflow-hidden bg-slate-700">
        {#if isPlaceholder}
            <div class="absolute inset-0 animate-pulse bg-slate-600/60"></div>
        {:else if track.coverUrl}
            <img
                src={`${track.coverUrl}${track.coverUrl.includes("?") ? "" : "?scale=4"}`}
                alt={track.title}
                class="w-full h-full object-cover"
                loading="lazy"
            />
        {:else}
            <div class="flex items-center justify-center w-full h-full text-xs text-slate-400">
                {positionLabel}
            </div>
        {/if}
    </div>

    <div class="flex flex-col flex-1 min-w-0">
        <span class="font-semibold truncate">{track.title ?? "Loading..."}</span>
        {#if track.creator}
            <span class="text-xs text-slate-400 truncate">{track.creator}</span>
        {/if}
    </div>

    <div class="flex items-center gap-2">
        <button
            class="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={moveUp}
            disabled={index === 0 || isPlaceholder}
            aria-label="Move track up"
        >↑</button>

        <button
            class="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={moveDown}
            disabled={index === total - 1 || isPlaceholder}
            aria-label="Move track down"
        >↓</button>

        <button
            class="px-2 py-1 bg-red-600/70 rounded hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
            onclick={remove}
            disabled={isPlaceholder}
            aria-label="Remove track"
        >✕</button>
    </div>
</li>
