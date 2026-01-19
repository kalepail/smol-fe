<script lang="ts">
  import type { SmolDetailResponse } from "../../types/domain";
  import Loader from "../ui/Loader.svelte";
  import LikeButton from "../ui/LikeButton.svelte";
  import TokenBalancePill from "../ui/TokenBalancePill.svelte";
  import { API_URL, getSongUrl } from "../../utils/apiUrl";

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
    d1,
    kv_do,
    liked,
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
</script>

<div class="px-2 py-10">
  <div class="flex flex-col items-center max-w-[1024px] mx-auto">
    <ul class="max-w-[512px] w-full [&>li]:mb-5 [&>li>h1]:font-bold">
      <li>
        <h1>Id:</h1>
        <pre class="whitespace-pre-wrap break-all"><code class="text-xs"
            >{id}</code
          ></pre>

        <div class="flex items-center">
          {#if kv_do && kv_do?.nsfw}
            {#if kv_do.nsfw?.safe === false}
              <span
                class="bg-rose-400 text-rose-900 uppercase text-xs font-mono px-2 py-1 rounded-full mr-2"
              >
                unsafe — {kv_do.nsfw?.categories.join(", ")}
              </span>
            {:else}
              <span
                class="bg-lime-400 text-lime-900 uppercase text-xs font-mono px-2 py-1 rounded-full mr-2"
              >
                safe
              </span>

              {#if isOwner}
                <button
                  class="uppercase text-xs font-mono ring rounded px-2 py-1
                    {d1?.Public
                    ? 'text-amber-500 bg-amber-500/20 ring-amber-500 hover:bg-amber-500/30'
                    : 'text-blue-500 bg-blue-500/20 ring-blue-500 hover:bg-blue-500/30'}"
                  onclick={onMakeSongPublic}
                >
                  {#if d1?.Public}
                    Unpublish
                  {:else}
                    Publish
                  {/if}
                </button>
              {/if}
            {/if}

            {#if minted}
              <span
                class="uppercase text-xs font-mono bg-emerald-400 text-emerald-900 px-2 py-1 rounded-full ml-2"
              >
                Minted
              </span>
              {#if tradeReady}
                <button
                  class="flex items-center uppercase text-xs font-mono ring rounded px-2 py-1 text-sky-400 bg-sky-400/10 ring-sky-400 hover:bg-sky-400/20 ml-2"
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
                class="flex items-center uppercase text-xs font-mono ring rounded px-2 py-1 text-emerald-400 bg-emerald-400/10 ring-emerald-400 hover:bg-emerald-400/20 ml-2 disabled:opacity-50"
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

            {#if isOwner}
              <button
                class="uppercase text-xs font-mono ring rounded px-2 py-1 text-rose-500 bg-rose-500/20 ring-rose-500 hover:bg-rose-500/30 ml-2"
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

            {#if d1?.Id}
              <div class="ml-2">
                <LikeButton
                  smolId={d1.Id}
                  {liked}
                  on:likeChanged={(e) => onLikeChanged(e.detail.liked)}
                />
              </div>
            {/if}
          {/if}

          {#if interval}
            <Loader classNames="size-7 ml-2" />
          {/if}
        </div>
      </li>

      <li>
        <h1>Prompt:</h1>
        <p>{kv_do && kv_do?.payload?.prompt}</p>
      </li>

      <li>
        <h1 class="mb-2">Image:</h1>

        {#if (kv_do && kv_do?.image_base64) || (id && d1)}
          <img
            class="aspect-square object-contain pixelated w-[256px]"
            src={`${API_URL}/image/${id}.png`}
            style="transform: translateZ(0); -webkit-transform: translateZ(0);"
            onerror={(e) => {
              if (kv_do?.image_base64) {
                (e.currentTarget as HTMLImageElement).src =
                  `data:image/png;base64,${kv_do.image_base64}`;
              }
            }}
            alt={kv_do?.lyrics?.title}
          />
        {/if}
      </li>

      <li>
        <h1>Description:</h1>
        <p>{kv_do && kv_do?.description}</p>
      </li>

      <li>
        <h1 class="flex items-center mb-2">
          Songs:
          {#if interval && kv_do?.songs?.some((song) => song.audio)}
            <Loader classNames="size-7 ml-2" />
            <small class="ml-2 text-xs text-slate-400 font-normal"
              >streaming...</small
            >
          {/if}
        </h1>

        {#if kv_do && kv_do?.songs?.length}
          {#each kv_do && kv_do.songs as song, index (song.music_id)}
            <div class="flex items-center mb-2">
              {#if song.audio}
                <audio
                  class="mr-2"
                  bind:this={audioElements[index]}
                  onplay={() => onPlayAudio(index)}
                  src={song.status < 4 ? song.audio : getSongUrl(song.music_id)}
                  onerror={(e) => {
                    if (song.audio)
                      (e.currentTarget as HTMLAudioElement).src = song.audio;
                  }}
                  preload="none"
                  controls
                ></audio>

                {#if isOwner}
                  <input
                    class="scale-150 m-2"
                    type="radio"
                    value={song.music_id}
                    bind:group={bestSong}
                    onchange={() => onSelectBestSong(song.music_id)}
                  />
                {/if}

                {#if song.music_id === bestSong}
                  <span class="text-2xl ml-1">👈</span>
                  <span class="ml-2 mt-1">better</span>
                {/if}
              {:else}
                <Loader />
              {/if}
            </div>
          {/each}
        {:else if interval}
          <Loader />
        {/if}
      </li>

      <li>
        <h1>Lyrics:</h1>
        <pre class="whitespace-pre-wrap break-words [&>code]:text-xs"><code
            >Title: <strong>{kv_do && kv_do?.lyrics?.title}</strong></code
          >
<code>Tags: <em>{kv_do && kv_do?.lyrics?.style?.join(", ")}</em></code>

{#if !kv_do?.payload?.instrumental && !d1?.Instrumental}<code
              >{kv_do && kv_do?.lyrics?.lyrics}</code
            >{/if}</pre>
      </li>
    </ul>
  </div>
</div>
