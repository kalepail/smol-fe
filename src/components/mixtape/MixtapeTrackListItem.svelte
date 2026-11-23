<script lang="ts">
  import type { MixtapeTrack } from '../../types/domain';
  import type { TrackIssueKind } from '../../hooks/useMixtapePublishing';
  import CoverArt from '../ui/CoverArt.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Icon from '../ui/Icon.svelte';
  import Chip from '../ui/Chip.svelte';

  interface Props {
    track: MixtapeTrack;
    index: number;
    total: number;
    isDragging?: boolean;
    issue?: TrackIssueKind;
    onStartDrag: (event: PointerEvent) => void;
    onMove: (direction: 'up' | 'down') => void;
    onRemove: () => void;
  }

  let {
    track,
    index,
    total,
    isDragging = false,
    issue,
    onStartDrag,
    onMove,
    onRemove,
  }: Props = $props();

  const effectiveIssue = $derived<TrackIssueKind | undefined>(
    issue ?? (track.public === 0 ? 'private' : undefined)
  );

  function handleGripKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      onMove('up');
    } else if (event.key === 'ArrowDown' && index < total - 1) {
      event.preventDefault();
      onMove('down');
    }
  }
</script>

<li
  class={`flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-control)] bg-surface-2 p-2.5 ring-1 ring-inset transition-colors sm:flex-row sm:items-center sm:gap-2.5 ${
    isDragging
      ? 'bg-surface-3 ring-2 ring-accent'
      : effectiveIssue
        ? 'ring-danger/50'
        : 'ring-line'
  }`}
  data-mixtape-track-id={track.id}
>
  <div class="flex min-w-0 flex-1 items-center gap-2.5">
    <!-- Explicit drag handle: ONLY this button initiates pointer drag so vertical touch swipes on rows scroll naturally (B-03) -->
    <button
      type="button"
      data-drag-handle
      style="touch-action: none;"
      aria-label={`Drag to reorder ${track.title || 'track'}`}
      onpointerdown={onStartDrag}
      onkeydown={handleGripKeydown}
      class="focus-ring inline-flex min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center rounded-[var(--radius-control)] text-ink-3 hover:bg-white/10 hover:text-ink-1 active:cursor-grabbing"
    >
      <Icon name="grip" size={18} />
    </button>

    <CoverArt src={track.coverUrl} alt="" scale={4} class="size-11 shrink-0" />

    <div class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-sm font-medium text-ink-1">
        {track.title ?? 'Untitled track'}
      </span>
      {#if track.creator}
        <span class="truncate text-xs text-ink-2">{track.creator}</span>
      {/if}
      {#if effectiveIssue === 'private'}
        <div class="mt-1">
          <Chip tone="danger" class="py-0 text-[11px]">Private — remove to publish</Chip>
        </div>
      {:else if effectiveIssue === 'unverified'}
        <div class="mt-1">
          <Chip tone="danger" class="py-0 text-[11px]">Visibility unverified</Chip>
        </div>
      {/if}
    </div>
  </div>

  <!-- Accessible reorder + remove controls (>= 44px touch targets; never squeeze title on narrow mobile) -->
  <div class="flex shrink-0 items-center justify-between border-t border-line/70 pt-1.5 sm:justify-end sm:border-t-0 sm:pt-0">
    <span class="tabular pl-2 text-xs text-ink-3 sm:hidden">#{index + 1}</span>
    <div class="flex items-center">
      <IconButton
        label="Move track up"
        disabled={index === 0}
        onclick={() => onMove('up')}
      >
        <Icon name="arrow-up" size={16} />
      </IconButton>

      <IconButton
        label="Move track down"
        disabled={index === total - 1}
        onclick={() => onMove('down')}
      >
        <Icon name="arrow-down" size={16} />
      </IconButton>

      <IconButton
        label="Remove track"
        variant="danger"
        onclick={onRemove}
      >
        <Icon name="x" size={16} />
      </IconButton>
    </div>
  </div>
</li>
