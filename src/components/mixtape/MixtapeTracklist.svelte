<script lang="ts">
  import type { MixtapeDetail } from "../../services/api/mixtapes";
  import type { Smol } from "../../types/domain";
  import Loader from "../ui/Loader.svelte";
  import MiniAudioPlayer from "../audio/MiniAudioPlayer.svelte";
  import LikeButton from "../ui/LikeButton.svelte";
  import TokenBalancePill from "../ui/TokenBalancePill.svelte";
  import { audioState } from "../../stores/audio.svelte.ts";

  interface Props {
    mixtape: MixtapeDetail;
    mixtapeTracks: Smol[];
    loadingTracks: Set<string>;
    onTrackClick: (index: number) => void;
    onPlayNext: () => void;
    onLikeChanged: (index: number, liked: boolean) => void;
  }

  let {
    mixtape,
    mixtapeTracks,
    loadingTracks,
    onTrackClick,
    onPlayNext,
    onLikeChanged,
  }: Props = $props();

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

  function truncateAddress(address: string | null): string {
    if (!address) return "";
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
</script>

<section
  class="rounded-xl md:rounded-[2.5rem] border border-white/5 bg-black/20 backdrop-blur-md p-3 md:p-6 shadow-2xl"
>
  <header class="mb-4 flex items-center justify-between px-2">
    <h2
      class="text-lg md:text-xl font-pixel font-bold uppercase tracking-widest text-[#d836ff] drop-shadow-[0_2px_0_rgba(216,54,255,0.2)]"
    >
      Tracklist
    </h2>
    <span
      class="text-[10px] md:text-xs font-pixel uppercase tracking-widest text-white/40"
      >{mixtape.trackCount} TRK</span
    >
  </header>

  {#if mixtape.tracks.length === 0}
    <p
      class="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-[10px] font-pixel uppercase tracking-widest text-white/30"
    >
      Track details will appear here after the backend is connected.
    </p>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each mixtape.tracks as track, index (track.Id)}
        {@const smolTrack = mixtapeTracks[index]}
        {@const isLoading = loadingTracks.has(track.Id)}
        {@const isCurrentTrack = audioState.currentSong?.Id === track.Id}
        {@const isCurrentlyPlaying =
          isCurrentTrack && audioState.playingId === track.Id}
        {@const isMinted = Boolean(
          smolTrack?.Mint_Token && smolTrack?.Mint_Amm,
        )}
        {@const balance = smolTrack?.balance || 0n}
        <li
          class="flex items-stretch gap-3 rounded-lg md:rounded-2xl border p-2 md:p-4 transition-all cursor-pointer md:items-center group hover:-translate-y-[1px] {isCurrentTrack
            ? 'border-lime-500/50 bg-lime-500/10 shadow-[0_0_20px_rgba(163,230,53,0.1)]'
            : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10 hover:shadow-lg'}"
          onclick={() => onTrackClick(index)}
        >
          <a
            href={`/${track.Id}`}
            target="_blank"
            class="relative w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900 group md:h-16 md:w-16"
            onclick={(e) => e.stopPropagation()}
          >
            {#if isLoading}
              <div class="flex h-full w-full items-center justify-center">
                <Loader classNames="w-6 h-6" />
              </div>
            {:else if smolTrack?.Id}
              <img
                src={`${API_URL}/image/${smolTrack.Id}.png?scale=4`}
                alt={smolTrack.Title ?? "Track"}
                class="h-full w-full object-cover pixelated transition-transform group-hover:scale-110"
                onerror={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  if (!target.src.includes("smols")) {
                    // Try alternative endpoint first
                    target.src = `https://api.smol.xyz/smols/${smolTrack.Id}/image?scale=4`;
                  } else {
                    // Fallback to placeholder
                    target.src =
                      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="%23334155" width="64" height="64"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-family="monospace" font-size="12">SMOL</text></svg>';
                  }
                }}
              />
            {:else}
              <div
                class="flex h-full w-full items-center justify-center text-xs text-slate-500"
              >
                {index + 1}
              </div>
            {/if}
          </a>

          <div class="flex flex-1 flex-col gap-2 min-w-0">
            <div class="flex flex-col min-w-0">
              <div
                class="font-pixel font-bold text-white uppercase tracking-wide text-xs md:text-sm line-clamp-3 break-words"
              >
                {#if isLoading}
                  Loading...
                {:else}
                  {smolTrack?.Title ?? "Unknown Track"}
                {/if}
              </div>
              {#if smolTrack?.Address}
                <span class="text-xs text-slate-400" title={smolTrack.Address}>
                  {truncateAddress(smolTrack.Address)}
                </span>
              {/if}
              {#if smolTrack?.lyrics?.style && smolTrack.lyrics.style.length > 0}
                <div class="mt-1 flex flex-wrap gap-1">
                  {#each smolTrack.lyrics.style.slice(0, 3) as tag}
                    <span
                      class="text-[8px] md:text-[10px] bg-white/5 text-white/40 px-2 py-0.5 rounded-md font-pixel uppercase tracking-wide border border-white/5"
                    >
                      {tag}
                    </span>
                  {/each}
                  {#if isMinted}
                    <span
                      class="text-[8px] md:text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-pixel uppercase tracking-wide border border-emerald-500/20"
                    >
                      Minted
                    </span>
                  {/if}
                  {#if isMinted && balance > 0n}
                    <TokenBalancePill {balance} />
                  {/if}
                </div>
              {:else if isMinted || balance > 0n}
                <div class="mt-1 flex flex-wrap gap-1">
                  {#if isMinted}
                    <span
                      class="text-[8px] md:text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-pixel uppercase tracking-wide border border-emerald-500/20"
                    >
                      Minted
                    </span>
                  {/if}
                  {#if balance > 0n}
                    <TokenBalancePill {balance} />
                  {/if}
                </div>
              {/if}
            </div>

            <div class="flex items-center justify-between gap-2 md:hidden">
              <div class="flex items-center gap-2">
                {#if mixtapeTracks[index]?.Song_1}
                  <div
                    class="relative z-2"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <MiniAudioPlayer
                      id={track.Id}
                      playing_id={audioState.playingId}
                      songToggle={() => onTrackClick(index)}
                      songNext={onPlayNext}
                      progress={audioState.currentSong?.Id === track.Id
                        ? audioState.progress
                        : 0}
                    />
                  </div>
                {/if}

                <div onclick={(e) => e.stopPropagation()}>
                  <LikeButton
                    smolId={track.Id}
                    liked={smolTrack?.Liked || false}
                    classNames="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
                    on:likeChanged={(e) => onLikeChanged(index, e.detail.liked)}
                  />
                </div>
              </div>

              <div class="text-sm text-slate-500 font-mono">
                #{index + 1}
              </div>
            </div>
          </div>

          <div class="hidden md:flex items-center gap-2">
            {#if mixtapeTracks[index]?.Song_1}
              <div class="relative z-2" onclick={(e) => e.stopPropagation()}>
                <MiniAudioPlayer
                  id={track.Id}
                  playing_id={audioState.playingId}
                  songToggle={() => onTrackClick(index)}
                  songNext={onPlayNext}
                  progress={audioState.currentSong?.Id === track.Id
                    ? audioState.progress
                    : 0}
                />
              </div>
            {/if}

            <div onclick={(e) => e.stopPropagation()}>
              <LikeButton
                smolId={track.Id}
                liked={smolTrack?.Liked || false}
                classNames="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
                on:likeChanged={(e) => onLikeChanged(index, e.detail.liked)}
              />
            </div>

            <div class="text-sm text-slate-500 font-mono">
              #{index + 1}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
