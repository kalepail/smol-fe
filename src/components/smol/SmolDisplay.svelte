<script lang="ts">
  import type { Smol, SmolDetailResponse } from '../../types/domain';
  import { untrack } from 'svelte';
  import MiniAudioPlayer from '../audio/MiniAudioPlayer.svelte';
  import { player, playQueue, setTrackLiked, toggle, updateTrack } from '../../stores/audio.svelte';
  import { toTrack } from '../../utils/track';
  import Loader from '../ui/Loader.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import TokenBalancePill from '../ui/TokenBalancePill.svelte';
  import { shortenAddress } from '../../utils/address';

  interface Props {
    id: string | null;
    d1?: SmolDetailResponse['d1'];
    kv_do?: SmolDetailResponse['kv_do'];
    liked?: boolean;
    bestSong?: string;
    showGenerationLoader: boolean;
    minting: boolean;
    minted: boolean;
    tradeReady: boolean;
    tradeMintBalance: bigint;
    isOwner: boolean;
    onMakeSongPublic: () => void;
    onDeleteSong: () => void;
    onSelectBestSong: (songId: string) => void;
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
    showGenerationLoader,
    minting,
    minted,
    tradeReady,
    tradeMintBalance,
    isOwner,
    onMakeSongPublic,
    onDeleteSong,
    onSelectBestSong,
    onTriggerMint,
    onOpenTradeModal,
    onLikeChanged,
  }: Props = $props();

  const artistName = $derived(
    d1?.Creator ?? d1?.Username ?? d1?.artist ?? d1?.author ?? shortenAddress(d1?.Address)
  );
  const hasStreamingSongs = $derived(
    Boolean(kv_do?.songs?.some((song) => song.audio && song.status < 4))
  );

  const smol = $derived<Smol | null>(id ? {
    ...d1,
    Id: id,
    Title: kv_do?.lyrics?.title || d1?.Title || kv_do?.description || 'Untitled Smol',
    Liked: liked,
  } : null);
  const takes = $derived.by(() => {
    const trackSmol = smol;
    if (!trackSmol) return [];
    if (!kv_do?.songs?.length) return [toTrack(trackSmol)];
    return kv_do.songs.map((song) => toTrack(trackSmol, song));
  });

  $effect(() => {
    const tracks = takes;
    untrack(() => {
      for (const track of tracks) if (track) updateTrack(track);
    });
  });

  function playTake(track: NonNullable<(typeof takes)[number]>) {
    if (player.track?.key === track.key) toggle();
    else playQueue([track], 0);
  }

  function handleLikeChanged(liked: boolean) {
    if (id) setTrackLiked(id, liked);
    onLikeChanged(liked);
  }
</script>

<div class="px-2 py-10">
  <div class="flex flex-col items-center max-w-[1024px] mx-auto">
    <ul class="max-w-[512px] w-full [&>li]:mb-5 [&>li>h1]:font-bold">
      <li>
        <h1>Id:</h1>
        <pre class="whitespace-pre-wrap break-all"><code class="text-xs">{id}</code></pre>

        <div class="flex items-center">
          {#if kv_do && kv_do?.nsfw}
            {#if kv_do.nsfw?.safe === false}
              <span
                class="bg-rose-400 text-rose-900 uppercase text-xs font-mono px-2 py-1 rounded-full mr-2"
              >
                unsafe — {kv_do.nsfw?.categories.join(', ')}
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
                  <TokenBalancePill balance={tradeMintBalance} classNames="ml-2" />
                </button>
              {/if}
            {:else}
              <button
                class="flex items-center uppercase text-xs font-mono ring rounded px-2 py-1 text-emerald-400 bg-emerald-400/10 ring-emerald-400 hover:bg-emerald-400/20 ml-2 disabled:opacity-50"
                disabled={minting}
                onclick={onTriggerMint}
              >
                {#if minting}
                  <Loader classNames="w-4 h-4 mr-2" textColor="text-emerald-400" />
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
                  on:likeChanged={(e) => handleLikeChanged(e.detail.liked)}
                />
              </div>
            {/if}
          {/if}

          {#if showGenerationLoader}
            <Loader classNames="size-7 ml-2" />
          {/if}
        </div>
      </li>

      <li>
        <h1>Prompt:</h1>
        <p>{kv_do && kv_do?.payload?.prompt}</p>
      </li>

      {#if d1?.Address}
        <li>
          <h1>Artist:</h1>
          <a
            class="break-all text-lime-400 hover:underline"
            href={`/artists/${encodeURIComponent(d1.Address)}`}
          >
            {artistName}
          </a>
        </li>
      {/if}

      {#if kv_do?.image}
        <li>
          <h1 class="mb-2">Image:</h1>
          <img
            class="aspect-square object-contain pixelated w-[256px]"
            src={`${import.meta.env.PUBLIC_API_URL}/image/${id}.png`}
            alt={kv_do?.lyrics?.title}
          />
        </li>
      {/if}

      <li>
        <h1>Description:</h1>
        <p>{kv_do && kv_do?.description}</p>
      </li>

      <li>
        <h1 class="flex items-center mb-2">
          Songs:
          {#if hasStreamingSongs}
            <Loader classNames="size-7 ml-2" />
            <small class="ml-2 text-xs text-slate-400 font-normal">streaming...</small>
          {/if}
        </h1>

        {#each takes as track, index}
          {@const song = kv_do?.songs?.[index]}
          <div class="flex items-center gap-2 mb-2">
            {#if track}
              <MiniAudioPlayer trackKey={track.key} onToggle={() => playTake(track)} label={`take ${index + 1}`} />
              <span>Take {index + 1}</span>

              {#if song && isOwner && takes.length > 1}
                <label class="flex items-center gap-2 ml-2">
                  <input
                    type="radio"
                    value={song.music_id}
                    bind:group={bestSong}
                    onchange={() => onSelectBestSong(song.music_id)}
                  />
                  Main take
                </label>
              {/if}
            {:else if showGenerationLoader}
              <Loader />
            {:else if song}
              <span class="text-sm text-slate-400">Take {index + 1} unavailable</span>
            {/if}
          </div>
        {/each}
      </li>

      <li>
        <h1>Lyrics:</h1>
        <pre class="whitespace-pre-wrap break-words [&>code]:text-xs"><code
            >Title: <strong>{kv_do && kv_do?.lyrics?.title}</strong></code
          >
<code>Tags: <em>{kv_do && kv_do?.lyrics?.style?.join(', ')}</em></code>

{#if !kv_do?.payload?.instrumental && !d1?.Instrumental}<code
              >{kv_do && kv_do?.lyrics?.lyrics}</code
            >{/if}</pre>
      </li>
    </ul>
  </div>
</div>
