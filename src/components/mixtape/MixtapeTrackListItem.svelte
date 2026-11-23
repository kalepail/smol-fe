<script lang="ts">
  import { SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
  import type { MixtapeTrack } from '../../types/domain';
  import CoverArt from '../ui/CoverArt.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Icon from '../ui/Icon.svelte';
  import Chip from '../ui/Chip.svelte';

  interface Props {
    track: MixtapeTrack;
    index: number;
    total: number;
    onMove: (direction: 'up' | 'down') => void;
    onRemove: () => void;
  }

  let { track, index, total, onMove, onRemove }: Props = $props();

  const isPlaceholder = $derived(track.id === SHADOW_PLACEHOLDER_ITEM_ID);
  const isPrivate = $derived(track.public === 0);
</script>

<li
  class={`flex items-center gap-2.5 rounded-[var(--radius-control)] bg-surface-2 p-2.5 ring-1 ring-inset ring-line ${
    isPlaceholder ? 'opacity-60' : ''
  }`}
  data-mixtape-track-id={track.id}
>
  <CoverArt src={track.coverUrl} alt="" scale={4} class="size-11 shrink-0" />

  <div class="flex min-w-0 flex-1 flex-col">
    <span class="truncate text-sm font-medium text-ink-1">
      {track.title ?? 'Untitled track'}
    </span>
    {#if track.creator}
      <span class="truncate text-xs text-ink-2">{track.creator}</span>
    {/if}
    {#if isPrivate}
      <div class="mt-1">
        <Chip tone="neutral" class="py-0 text-[10px]">Private</Chip>
      </div>
    {/if}
  </div>

  <div class="flex shrink-0 items-center">
    <IconButton
      label="Move track up"
      disabled={index === 0 || isPlaceholder}
      onclick={() => onMove('up')}
    >
      <Icon name="arrow-up" size={16} />
    </IconButton>

    <IconButton
      label="Move track down"
      disabled={index === total - 1 || isPlaceholder}
      onclick={() => onMove('down')}
    >
      <Icon name="arrow-down" size={16} />
    </IconButton>

    <IconButton
      label="Remove track"
      variant="danger"
      disabled={isPlaceholder}
      onclick={onRemove}
    >
      <Icon name="x" size={16} />
    </IconButton>
  </div>
</li>
