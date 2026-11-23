<script lang="ts">
  import type { MusicProvider, SmolDetailResponse, SongData } from '../../types/domain';
  import type { Track } from '../../utils/track';
  import { expectedTakeCount } from '../../utils/takes';
  import { player } from '../../stores/audio.svelte';
  import MiniAudioPlayer from '../audio/MiniAudioPlayer.svelte';
  import Chip from '../ui/Chip.svelte';
  import Button from '../ui/Button.svelte';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    provider: MusicProvider;
    wasFallback: boolean;
    songs: SongData[];
    takes: (Track | null)[];
    bestSong?: string;
    isOwner: boolean;
    showGenerationLoader: boolean;
    kvDo?: SmolDetailResponse['kv_do'];
    savingBest?: boolean;
    onPlayTake: (track: Track) => void;
    onSelectBestSong: (musicId: string) => void;
  }

  let {
    provider,
    wasFallback,
    songs,
    takes,
    bestSong,
    isOwner,
    showGenerationLoader,
    kvDo,
    savingBest = false,
    onPlayTake,
    onSelectBestSong,
  }: Props = $props();

  const expected = $derived(expectedTakeCount(provider));
  const playableTakes = $derived(takes.filter((t): t is Track => t !== null));
  const hasMultipleTakes = $derived(songs.length > 1 || playableTakes.length > 1);
  const slotCount = $derived(
    showGenerationLoader ? Math.max(takes.length, expected) : takes.length
  );
  const partialClassic = $derived(
    !showGenerationLoader &&
      !wasFallback &&
      expected === 2 &&
      songs.length === 1
  );

  const stageLabel = $derived.by(() => {
    if (!showGenerationLoader) return '';
    const hasLyrics = Boolean(kvDo?.lyrics?.title || kvDo?.lyrics?.lyrics);
    const hasImage = Boolean(kvDo?.image);
    const readyCount = songs.filter((s) => s.status >= 4 && s.music_id).length;

    if (!hasLyrics) return 'Writing lyrics and title…';
    if (!hasImage) return 'Painting pixel cover art…';
    if (expected === 1) return 'Recording track…';
    if (readyCount > 0 && readyCount < expected) {
      return `${readyCount} of ${expected} takes ready…`;
    }
    return `Recording ${expected} takes…`;
  });
</script>

{#if showGenerationLoader}
  <section aria-label="Generation progress" class="space-y-3 rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line">
    <div class="flex items-center gap-2.5 text-sm text-ink-1">
      <Loader classNames="size-4" textColor="text-accent" />
      <span class="font-medium">{stageLabel}</span>
    </div>

    <div class={`grid gap-2.5 ${slotCount > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
      {#each Array.from({ length: slotCount }) as _, index (index)}
        {@const track = takes[index] ?? null}
        {@const song = songs[index]}
        {@const isPreview = Boolean(song && song.status < 4 && song.audio)}
        <div class="flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 ring-1 ring-inset ring-line">
          {#if track}
            <MiniAudioPlayer
              trackKey={track.key}
              onToggle={() => onPlayTake(track)}
              label={`take ${index + 1}`}
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-ink-1">
                  {slotCount > 1 ? `Take ${index + 1}` : 'Track'}
                </span>
                {#if isPreview}
                  <Chip tone="accent">Preview</Chip>
                {:else}
                  <Chip tone="success">Ready</Chip>
                {/if}
              </div>
            </div>
          {:else}
            <div class="size-10 shrink-0 animate-pulse rounded-full bg-surface-3" aria-hidden="true"></div>
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="h-3.5 w-20 animate-pulse rounded bg-surface-3"></div>
              <div class="h-2.5 w-32 animate-pulse rounded bg-surface-3/70"></div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{:else if hasMultipleTakes}
  <section aria-label="Takes" class="space-y-2.5">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-ink-2">Takes</h2>
      <span class="text-xs text-ink-3">{songs.length} takes</span>
    </div>

    <div class="grid gap-2.5 sm:grid-cols-2">
      {#each takes as track, index (songs[index]?.music_id ?? index)}
        {@const song = songs[index]}
        {@const isMain = Boolean(song && bestSong === song.music_id)}
        {@const isActive = Boolean(track && player.track?.key === track.key)}
        <div
          class={`flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-1 px-3 py-2.5 ring-1 ring-inset ${
            isActive ? 'ring-accent/60' : 'ring-line'
          }`}
        >
          <div class="flex min-w-0 items-center gap-2.5">
            {#if track}
              <MiniAudioPlayer
                trackKey={track.key}
                onToggle={() => onPlayTake(track)}
                label={`take ${index + 1}`}
              />
            {/if}
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-ink-1">Take {index + 1}</span>
                {#if isMain}
                  <Chip tone="accent">Main</Chip>
                {/if}
              </div>
              {#if !track}
                <p class="text-xs text-ink-3">Unavailable</p>
              {/if}
            </div>
          </div>

          {#if song && isOwner && !isMain && track}
            <Button
              variant="ghost"
              size="sm"
              class="min-h-11"
              disabled={savingBest}
              onclick={() => onSelectBestSong(song.music_id)}
            >
              Use as main take
            </Button>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{:else if partialClassic}
  <p class="text-xs text-ink-3">1 of 2 takes finished.</p>
{/if}
