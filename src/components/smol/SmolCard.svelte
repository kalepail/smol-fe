<script lang="ts">
  import type { Smol } from '../../types/domain';
  import LikeButton from '../ui/LikeButton.svelte';
  import MiniAudioPlayer from '../audio/MiniAudioPlayer.svelte';
  import CoverArt from '../ui/CoverArt.svelte';
  import Icon from '../ui/Icon.svelte';
  import { player } from '../../stores/audio.svelte';
  import { toMixtapeTrack, trackKey } from '../../utils/track';
  import { shortenAddress } from '../../utils/address';
  import { mixtapeModeState, mixtapeTrackIds } from '../../stores/mixtape.svelte';

  interface Props {
    smol: Smol;
    onPlay: () => void;
    onLikeChanged: (liked: boolean) => void;
    onAddToMixtape: () => void;
    onDragStart?: (event: DragEvent) => void;
    onDragEnd?: () => void;
    isDragging?: boolean;
  }

  let {
    smol,
    onPlay,
    onLikeChanged,
    onAddToMixtape,
    onDragStart,
    onDragEnd,
    isDragging = false,
  }: Props = $props();

  const key = $derived(smol.Song_1 ? trackKey(smol.Id, smol.Song_1) : null);
  const isNowPlaying = $derived(Boolean(key && player.track?.key === key));
  const isInMixtape = $derived(mixtapeTrackIds.current.has(smol.Id));
  const isPublicSmol = $derived(smol.Public !== 0);
  const canAddToMixtape = $derived(mixtapeModeState.active && isPublicSmol);
  const creatorLabel = $derived(
    smol.Creator || smol.Username || smol.artist || smol.author || (smol.Address ? shortenAddress(smol.Address) : '')
  );

  function handleDragStart(event: DragEvent) {
    if (!canAddToMixtape) {
      event.preventDefault();
      return;
    }

    const payload = {
      type: 'smol' as const,
      track: toMixtapeTrack(smol),
    };

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', payload.track.title);
    }

    onDragStart?.(event);
  }
</script>

<article
  class={`group flex flex-col gap-2 min-w-0 ${
    isDragging ? 'opacity-80 scale-[1.02]' : ''
  }`}
>
  <div
    class={`relative rounded-[var(--radius-media)] ${
      isNowPlaying ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''
    }`}
  >
    <a
      href={`/${smol.Id}`}
      draggable={canAddToMixtape}
      ondragstart={handleDragStart}
      ondragend={onDragEnd}
      class="focus-ring block rounded-[var(--radius-media)]"
      aria-label={`Open ${smol.Title || 'song'}`}
    >
      <CoverArt id={smol.Id} alt="" scale={4} />
    </a>

    {#if mixtapeModeState.active}
      <div class="absolute top-1.5 left-1.5 z-10">
        {#if isInMixtape}
          <span
            class="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-semibold text-on-accent"
          >
            <Icon name="check" size={14} />
            <span>Added</span>
          </span>
        {:else if !isPublicSmol}
          <span
            title="Private songs cannot be added to mixtapes"
            class="inline-flex min-h-9 items-center rounded-full bg-canvas/85 px-2.5 text-xs text-ink-2 ring-1 ring-inset ring-line backdrop-blur-sm"
          >
            Private
          </span>
        {:else}
          <button
            type="button"
            class="focus-ring inline-flex min-h-11 items-center gap-1 rounded-full bg-canvas/85 px-3 text-xs font-medium text-ink-1 ring-1 ring-inset ring-line-strong backdrop-blur-sm hover:bg-surface-2"
            onclick={(event) => {
              event.stopPropagation();
              onAddToMixtape();
            }}
          >
            <Icon name="plus" size={14} />
            <span>Add</span>
          </button>
        {/if}
      </div>
    {/if}

    {#if key}
      <div class="absolute right-1.5 bottom-1.5 z-10">
        <MiniAudioPlayer
          trackKey={key}
          onToggle={onPlay}
          label={smol.Title}
          variant="overlay"
        />
      </div>
    {/if}
  </div>

  <div class="flex items-start justify-between gap-1 min-w-0">
    <div class="min-w-0 flex-1 pt-0.5">
      <a
        href={`/${smol.Id}`}
        class="focus-ring block rounded text-[15px] font-medium leading-5 text-ink-1 line-clamp-2 hover:underline"
      >
        {smol.Title || 'Untitled Smol'}
      </a>
      {#if creatorLabel}
        <p class="mt-0.5 truncate text-[13px] text-ink-2">
          {creatorLabel}
        </p>
      {/if}
    </div>

    <!-- Always visible on touch devices; revealed on hover on pointer devices when unliked -->
    <div
      class={`-mr-2 -mt-1 shrink-0 ${
        smol.Liked
          ? 'opacity-100'
          : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100'
      }`}
    >
      <LikeButton
        smolId={smol.Id}
        liked={smol.Liked || false}
        iconSize={18}
        onLikeChanged={onLikeChanged}
      />
    </div>
  </div>
</article>
