<script lang="ts">
  import type { Smol, MixtapeTrack } from "../../types/domain";
  import LikeButton from "../ui/LikeButton.svelte";
  import MiniAudioPlayer from "../audio/MiniAudioPlayer.svelte";
  import { API_URL } from "../../utils/apiUrl";
  import {
    audioState,
    selectSong,
    togglePlayPause,
  } from "../../stores/audio.svelte.ts";
  import {
    mixtapeModeState,
    mixtapeTrackIds,
  } from "../../stores/mixtape.svelte.ts";

  interface Props {
    smol: Smol;
    isVisible: boolean;
    onLikeChanged: (liked: boolean) => void;
    onAddToMixtape: () => void;
    onDragStart?: (event: DragEvent) => void;
    onDragEnd?: () => void;
    isDragging?: boolean;
    onSmolClick?: (smol: Smol) => void;
  }

  let {
    smol,
    isVisible,
    onLikeChanged,
    onAddToMixtape,
    onDragStart,
    onDragEnd,
    isDragging = false,
    onSmolClick,
  }: Props = $props();

  function toggleSongSelection() {
    if (onSmolClick) {
      onSmolClick(smol);
      return;
    }

    if (audioState.currentSong?.Id === smol.Id) {
      togglePlayPause();
    } else {
      selectSong(smol);
    }
  }

  import { preferences } from "../../stores/preferences.svelte.ts";

  function handlePointerDown() {
    if (preferences.renderMode === "thinking") {
      if (navigator.vibrate) navigator.vibrate(50); // Synth pad "thud"
    }
  }

  const isInMixtape = $derived(mixtapeTrackIds.current.has(smol.Id));
</script>

<div
  class={`flex flex-col rounded overflow-hidden bg-slate-700 transition-all ${
    isDragging
      ? "ring-2 ring-lime-400 ring-offset-2 ring-offset-slate-950 scale-105"
      : ""
  }`}
  data-creator={smol.Creator || smol.Address || ""}
  data-address={smol.Address || ""}
  data-minted-by={smol.Mint_Token || ""}
  onpointerdown={handlePointerDown}
>
  <div
    class="group relative"
    draggable={mixtapeModeState.active && isVisible}
    ondragstart={onDragStart}
    ondragend={onDragEnd}
  >
    <img
      class="aspect-square object-contain pixelated w-full shadow-md bg-slate-800"
      src={`${API_URL}/image/${smol.Id}.png`}
      style="transform: translateZ(0); -webkit-transform: translateZ(0);"
      alt={smol.Title}
      loading="lazy"
    />

    {#if smol.Mint_Token}
      <a
        href={`https://stellar.expert/explorer/public/contract/${smol.Mint_Token}`}
        target="_blank"
        rel="noopener noreferrer"
        class="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-2 py-1 text-xs font-bold text-slate-950 shadow-lg border border-amber-300 z-10 hover:bg-amber-300 transition-colors"
        title="View on Stellar Expert"
        onclick={(e) => e.stopPropagation()}>M</a
      >
    {/if}

    {#if mixtapeModeState.active && isVisible}
      {#if isInMixtape}
        <span
          class="absolute left-1.5 top-1.5 rounded-full bg-lime-400 px-2 py-1 text-xs font-semibold text-slate-950"
          >Added</span
        >
      {:else}
        <button
          class="absolute left-1.5 top-1.5 rounded-full bg-slate-950/70 px-2 py-1 text-xs text-lime-300 ring-1 ring-lime-400/60 backdrop-blur hover:bg-slate-950/90"
          onclick={(e) => {
            e.stopPropagation();
            onAddToMixtape();
          }}>+ Add</button
        >
      {/if}
    {/if}

    <div
      class="absolute z-2 right-0 bottom-0 rounded-tl-lg backdrop-blur-xs {!smol.Liked &&
        'opacity-0 group-hover:opacity-100'}"
    >
      <LikeButton
        smolId={smol.Id}
        liked={smol.Liked || false}
        classNames="p-2 bg-slate-950/50 hover:bg-slate-950/70 rounded-tl-lg"
        iconSize="size-6"
        on:likeChanged={(e) => onLikeChanged(e.detail.liked)}
      />
    </div>

    <a
      class={`absolute inset-0 ${mixtapeModeState.active ? "pointer-events-none" : ""}`}
      href={`/${smol.Id}`}
      aria-label={smol.Title}
      onclick={(e) => {
        if (onSmolClick) {
          e.preventDefault();
          onSmolClick(smol);
        }
      }}
    ></a>
  </div>

  <div
    class="flex items-center relative p-2 flex-1 overflow-hidden cursor-pointer touch-manipulation active:bg-slate-600/50 transition-colors duration-75"
    onclick={toggleSongSelection}
  >
    <h1 class="relative z-1 leading-4 text-sm text-white line-clamp-2">
      {smol.Title}
    </h1>
    <img
      class="absolute inset-0 z-0 opacity-80 scale-y-[-1] w-full h-full blur-lg pointer-events-none"
      src={`${API_URL}/image/${smol.Id}.png?scale=32`}
      style="transform: translateZ(0); -webkit-transform: translateZ(0);"
      alt="{smol.Title} reflection"
      loading="lazy"
    />
    <div class="relative z-2 pl-2 ml-auto">
      <MiniAudioPlayer
        id={smol.Id}
        playing_id={audioState.playingId}
        songToggle={toggleSongSelection}
        songNext={() => {}}
        progress={audioState.currentSong?.Id === smol.Id
          ? audioState.progress
          : 0}
      />
    </div>
  </div>
</div>
