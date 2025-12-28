<script lang="ts">
  import type { MixtapeDetail } from "../../services/api/mixtapes";
  import type { Smol } from "../../types/domain";
  import Loader from "../ui/Loader.svelte";
  import { userState } from "../../stores/user.svelte";

  interface Props {
    mixtape: MixtapeDetail;
    coverUrls: (string | null)[];
    loadingTracks: Set<string>;
    isPlayingAll: boolean;
    isAnyPlaying: boolean;
    fullyOwned: boolean;
    isPurchasing: boolean;
    onPlayAll: () => void;
    onStopPlayAll: () => void;
    onPurchaseClick: () => void;
    onEdit?: () => void;
  }

  let {
    mixtape,
    coverUrls,
    loadingTracks,
    isPlayingAll,
    isAnyPlaying,
    fullyOwned,
    isPurchasing,
    onPlayAll,
    onStopPlayAll,
    onPurchaseClick,
    onEdit,
  }: Props = $props();
</script>

<header
  class="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl md:flex-row md:gap-6 md:rounded-3xl md:p-6"
>
  <div
    class="grid h-auto w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl bg-slate-800 md:h-48 md:w-48 md:shrink-0"
  >
    {#each Array.from({ length: 4 }) as _, index}
      <div class="aspect-square bg-slate-900">
        {#if coverUrls[index]}
          <img
            src={`${coverUrls[index]}${coverUrls[index]?.includes("?") ? "" : "?scale=4"}`}
            alt={mixtape.title}
            class="h-full w-full object-cover pixelated"
            onerror={(e) => {
              // @ts-ignore
              e.currentTarget.style.display = "none";
            }}
          />
        {:else}
          <div
            class="flex h-full w-full items-center justify-center text-xs text-slate-500"
          >
            {#if mixtape.tracks[index] && loadingTracks.has(mixtape.tracks[index].Id)}
              <Loader classNames="w-6 h-6" />
            {:else}
              SMOL
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex flex-1 flex-col gap-4">
    <div>
      <h1 class="text-3xl font-bold text-white">
        {mixtape.title}
      </h1>
      <p class="mt-2 text-sm text-slate-400">
        {mixtape.description}
      </p>
    </div>

    <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      {#if isPlayingAll && isAnyPlaying}
        <button
          class="flex items-center justify-center gap-2 rounded bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
          onclick={onStopPlayAll}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="w-4 h-4"
          >
            <rect width="6" height="12" x="2" y="2" rx="1" />
            <rect width="6" height="12" x="8" y="2" rx="1" />
          </svg>
          Stop Playing
        </button>
      {:else}
        <button
          class="flex items-center justify-center gap-2 rounded bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-300"
          onclick={onPlayAll}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="w-4 h-4"
          >
            <path
              d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732Z"
            />
          </svg>
          Play All
        </button>
      {/if}
      {#if onEdit}
        <span
          class="relative flex items-center justify-center gap-2 rounded px-6 py-2 text-sm font-medium bg-gradient-to-r from-slate-400 to-slate-600"
        >
          Fully Owned
          <img
            src="/owned-badge.png"
            alt="Fully Owned Badge"
            class="absolute -top-4 -right-7 w-12 h-12 transform rotate-12 z-10"
          />
        </span>
        <button
          class="text-xs text-slate-400 hover:text-white underline decoration-slate-600 hover:decoration-white underline-offset-4 transition-colors"
          onclick={onEdit}
        >
          Edit Mixtape (Creator Only)
        </button>
      {:else if fullyOwned && userState.contractId}
        <span
          class="relative flex items-center justify-center gap-2 rounded px-6 py-2 text-sm font-medium bg-gradient-to-r from-slate-400 to-slate-600"
        >
          Fully Owned
          <img
            src="/owned-badge.png"
            alt="Fully Owned Badge"
            class="absolute -top-4 -right-7 w-12 h-12 transform rotate-12 z-10"
          />
        </span>
      {:else}
        <button
          class="flex items-center justify-center gap-2 rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={onPurchaseClick}
          disabled={isPurchasing}
        >
          {#if isPurchasing}
            <Loader classNames="w-4 h-4" />
            Processing...
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-4 h-4"
            >
              <path
                d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.18 3a65.25 65.25 0 0113.36 1.412.75.75 0 01.58.875 48.645 48.645 0 01-1.618 6.2.75.75 0 01-.712.513H6a2.503 2.503 0 00-2.292 1.5H17.25a.75.75 0 010 1.5H2.76a.75.75 0 01-.748-.807 4.002 4.002 0 012.716-3.486L3.626 2.716a.25.25 0 00-.248-.216H1.75A.75.75 0 011 1.75zM6 17.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
              />
            </svg>
            Buy Mixtape
          {/if}
        </button>
      {/if}
    </div>

    {#if onEdit && mixtape.creator === userState.contractId}
      <div class="flex justify-center md:justify-start">
        <button
          class="text-xs text-slate-400 hover:text-white underline decoration-slate-600 hover:decoration-white underline-offset-4 transition-colors"
          onclick={onEdit}
        >
          Edit Mixtape (Creator Only)
        </button>
      </div>
    {/if}
  </div>
</header>
