<script lang="ts">
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import type { Smol } from '../../types/domain';
  import Loader from '../ui/Loader.svelte';
  import MiniAudioPlayer from '../audio/MiniAudioPlayer.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import TokenBalancePill from '../ui/TokenBalancePill.svelte';
  import { audioState } from '../../stores/audio.svelte';

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
    onLikeChanged
  }: Props = $props();

  function truncateAddress(address: string | null): string {
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
</script>

<section
  class="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg md:rounded-3xl md:p-6"
>
  <header class="mb-4 flex items-center justify-between">
    <h2 class="text-xl font-semibold text-white">Tracklist</h2>
    <span class="text-xs uppercase tracking-wide text-slate-500"
      >{mixtape.trackCount} Smol{mixtape.trackCount === 1 ? '' : 's'}</span
    >
  </header>

  {#if mixtape.tracks.length === 0}
    <p
      class="rounded border border-dashed border-slate-600 bg-slate-900/60 p-6 text-center text-sm text-slate-400"
    >
      Track details will appear here after the backend is connected.
    </p>
  {:else}
    <ul class="flex flex-col gap-3">
      {#each mixtape.tracks as track, index (track.id)}
        {@const smolTrack = mixtapeTracks[index]}
        {@const isLoading = loadingTracks.has(track.id)}
        {@const isCurrentTrack = audioState.currentSong?.Id === track.id}
        {@const isCurrentlyPlaying =
          isCurrentTrack && audioState.playingId === track.id}
        {@const isMinted = Boolean(
          smolTrack?.Mint_Token && smolTrack?.Mint_Amm
        )}
        {@const balance = smolTrack?.balance || 0n}
        <li
          class="flex items-stretch gap-3 rounded-xl border p-3 transition-colors cursor-pointer md:items-center md:p-4 {isCurrentTrack
            ? 'border-lime-500 bg-slate-800'
            : 'border-slate-700 bg-slate-800/80 hover:bg-slate-800/60'}"
          onclick={() => onTrackClick(index)}
        >
          <a
            href={`/${track.id}`}
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
                src={`${import.meta.env.PUBLIC_API_URL}/image/${smolTrack.Id}.png?scale=4`}
                alt={smolTrack.Title ?? 'Track'}
                class="h-full w-full object-cover pixelated transition-transform group-hover:scale-110"
                onerror={(e) => {
                  // @ts-ignore
                  e.currentTarget.src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="%23334155" width="64" height="64"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-family="monospace" font-size="12">SMOL</text></svg>';
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
              <div class="font-semibold text-white truncate">
                {#if isLoading}
                  Loading...
                {:else}
                  {smolTrack?.Title ?? 'Unknown Track'}
                {/if}
              </div>
              {#if smolTrack?.Address}
                <span
                  class="text-xs text-slate-400 truncate"
                  title={smolTrack.Address}
                >
                  {truncateAddress(smolTrack.Address)}
                </span>
              {/if}
              {#if smolTrack?.lyrics?.style && smolTrack.lyrics.style.length > 0}
                <div class="mt-1 flex flex-wrap gap-1">
                  {#each smolTrack.lyrics.style.slice(0, 3) as tag}
                    <span
                      class="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  {/each}
                  {#if isMinted}
                    <span
                      class="text-[10px] bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium"
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
                      class="text-[10px] bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium"
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
                  <div class="relative z-2" onclick={(e) => e.stopPropagation()}>
                    <MiniAudioPlayer
                      id={track.id}
                      playing_id={audioState.playingId}
                      songToggle={() => onTrackClick(index)}
                      songNext={onPlayNext}
                      progress={audioState.currentSong?.Id === track.id
                        ? audioState.progress
                        : 0}
                    />
                  </div>
                {/if}

                <div onclick={(e) => e.stopPropagation()}>
                  <LikeButton
                    smolId={track.id}
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
                  id={track.id}
                  playing_id={audioState.playingId}
                  songToggle={() => onTrackClick(index)}
                  songNext={onPlayNext}
                  progress={audioState.currentSong?.Id === track.id
                    ? audioState.progress
                    : 0}
                />
              </div>
            {/if}

            <div onclick={(e) => e.stopPropagation()}>
              <LikeButton
                smolId={track.id}
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
