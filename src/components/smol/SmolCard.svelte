<script lang="ts">
  import type { Smol, MixtapeTrack } from "../../types/domain";
  import LikeButton from "../ui/LikeButton.svelte";
  import MiniAudioPlayer from "../audio/MiniAudioPlayer.svelte";
  import { API_URL } from "../../utils/apiUrl";
  import {
    audioState,
    selectSong,
    togglePlayPause,
  } from "../../stores/audio.svelte";
  import {
    mixtapeModeState,
    mixtapeTrackIds,
  } from "../../stores/mixtape.svelte";

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

    <a
      class={`absolute inset-0 z-0 ${mixtapeModeState.active ? "pointer-events-none" : ""}`}
      href={`/${smol.Id}`}
      aria-label={smol.Title}
      onclick={(e) => {
        if (onSmolClick) {
          e.preventDefault();
          onSmolClick(smol);
        }
      }}
    ></a>

    {#if smol.Mint_Token}
      <a
        href={`https://stellar.expert/explorer/public/contract/${smol.Mint_Token}`}
        target="_blank"
        rel="noopener noreferrer"
        class="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-2 py-1 text-xs font-bold text-slate-950 shadow-lg border border-amber-300 z-50 hover:bg-amber-300 transition-colors"
        title="View on Stellar Expert"
        onclick={(e) => e.stopPropagation()}>M</a
      >
    {/if}

    {#if mixtapeModeState.active && isVisible}
      {#if isInMixtape}
        <span
          class="absolute left-1.5 top-1.5 rounded-full bg-lime-400 px-2 py-1 text-xs font-semibold text-slate-950 z-50"
          >Added</span
        >
      {:else}
        <button
          class="absolute left-1.5 top-1.5 rounded-full bg-slate-950/70 px-2 py-1 text-xs text-lime-300 ring-1 ring-lime-400/60 backdrop-blur hover:bg-slate-950/90 z-50"
          onclick={(e) => {
            e.stopPropagation();
            onAddToMixtape();
          }}>+ Add</button
        >
      {/if}
    {/if}

    <div
      class="absolute z-50 right-0 bottom-0 rounded-tl-lg backdrop-blur-xs {!smol.Liked &&
        'opacity-100 md:opacity-0 md:group-hover:opacity-100'}"
    >
      <LikeButton
        smolId={smol.Id}
        liked={smol.Liked || false}
        classNames="p-2 bg-slate-950/50 hover:bg-slate-950/70 rounded-tl-lg"
        iconSize="size-6"
        on:likeChanged={(e) => onLikeChanged(e.detail.liked)}
      />
    </div>

    {#if audioState.currentSong?.Id === smol.Id}
      <!-- Active Song Overlay (Game Controller Mode) -->
      <div
        class="absolute inset-0 z-50 bg-transparent cursor-pointer opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300"
        role="button"
        tabindex="0"
        onclick={toggleSongSelection}
        onkeydown={(e) => e.key === "Enter" && toggleSongSelection()}
      >
        <div class="w-full h-full relative">
          <!-- Share Button (Bottom Center) -->
          <button
            class="absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/10 border-2 border-[#d836ff] text-[#d836ff] hover:bg-[#d836ff] hover:text-white transition-all active:scale-95 shadow-[0_0_15px_rgba(216,54,255,0.3)] pointer-events-auto"
            onclick={(e) => {
              e.stopPropagation();
              navigator
                .share?.({
                  title: smol.Title,
                  text: `Check out ${smol.Title} on Smol!`,
                  url: window.location.origin + "/" + smol.Id,
                })
                .catch(() => {
                  navigator.clipboard.writeText(
                    window.location.origin + "/" + smol.Id,
                  );
                  alert("Link copied to clipboard!");
                });
            }}
            title="Share"
          >
            <svg
              class="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
              />
            </svg>
          </button>

          <!-- Top Left: Artist -->
          <a
            href={`/artist/${smol.Address}`}
            class="absolute top-2 left-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-green-500 text-green-500 hover:bg-green-500 hover:text-white transition-all active:scale-95 shadow-[0_0_15px_rgba(34,197,94,0.3)] pointer-events-auto"
            onclick={(e) => e.stopPropagation()}
            title="Go to Artist"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </a>

          <!-- Top Right: Radio -->
          <a
            href={`/radio?seed=${smol.Id}`}
            class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-all active:scale-95 shadow-[0_0_15px_rgba(249,115,22,0.3)] pointer-events-auto"
            onclick={(e) => e.stopPropagation()}
            title="Start Radio"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.789M12 12h.008v.008H12V12z"
              />
            </svg>
          </a>

          <!-- Bottom Left: Like -->
          <div
            class="absolute bottom-2 left-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.3)] pointer-events-auto"
            onclick={(e) => {
              e.stopPropagation();
            }}
          >
            <!-- Reuse Global Like Button Logic manually or embed component with custom style -->
            <button
              class="w-full h-full flex items-center justify-center"
              onclick={(e) => {
                e.stopPropagation();
                onLikeChanged(!smol.Liked);
              }}
            >
              <svg
                class="w-4 h-4 {smol.Liked ? 'fill-current' : 'fill-none'}"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
              </svg>
            </button>
          </div>

          <!-- Bottom Right: Song Detail -->
          <div
            role="button"
            class="absolute bottom-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-900/20 border-2 border-[#d836ff] text-[#d836ff] hover:bg-[#d836ff] hover:text-white transition-all active:scale-95 shadow-[0_0_15px_rgba(216,54,255,0.3)] pointer-events-auto"
            onclick={(e) => {
              e.stopPropagation();
              navigate(`/${smol.Id}`);
            }}
            onkeydown={() => {}}
            title="View Song"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163z"
              />
            </svg>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div
    class="flex items-center relative p-2 flex-1 overflow-hidden cursor-pointer touch-manipulation active:bg-slate-600/50 transition-colors duration-75"
    onclick={toggleSongSelection}
  >
    <h1
      class="relative z-1 leading-4 text-sm text-white line-clamp-2 flex-1 min-w-0 pr-2"
    >
      {smol.Title}
    </h1>
    <img
      class="absolute inset-0 z-0 opacity-80 scale-y-[-1] w-full h-full blur-lg pointer-events-none"
      src={`${API_URL}/image/${smol.Id}.png`}
      style="transform: translateZ(0); -webkit-transform: translateZ(0);"
      alt={smol.Title}
      loading="lazy"
    />
    <div class="relative z-2 pl-2 ml-auto">
      <!-- Player moved to art card -->
    </div>
  </div>
</div>
