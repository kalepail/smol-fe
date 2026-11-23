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
  import { fetchMixtapeDetail } from '../../services/api/mixtapes';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { logger } from '../../utils/logger';
  // Creator (owner-management) surface — Report 24. Mounted ONLY through the
  // header's ownerBanner / ownerChip / ownerActions slots; collectSlot (t488's
  // collector system) is untouched.
  import { navigate } from 'astro:transitions/client';
  import MixtapeOwnerCallout from './MixtapeOwnerCallout.svelte';
  import MixtapeOwnerMenu from './MixtapeOwnerMenu.svelte';
  import MixtapeMergeSheet, { type MergeSource } from './MixtapeMergeSheet.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { findOwnedMixtape, loadMyMixtapes, mixtapeChangeSignal, myMixtapesState } from '../../stores/myMixtapes.svelte';
  import { deleteMixtapeWithUndo, openMixtapeEditor } from '../../services/mixtapeActions';

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

  async function loadDetail(mixtapeId: string, fresh: boolean, quiet = false): Promise<MixtapeDetail | null> {
    const result = await fetchMixtapeDetail(mixtapeId, { fresh });
    // A quiet refresh (after an owner action) never navigates: the action that merged
    // or deleted this mixtape already decides where the owner goes next.
    if (result.kind === 'merged' && !quiet) {
      // Merged mixtapes keep their link: follow it to the mixtape that now holds the songs.
      void navigate(`/mixtapes/${encodeURIComponent(result.mergedInto)}?merged=1`, { history: 'replace' });
      return null;
    }
    return result.kind === 'found' ? result.detail : null;
  }

  async function fetchMixtapeData(mixtapeId: string, seed: MixtapeDetail | null, options: { quiet?: boolean; fresh?: boolean } = {}) {
    if (!options.quiet) loading = true;
    error = null;

    try {
      const detailPromise = seed ?? loadDetail(mixtapeId, options.fresh === true, options.quiet === true);
      const likedTrackIdsPromise = userState.contractId
        ? fetchLikedSmols().catch(() => [] as string[])
        : Promise.resolve([]);
      const [mixtapeData, likedTrackIds] = await Promise.all([
        detailPromise,
        likedTrackIdsPromise,
      ]);

      if (!mixtapeData) {
        if (options.quiet) return;
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

  // ---------------------------------------------------------------------------
  // Owner surface (creator only)
  // ---------------------------------------------------------------------------

  const isOwner = $derived(Boolean(mixtape && userState.contractId && userState.contractId === mixtape.creator));
  const isHidden = $derived(mixtape?.visibility === 'owner');
  const ownerList = $derived(
    isOwner && myMixtapesState.status === 'ready' && myMixtapesState.owner === userState.contractId ? myMixtapesState.items : []
  );
  const relatedOwned = $derived(isOwner ? findOwnedMixtape(mixtape?.relatedMixtapeId) ?? null : null);
  const otherOwned = $derived(ownerList.filter((item) => item.id !== mixtape?.id));

  let mergeSource = $state<MergeSource | null>(null);
  let mergeTargetId = $state<string | null>(null);

  $effect(() => {
    if (isOwner) void loadMyMixtapes();
  });

  // Refresh after an owner write to THIS mixtape (save from the builder, restore, merge target).
  let seenChangeVersion = mixtapeChangeSignal.version;
  $effect(() => {
    const version = mixtapeChangeSignal.version;
    if (version === seenChangeVersion) return;
    seenChangeVersion = version;
    if (mixtapeChangeSignal.ids.includes(id)) {
      untrack(() => void fetchMixtapeData(id, null, { quiet: true, fresh: true }));
    }
  });

  // `?merged=1` arrives from the SSR 307 / client redirect of a merged mixtape link.
  $effect(() => {
    if (typeof window === 'undefined' || !mixtape) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('merged') !== '1') return;
    url.searchParams.delete('merged');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    untrack(() =>
      toast.info(`That mixtape was merged into "${mixtape?.title ?? 'this one'}", so we opened it here.`, { tag: 'mixtape-lifecycle' })
    );
  });

  function ownerEdit(view: 'builder' | 'picker' = 'builder') {
    if (!mixtape) return;
    void openMixtapeEditor(mixtape.id, { view });
  }

  function ownerMerge(targetId: string | null) {
    if (!mixtape) return;
    mergeTargetId = targetId;
    mergeSource = {
      id: mixtape.id,
      title: mixtape.title,
      trackIds: mixtape.tracks.map((track) => track.Id),
      coverUrls: mixtape.coverUrls,
    };
  }

  function ownerDelete() {
    if (!mixtape) return;
    void deleteMixtapeWithUndo(
      { id: mixtape.id, title: mixtape.title, hiddenReason: mixtape.hiddenReason ?? null },
      { navigateTo: '/mixtapes?view=yours' }
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      toast.success('Link copied.', { tag: 'mixtape-lifecycle' });
    } catch {
      toast.error('Couldn’t copy the link.', { tag: 'mixtape-lifecycle' });
    }
  }

  function handleLikeChanged(index: number, liked: boolean) {
    const track = mixtapeTracks[index];
    if (!track) return;
    track.Liked = liked;
    setTrackLiked(track.Id, liked);
  }
</script>

<svelte:window onkeydown={handleKeyboard} />

{#snippet ownerBanner()}
  {#if mixtape}
    <MixtapeOwnerCallout
      {mixtape}
      match={relatedOwned}
      onEdit={() => ownerEdit('builder')}
      onAddSongs={() => ownerEdit('picker')}
      onMerge={(targetId) => ownerMerge(targetId)}
      onDelete={ownerDelete}
    />
  {/if}
{/snippet}

{#snippet ownerChip()}
  {#if isHidden}
    <span
      class="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-warning/30"
      data-owner-status="hidden"
    >
      <Icon name="eye-off" size={12} />
      Hidden
    </span>
  {:else}
    <span
      class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2 ring-1 ring-inset ring-line"
      title="Listed on the Mixtapes page. Anyone can find and play it."
      data-owner-status="listed"
    >
      <Icon name="globe" size={12} />
      Listed
    </span>
  {/if}
{/snippet}

{#snippet ownerActions()}
  {#if mixtape}
    <Button variant="secondary" class="rounded-full" onclick={() => ownerEdit('builder')}>
      <Icon name="pencil" size={16} />
      <span>Edit</span>
    </Button>
    <MixtapeOwnerMenu
      label={`More actions for ${mixtape.title}`}
      align="right"
      items={[
        ...(otherOwned.length > 0
          ? [{ label: 'Merge into another mixtape', icon: 'merge' as const, onSelect: () => ownerMerge(mixtape?.relatedMixtapeId ?? null) }]
          : []),
        { label: 'Copy link', icon: 'copy' as const, onSelect: () => void copyLink() },
        { label: 'Delete mixtape', icon: 'trash' as const, tone: 'danger' as const, onSelect: ownerDelete },
      ]}
    />
  {/if}
{/snippet}

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
        ownerBanner={isOwner && isHidden ? ownerBanner : undefined}
        ownerChip={isOwner && mixtape.visibility ? ownerChip : undefined}
        ownerActions={isOwner ? ownerActions : undefined}
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

{#if isOwner}
  <MixtapeMergeSheet
    open={mergeSource !== null}
    source={mergeSource}
    candidates={ownerList}
    initialTargetId={mergeTargetId}
    navigateToTarget
    onClose={() => {
      mergeSource = null;
      mergeTargetId = null;
    }}
  />
{/if}
