<script lang="ts">
  import {
    dndzone,
    type DndEvent,
    SHADOW_PLACEHOLDER_ITEM_ID,
  } from "svelte-dnd-action";
  import type { MixtapeTrack } from "../../../types/domain";
  import MixtapeTrackListItem from "../MixtapeTrackListItem.svelte";

  interface Props {
    tracks: MixtapeTrack[];
    isDragging: boolean;
    isExternalDragActive: boolean;
    onConsider: (event: CustomEvent<DndEvent<MixtapeTrack>>) => void;
    onFinalize: (event: CustomEvent<DndEvent<MixtapeTrack>>) => void;
    onMove: (index: number, direction: "up" | "down") => void;
    onRemove: (index: number) => void;
    bindElement?: (element: HTMLUListElement) => void;
  }

  let {
    tracks,
    isDragging,
    isExternalDragActive,
    onConsider,
    onFinalize,
    onMove,
    onRemove,
    bindElement,
  }: Props = $props();

  const flipDurationMs = 150;
  let tracksListEl = $state<HTMLUListElement | null>(null);

  $effect(() => {
    if (tracksListEl && bindElement) {
      bindElement(tracksListEl);
    }
  });
</script>

<section
  class={`flex flex-col gap-3 rounded-xl min-h-0 outline-1 outline-slate-700 outline-offset-8 transition-all ${
    isExternalDragActive ? "outline-2 outline-lime-400! outline-offset-8" : ""
  }`}
>
  <header class="mt-1 flex items-center justify-between text-sm text-slate-300">
    <span class="ml-2"
      >{tracks.length} Smol{tracks.length === 1 ? "" : "s"} selected</span
    >
    {#if isExternalDragActive}
      <span class="text-xs text-lime-300 mr-2">Drop to add</span>
    {/if}
  </header>

  <div
    class="relative flex-1 min-h-0 h-full overflow-y-auto pr-1 dark-scrollbar"
  >
    <ul
      class="flex flex-col gap-2 min-h-full"
      bind:this={tracksListEl}
      use:dndzone={{
        items: tracks,
        type: "mixtape-tracks",
        flipDurationMs,
        dropTargetClasses: ["mixtape-drop-active"],
      }}
      onconsider={onConsider}
      onfinalize={onFinalize}
    >
      {#if tracks.length === 0 || (tracks.length === 1 && tracks[0].id === SHADOW_PLACEHOLDER_ITEM_ID)}
        <div
          class="pointer-events-none flex items-center justify-center min-h-full py-12"
        >
          <p class="text-sm text-slate-500">
            Browse Smols and drag them here or use the + Add button
          </p>
        </div>
      {:else}
        {#each tracks as track, index (track.id)}
          <MixtapeTrackListItem
            {track}
            {index}
            total={tracks.length}
            on:move={({ detail }) => onMove(index, detail.direction)}
            on:remove={() => onRemove(index)}
          />
        {/each}
      {/if}
    </ul>
  </div>
</section>

<style>
  :global(.mixtape-drop-active) {
    border-color: rgba(163, 230, 53, 0.45);
    background-color: rgba(101, 163, 13, 0.08);
    transition:
      border-color 120ms ease,
      background-color 120ms ease;
  }

  /* Dark scrollbar for mixtape track list */
  .dark-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .dark-scrollbar::-webkit-scrollbar-track {
    background: rgba(30, 41, 59, 0.5);
    border-radius: 4px;
  }
  .dark-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(100, 116, 139, 0.6);
    border-radius: 4px;
  }
  .dark-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.8);
  }
  /* Firefox */
  .dark-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(100, 116, 139, 0.6) rgba(30, 41, 59, 0.5);
  }
</style>
