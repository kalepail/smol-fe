<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SmolDetailResponse, SmolKV } from "../../types/domain";
  import TerminalLog from "../ui/TerminalLog.svelte";
  import GlitchImage from "../ui/GlitchImage.svelte";
  import KaraokeLyrics from "../ui/KaraokeLyrics.svelte";
  import AiDirector from "../ui/AiDirector.svelte";
  import Loader from "../ui/Loader.svelte";
  import LikeButton from "../ui/LikeButton.svelte";
  import TokenBalancePill from "../ui/TokenBalancePill.svelte";
  import { API_URL } from "../../utils/apiUrl";

  interface Props {
    id: string | null;
    d1?: SmolDetailResponse["d1"];
    kv_do?: SmolDetailResponse["kv_do"];
    liked?: boolean;
    bestSong?: string;
    interval: NodeJS.Timeout | null;
    minting: boolean;
    minted: boolean;
    tradeReady: boolean;
    tradeMintBalance: bigint;
    isOwner: boolean;
    audioElements: HTMLAudioElement[];
    onMakeSongPublic: () => void;
    onDeleteSong: () => void;
    onSelectBestSong: (songId: string) => void;
    onPlayAudio: (index: number) => void;
    onTriggerMint: () => void;
    onOpenTradeModal: () => void;
    onLikeChanged: (liked: boolean) => void;
  }

  let {
    id,
    d1 = undefined,
    kv_do = undefined,
    liked = false,
    bestSong = $bindable(),
    interval,
    minting,
    minted,
    tradeReady,
    tradeMintBalance,
    isOwner,
    audioElements = $bindable(),
    onMakeSongPublic,
    onDeleteSong,
    onSelectBestSong,
    onPlayAudio,
    onTriggerMint,
    onOpenTradeModal,
    onLikeChanged,
  }: Props = $props();

  // Computed state for loading status
  let isImageReady = $derived((kv_do && kv_do?.image_base64) || (id && d1));
  let isAudioReady = $derived(
    kv_do?.songs && kv_do.songs.length > 0 && kv_do.songs[0].status === 4,
  );

  let logs = $state<string[]>(["Initializing connection to SmolNet..."]);

  // Simulate logs based on incoming data
  $effect(() => {
    if (d1) logs = [...logs, "Database record found."];
    if (kv_do?.payload) logs = [...logs, "Prompt vector received."];
    if (kv_do?.description) logs = [...logs, "Scene description generated."];
    if (kv_do?.lyrics?.lyrics) logs = [...logs, "Lyrics generated."];
    if (isImageReady) logs = [...logs, "Visuals rendered."];
    if (isAudioReady) logs = [...logs, "Audio stream finalized."];
  });
</script>

