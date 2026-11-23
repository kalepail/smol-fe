<script lang="ts">
  import { dndzone, type DndEvent, SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
  import type { MixtapeTrack } from '../../../types/domain';
  import MixtapeTrackListItem from '../MixtapeTrackListItem.svelte';

  interface Props {
    tracks: MixtapeTrack[];
    isExternalDragActive: boolean;
    onConsider: (event: CustomEvent<DndEvent<MixtapeTrack>>) => void;
    onFinalize: (event: CustomEvent<DndEvent<MixtapeTrack>>) => void;
    onMove: (index: number, direction: 'up' | 'down') => void;
    onRemove: (index: number) => void;
    bindElement?: (element: HTMLUListElement) => void;
  }

  let {
    tracks,
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
  class={`flex flex-col gap-3 rounded-[var(--radius-control)] bg-surface-1 p-3.5 ring-1 ring-inset ${
    isExternalDragActive ? 'ring-2 ring-accent' : 'ring-line'
  }`}
>
  <header class="flex items-center justify-between text-xs text-ink-2">
    <span class="tabular">{tracks.length} {tracks.length === 1 ? 'song' : 'songs'} selected</span>
    {#if isExternalDragActive}
      <span class="font-medium text-accent">Drop to add</span>
    {/if}
  </header>

  <ul
    class="flex min-h-[160px] flex-col gap-2"
    bind:this={tracksListEl}
    use:dndzone={{
      items: tracks,
      type: 'mixtape-tracks',
      flipDurationMs,
      dropTargetClasses: ['mixtape-drop-active'],
    }}
    onconsider={onConsider}
    onfinalize={onFinalize}
  >
    {#if tracks.length === 0 || (tracks.length === 1 && tracks[0].id === SHADOW_PLACEHOLDER_ITEM_ID)}
      <li class="pointer-events-none flex flex-1 items-center justify-center py-10 text-center text-sm text-ink-3">
        Close this sheet and tap + Add on any song in the feed or search.
      </li>
    {:else}
      {#each tracks as track, index (track.id)}
        <MixtapeTrackListItem
          {track}
          {index}
          total={tracks.length}
          onMove={(direction) => onMove(index, direction)}
          onRemove={() => onRemove(index)}
        />
      {/each}
    {/if}
  </ul>
</section>

<style>
  :global(.mixtape-drop-active) {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
