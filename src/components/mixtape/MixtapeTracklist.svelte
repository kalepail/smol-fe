<script lang="ts">
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import type { Smol } from '../../types/domain';
  import MiniAudioPlayer from '../audio/MiniAudioPlayer.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import CoverArt from '../ui/CoverArt.svelte';
  import TrackCollectPill from './TrackCollectPill.svelte';
  import type { TrackCollectState } from '../../utils/mixtapeOwnership';
  import Chip from '../ui/Chip.svelte';
  import { player } from '../../stores/audio.svelte';
  import { trackKey } from '../../utils/track';
  import { shortenAddress } from '../../utils/address';

  interface Props {
    mixtape: MixtapeDetail;
    mixtapeTracks: Smol[];
    collectStates: TrackCollectState[];
    balances: (bigint | undefined)[];
    signedIn: boolean;
    onTrackClick: (index: number) => void;
    onLikeChanged: (index: number, liked: boolean) => void;
  }

  let {
    mixtape,
    mixtapeTracks,
    collectStates,
    balances,
    signedIn,
    onTrackClick,
    onLikeChanged,
  }: Props = $props();

  const counter = $derived.by(() => {
    const total = collectStates.length;
    if (total === 0) return `${mixtape.trackCount} ${mixtape.trackCount === 1 ? 'song' : 'songs'}`;
    if (signedIn) return `${collectStates.filter((s) => s === 'owned').length}/${total} owned`;
    return `${collectStates.filter((s) => s === 'available').length}/${total} minted`;
  });

</script>

<section class="border-t border-line pt-6">
  <header class="mb-3 flex items-center justify-between">
    <h2 class="text-lg font-semibold text-ink-1">Tracklist</h2>
    <span class="tabular text-xs font-medium text-ink-2">{counter}</span>
  </header>

  {#if mixtape.tracks.length === 0}
    <p class="rounded-[var(--radius-control)] bg-surface-1 p-6 text-center text-sm text-ink-2 ring-1 ring-inset ring-line">
      This mixtape does not have any tracks yet.
    </p>
  {:else}
    <ol class="divide-y divide-line">
      {#each mixtape.tracks as track, index (track.Id)}
        {@const smolTrack = mixtapeTracks[index]}
        {@const key = smolTrack?.Song_1 ? trackKey(track.Id, smolTrack.Song_1) : null}
        {@const isCurrentTrack = Boolean(key && player.track?.key === key)}
        {@const collectState = collectStates[index]}
        {@const inFlight = collectState === 'minting' || collectState === 'buying'}

        <li
          class={`flex items-center gap-3 py-3 px-2 -mx-2 rounded-[var(--radius-control)] transition-opacity ${
            isCurrentTrack ? 'bg-surface-1 ring-1 ring-inset ring-accent/40' : 'hover:bg-surface-1/70'
          } ${inFlight ? 'opacity-60' : ''}`}
        >
          <span class="tabular hidden w-6 shrink-0 text-right font-mono text-xs text-ink-3 sm:inline-block">
            {index + 1}
          </span>

          <a
            href={`/${track.Id}`}
            class="focus-ring size-12 shrink-0 rounded-[var(--radius-media)]"
            aria-label={`Open ${smolTrack?.Title ?? 'track'}`}
          >
            <CoverArt id={smolTrack?.Id ?? track.Id} alt="" scale={4} />
          </a>

          <div class="min-w-0 flex-1">
            <a
              href={`/${track.Id}`}
              class="focus-ring block truncate rounded text-[15px] font-medium text-ink-1 hover:underline"
            >
              {smolTrack?.Title ?? 'Untitled track'}
            </a>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
              {#if smolTrack?.Address}
                <span class="font-mono truncate">{shortenAddress(smolTrack.Address)}</span>
              {/if}
              {#if smolTrack?.lyrics?.style?.length}
                <span class="hidden sm:inline-flex gap-1">
                  {#each smolTrack.lyrics.style.slice(0, 2) as tag (tag)}
                    <Chip tone="neutral" class="py-0 text-[11px]">{tag}</Chip>
                  {/each}
                </span>
              {/if}
              {#if collectState}
                <span class="lg:hidden">
                  <TrackCollectPill state={collectState} balance={balances[index]} {signedIn} />
                </span>
              {/if}
            </div>
          </div>

          {#if collectState}
            <div class="hidden w-44 shrink-0 lg:flex">
              <TrackCollectPill state={collectState} balance={balances[index]} {signedIn} />
            </div>
          {/if}

          <div class="flex shrink-0 items-center gap-1">
            <LikeButton
              smolId={track.Id}
              liked={smolTrack?.Liked || false}
              iconSize={18}
              onLikeChanged={(liked) => onLikeChanged(index, liked)}
            />
            {#if key}
              <MiniAudioPlayer
                trackKey={key}
                onToggle={() => onTrackClick(index)}
                label={smolTrack?.Title}
              />
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</section>