<div class="px-2 py-10 max-w-[1280px] mx-auto text-slate-200">
  <div class="flex flex-col lg:flex-row gap-8">
    <!-- Left Column: Visuals & Metadata -->
    <div class="flex-1 space-y-6">
      <!-- Header & Terminal -->
      <div class="space-y-4">
        <div class="flex justify-between items-start">
          <h1
            class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-lime-400 to-emerald-500 break-words"
          >
            {kv_do?.lyrics?.title || d1?.Title || "Untitled Track"}
          </h1>
          <!-- Actions & Badges -->
          <div class="flex items-center gap-2 flex-wrap justify-end">
            {#if d1?.Id}
              <LikeButton
                smolId={d1.Id}
                {liked}
                on:likeChanged={(e) => onLikeChanged(e.detail.liked)}
              />
            {/if}

            {#if isOwner}
              <button
                class="uppercase text-xs font-mono ring rounded px-3 py-1.5 transition-colors
                                {d1?.Public
                  ? 'text-amber-500 bg-amber-500/10 ring-amber-500 hover:bg-amber-500/20'
                  : 'text-blue-500 bg-blue-500/10 ring-blue-500 hover:bg-blue-500/20'}"
                onclick={onMakeSongPublic}
              >
                {d1?.Public ? "Unpublish" : "Publish"}
              </button>

              <button
                class="uppercase text-xs font-mono ring rounded px-2 py-1.5 text-rose-500 bg-rose-500/10 ring-rose-500 hover:bg-rose-500/20"
                aria-label="Delete"
                onclick={onDeleteSong}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  class="size-4"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            {/if}

            {#if minted}
              <span
                class="uppercase text-xs font-mono bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full border border-emerald-500/30"
                >Minted</span
              >
              {#if tradeReady}
                <button
                  class="flex items-center uppercase text-xs font-mono ring rounded px-3 py-1.5 text-sky-400 bg-sky-400/10 ring-sky-400 hover:bg-sky-400/20"
                  onclick={onOpenTradeModal}
                >
                  <span>Trade</span>
                  <TokenBalancePill
                    balance={tradeMintBalance}
                    classNames="ml-2"
                  />
                </button>
              {/if}
            {:else}
              <button
                class="flex items-center uppercase text-xs font-mono ring rounded px-3 py-1.5 text-emerald-400 bg-emerald-400/10 ring-emerald-400 hover:bg-emerald-400/20 disabled:opacity-50"
                disabled={minting}
                onclick={onTriggerMint}
              >
                {#if minting}
                  <Loader
                    classNames="w-4 h-4 mr-2"
                    textColor="text-emerald-400"
                  />
                  Minting...
                {:else}
                  Mint
                {/if}
              </button>
            {/if}
          </div>
        </div>

        {#if !isAudioReady}
          <TerminalLog {logs} />
        {/if}
      </div>

      <!-- Image / Glitch Area -->
      <div class="relative group w-full max-w-[512px] mx-auto lg:mx-0">
        {#if isImageReady}
          <img
            class="w-full aspect-square object-contain pixelated rounded-xl shadow-2xl border border-slate-800 transition-all duration-700 animate-in fade-in zoom-in-95 bg-black"
            src={`${API_URL}/image/${id}.png`}
            onerror={(e) => {
              // @ts-ignore
              if (kv_do?.image_base64) {
                // @ts-ignore
                e.currentTarget.src = `data:image/png;base64,${kv_do.image_base64}`;
              }
            }}
            alt={kv_do?.lyrics?.title ?? "Smol Image"}
          />
        {:else}
          <GlitchImage imageData={kv_do?.image_base64} />
        {/if}
      </div>

      <!-- AI Director Commentary on Description -->
      {#if kv_do?.description}
        <AiDirector context={kv_do.description} contextType="status" />
      {/if}

      <!-- Description Block -->
      {#if kv_do?.description}
        <div class="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <h3
            class="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2"
          >
            Visual Prompt
          </h3>
          <p class="text-slate-400 text-sm leading-relaxed">
            {kv_do.description}
          </p>
        </div>
      {/if}
    </div>

    <!-- Right Column: Lyrics & Audio -->
    <div class="flex-1 space-y-6">
      <!-- Audio Status -->
      <div
        class="bg-slate-900/80 p-6 rounded-xl border border-slate-800 flex flex-col gap-4 items-center justify-center min-h-[120px]"
      >
        <!-- If we have ANY songs, show logic, otherwise show waiting -->
        {#if kv_do?.songs && kv_do.songs.length > 0}
          {#each kv_do.songs as song, index (song.music_id)}
            <div class="w-full">
              <div class="flex items-center justify-between mb-2">
                <span
                  class={`font-mono text-sm ${song.status === 4 ? "text-emerald-400" : "text-amber-400 animate-pulse"}`}
                >
                  {song.status === 4 ? "AUDIO READY" : "STREAMING..."}
                </span>
                {#if song.status < 4}
                  <div class="flex items-center gap-2">
                    <span class="spinner-blue w-4 h-4"></span>
                    <span class="text-xs text-slate-500 ml-1"
                      >Optimizing...</span
                    >
                  </div>
                {/if}
                <!-- Better Selection Logic -->
                {#if isOwner && song.audio}
                  <div class="flex items-center gap-2">
                    <input
                      type="radio"
                      value={song.music_id}
                      bind:group={bestSong}
                      onchange={() => onSelectBestSong(song.music_id)}
                      class="accent-lime-500"
                    />
                    <span class="text-xs text-slate-400">Main Version</span>
                  </div>
                {/if}
              </div>

              {#if song.status === 4 || song.audio}
                <audio
                  class="w-full"
                  bind:this={audioElements[index]}
                  onplay={() => onPlayAudio(index)}
                  src={song.status < 4
                    ? song.audio
                    : `${API_URL}/song/${song.music_id}.mp3`}
                  onerror={(e) => {
                    // @ts-ignore
                    e.currentTarget.src = song.audio;
                  }}
                  preload="none"
                  controls
                ></audio>
              {:else}
                <div
                  class="w-full h-8 bg-slate-800 rounded-full overflow-hidden relative mt-2"
                >
                  <div
                    class="absolute inset-0 bg-lime-500/20 animate-pulse"
                  ></div>
                  <div
                    class="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-lime-500/50 to-transparent w-1/3 animate-[shimmer_2s_infinite]"
                  ></div>
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <!-- No songs yet -->
          <div
            class="w-full h-8 bg-slate-800 rounded-full overflow-hidden relative"
          >
            <div class="absolute inset-0 bg-lime-500/20 animate-pulse"></div>
            <div
              class="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-lime-500/50 to-transparent w-1/3 animate-[shimmer_2s_infinite]"
            ></div>
          </div>
          <div
            class="text-slate-500 font-mono text-xs tracking-widest animate-pulse"
          >
            GENERATING AUDIO STREAM...
          </div>
        {/if}
      </div>

      <!-- Lyrics / Karaoke -->
      {#if kv_do?.lyrics?.lyrics}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3
              class="text-xs font-mono text-slate-500 uppercase tracking-wider"
            >
              Lyrical Content
            </h3>
            <AiDirector context={kv_do.lyrics.lyrics} contextType="lyrics" />
          </div>

          <div
            class="h-[500px] bg-slate-950/50 p-6 rounded-xl border border-slate-800 relative overflow-hidden"
          >
            <!-- Tags -->
            {#if kv_do.lyrics.style}
              <div class="flex flex-wrap gap-2 mb-4 opacity-70">
                {#each kv_do.lyrics.style as tag}
                  <span
                    class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-slate-800 text-slate-400 border border-slate-700"
                  >
                    {tag}
                  </span>
                {/each}
              </div>
            {/if}

            <KaraokeLyrics text={kv_do.lyrics.lyrics} speed={30} />
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(300%);
    }
  }
</style>
