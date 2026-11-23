<script lang="ts">
  import { untrack } from 'svelte';
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import type { Smol } from '../../types/domain';
  import MixtapeHeader from './MixtapeHeader.svelte';
  import MixtapeTracklist from './MixtapeTracklist.svelte';
  import MixtapeCollectCard from './MixtapeCollectCard.svelte';
  import MixtapeCollectSheet from './MixtapeCollectSheet.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import { next, player, playQueue, previous, setTrackLiked, toggle } from '../../stores/audio.svelte';
  import { toTrack, trackKey } from '../../utils/track';
  import { userState } from '../../stores/user.svelte';
  import { createCollectController } from '../../stores/mixtapeCollect.svelte';
  import { getMixtapeDetail } from '../../services/api/mixtapes';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { logger } from '../../utils/logger';

  interface Props {
    id: string;
    initialData?: MixtapeDetail | null;
    initialNotFound?: boolean;
  }

  let { id, initialData = null, initialNotFound = false }: Props = $props();

  let mixtape = $state<MixtapeDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let mixtapeTracks = $state<Smol[]>([]);

  // Collector state (Report 30). Chain reads are dynamic imports inside the
  // controller, so this route's static closure stays free of the Stellar SDK.
  const collect = createCollectController({
    getMixtapeId: () => id,
    getMixtapeTitle: () => mixtape?.title ?? 'this mixtape',
    isReady: () => Boolean(mixtape && mixtape.id === id && !loading),
    getTracks: () =>
      (mixtape?.tracks ?? []).map((track) => ({
        id: track.Id,
        title: track.Title || 'Untitled track',
        address: track.Address,
        mintToken: track.Mint_Token ?? null,
        mintAmm: track.Mint_Amm ?? null,
      })),
  });

  const ownsQueue = $derived(player.queueId === id);
  const isPlaying = $derived(ownsQueue && (player.status === 'playing' || player.status === 'loading'));
  const canPlay = $derived(player.ready && mixtapeTracks.some((track) => Boolean(track.Song_1)));

  const coverUrls = $derived(
    mixtape
      ? Array.from({ length: 4 }, (_, i) => {
          const track = mixtapeTracks[i];
          return track?.Id ? `${import.meta.env.PUBLIC_API_URL}/image/${track.Id}.png` : null;
        })
      : []
  );

  function startMixtape(index?: number) {
    const tracks = mixtapeTracks.map((track) => toTrack(track)).filter((track) => track !== null);
    const song = index === undefined ? undefined : mixtapeTracks[index];
    if (index !== undefined && !song?.Song_1) return;
    const key = song?.Song_1 ? trackKey(song.Id, song.Song_1) : null;
    if (ownsQueue && key && player.track?.key === key) {
      toggle();
      return;
    }
    const start = key ? tracks.findIndex((track) => track.key === key) : 0;
    playQueue(tracks, start, { id, album: mixtape?.title, wrap: true });
  }

  /** C-08: Play ⇄ Pause, never a danger "Stop Playing". */
  function togglePlayback() {
    if (ownsQueue && player.track) {
      toggle();
      return;
    }
    startMixtape();
  }

  function handleKeyboard(event: KeyboardEvent) {
    if (!ownsQueue || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [contenteditable], dialog[open]')) return;

    switch (event.key) {
      case ' ':
        event.preventDefault();
        toggle();
        break;
      case 'ArrowRight':
        event.preventDefault();
        next();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        previous();
        break;
    }
  }

  let lastFetchedMixtapeId = $state<string | null>(null);

  async function fetchMixtapeData(mixtapeId: string, seed: MixtapeDetail | null) {
    loading = true;
    error = null;

    try {
      const detailPromise = seed ?? getMixtapeDetail(mixtapeId);
      const likedTrackIdsPromise = userState.contractId
        ? fetchLikedSmols().catch(() => [] as string[])
        : Promise.resolve([]);
      const [mixtapeData, likedTrackIds] = await Promise.all([
        detailPromise,
        likedTrackIdsPromise,
      ]);

      if (!mixtapeData) {
        mixtape = null;
        return;
      }

      mixtape = mixtapeData;
      const likedTrackIdSet = new Set(likedTrackIds);

      mixtapeTracks = mixtapeData.tracks.map((track) => ({
        Id: track.Id,
        Title: track.Title,
        Address: track.Address,
        Song_1: track.Song_1,
        Mint_Token: track.Mint_Token,
        Mint_Amm: track.Mint_Amm,
        Public: track.Public,
        Liked: likedTrackIdSet.has(track.Id),
        lyrics: track.Tags?.length ? { style: track.Tags } : undefined,
      }));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load this mixtape.';
      logger.error('mixtape', 'Failed to fetch mixtape data:', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (id && id !== lastFetchedMixtapeId) {
      const mixtapeId = id;
      const isInitialMount = lastFetchedMixtapeId === null;
      const seed = initialData?.id === mixtapeId ? initialData : null;
      lastFetchedMixtapeId = mixtapeId;
      if (isInitialMount && initialNotFound && !seed) {
        mixtape = null;
        loading = false;
        error = null;
        return;
      }
      untrack(() => void fetchMixtapeData(mixtapeId, seed));
    }
  });

  function handleLikeChanged(index: number, liked: boolean) {
    const track = mixtapeTracks[index];
    if (!track) return;
    track.Liked = liked;
    setTrackLiked(track.Id, liked);
  }
</script>

<svelte:window onkeydown={handleKeyboard} />

<section class="app-container py-6 sm:py-8">
  {#if loading}
    <Skeleton variant="hero" />
  {:else if error}
    <div class="py-12">
      <StateFeedback
        kind="error"
        title="Could not load mixtape"
        message={error}
        actionLabel="Try again"
        onAction={() => void fetchMixtapeData(id, null)}
      />
    </div>
  {:else if !mixtape}
    <div class="py-12">
      <StateFeedback
        kind="empty"
        icon="mixtapes"
        title="Mixtape not found"
        message="Double-check the link or browse published mixtapes."
        actionLabel="Browse mixtapes"
        actionHref="/mixtapes"
      />
    </div>
  {:else}
    <div class="space-y-8">
      <MixtapeHeader
        {mixtape}
        {coverUrls}
        playback={{ isPlaying, canPlay, onToggle: togglePlayback }}
      >
        {#snippet collectSlot()}
          {#if collect.summary.total > 0}
            <MixtapeCollectCard
              card={collect.card}
              page={collect.page}
              summary={collect.summary}
              states={collect.states}
              onAction={collect.onCardAction}
              onExplain={() => collect.openView('explain')}
            />
          {/if}
        {/snippet}
      </MixtapeHeader>

      <MixtapeTracklist
        {mixtape}
        {mixtapeTracks}
        collectStates={collect.states}
        balances={collect.balances}
        signedIn={collect.signedIn}
        onTrackClick={startMixtape}
        onLikeChanged={handleLikeChanged}
      />
    </div>
  {/if}
</section>

{#if mixtape}
  <MixtapeCollectSheet controller={collect} mixtapeTitle={mixtape.title} />
{/if}
