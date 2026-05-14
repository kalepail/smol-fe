<script lang="ts">
  import type { Smol, MixtapeTrack } from '../../types/domain';
  import LikeButton from '../ui/LikeButton.svelte';
  import MiniAudioPlayer from '../audio/MiniAudioPlayer.svelte';
  import { audioState, selectSong, togglePlayPause } from '../../stores/audio.svelte';
  import { mixtapeModeState, mixtapeTrackIds } from '../../stores/mixtape.svelte';
  import { shortenAddress } from '../../utils/address';

  interface Props {
    smol: Smol;
    isVisible: boolean;
    onLikeChanged: (liked: boolean) => void;
    onAddToMixtape: () => void;
    onDragStart?: (event: DragEvent) => void;
    onDragEnd?: () => void;
    isDragging?: boolean;
    showCreator?: boolean;
  }

  let {
    smol,
    isVisible,
    onLikeChanged,
    onAddToMixtape,
    onDragStart,
    onDragEnd,
    isDragging = false,
    showCreator = true
  }: Props = $props();

  function toggleSongSelection() {
    if (audioState.currentSong?.Id === smol.Id) {
      togglePlayPause();
    } else {
      selectSong(smol);
    }
  }

  const isInMixtape = $derived(mixtapeTrackIds.current.has(smol.Id));
  const creatorName = $derived(
    smol.Creator ?? smol.Username ?? smol.artist ?? smol.author ?? shortenAddress(smol.Address)
  );
  const artistHref = $derived(
    smol.Address ? `/artists/${encodeURIComponent(smol.Address)}` : null
  );
</script>

<div
  class={`flex flex-col rounded overflow-hidden bg-slate-700 transition-all ${
    isDragging ? 'ring-2 ring-lime-400 ring-offset-2 ring-offset-slate-950 scale-105' : ''
  }`}
>
  <div
    class="group relative"
    draggable={mixtapeModeState.active && isVisible}
    ondragstart={onDragStart}
    ondragend={onDragEnd}
  >
    <img
      class="aspect-square object-contain pixelated w-full shadow-md"
      src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
      alt={smol.Title}
      loading="lazy"
    />

    {#if mixtapeModeState.active && isVisible}
      {#if isInMixtape}
        <span
          class="absolute left-1.5 top-1.5 rounded-full bg-lime-400 px-2 py-1 text-xs font-semibold text-slate-950"
        >Added</span>
      {:else}
        <button
          class="absolute left-1.5 top-1.5 rounded-full bg-slate-950/70 px-2 py-1 text-xs text-lime-300 ring-1 ring-lime-400/60 backdrop-blur hover:bg-slate-950/90"
          onclick={(e) => {
            e.stopPropagation();
            onAddToMixtape();
          }}
        >+ Add</button>
      {/if}
    {/if}

    <div class="absolute z-2 right-0 bottom-0 rounded-tl-lg backdrop-blur-xs {!smol.Liked && 'opacity-0 group-hover:opacity-100'}">
      <LikeButton
        smolId={smol.Id}
        liked={smol.Liked || false}
        classNames="p-2 bg-slate-950/50 hover:bg-slate-950/70 rounded-tl-lg"
        iconSize="size-6"
        on:likeChanged={(e) => onLikeChanged(e.detail.liked)}
      />
    </div>

    <a
      class={`absolute inset-0 ${mixtapeModeState.active ? 'pointer-events-none' : ''}`}
      href={`/${smol.Id}`}
      aria-label={smol.Title}
    ></a>
  </div>

  <div
    class="flex min-h-16 items-center relative p-2 flex-1 overflow-hidden cursor-pointer"
    onclick={toggleSongSelection}
  >
    <div class="relative z-1 min-w-0 flex-1 pr-2">
      <h1 class="break-words text-sm leading-4 text-white">
        {smol.Title}
      </h1>
      {#if showCreator && artistHref}
        <a
          class="mt-1 block max-w-full truncate text-[11px] leading-3 text-lime-300 hover:underline"
          href={artistHref}
          aria-label={`View artist ${creatorName}`}
          onclick={(event) => event.stopPropagation()}
        >
          by {creatorName}
        </a>
      {/if}
    </div>
    <img
      class="absolute inset-0 z-0 opacity-80 scale-y-[-1] w-full h-full blur-lg pointer-events-none"
      src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
      alt={smol.Title}
      loading="lazy"
    />
    <div class="relative z-2 ml-auto">
      <MiniAudioPlayer
        id={smol.Id}
        playing_id={audioState.playingId}
        songToggle={toggleSongSelection}
        songNext={() => {}}
        progress={audioState.currentSong?.Id === smol.Id ? audioState.progress : 0}
      />
    </div>
  </div>
</div>
