<script lang="ts">
  import { onMount } from 'svelte';
  import type { Smol } from '../../types/domain';
  import type { ArtistProfile, SmolListResponse } from '../../types/api';
  import SmolCard from './SmolCard.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import Button from '../ui/Button.svelte';
  import Loader from '../ui/Loader.svelte';
  import { playSmolQueue, setTrackLiked } from '../../stores/audio.svelte';
  import { mixtapeModeState, addTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { fetchWithTimeout, throwIfNotOk } from '../../services/api/fetch';
  import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
  import { toMixtapeTrack } from '../../utils/track';
  import { logger } from '../../utils/logger';

  interface Props {
    playlist?: string | null;
    endpoint?: string;
    heading?: string;
    initialData?: SmolListResponse | null;
    emptyTitle?: string;
    emptyDescription?: string;
  }

  let {
    playlist = null,
    endpoint = '',
    heading,
    initialData = null,
    emptyTitle = 'No songs yet',
    emptyDescription = '',
  }: Props = $props();

  let results = $state<Smol[]>([]);
  let cursor = $state<string | null>(null);
  let hasMore = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let likes = $state<string[]>([]);
  let draggingId = $state<string | null>(null);
  let loadingMore = $state(false);
  let paginationError = $state<string | null>(null);
  let scrollTrigger = $state<HTMLDivElement | null>(null);

  const scrollHook = useInfiniteScroll();
  const isAuthOnlyEndpoint = $derived(endpoint === 'created' || endpoint === 'liked');
  const needsAuth = $derived(isAuthOnlyEndpoint && !userState.contractId);

  function buildSmolListUrl(cursorValue?: string | null) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const baseUrl = cleanEndpoint
      ? `${import.meta.env.PUBLIC_API_URL}/${cleanEndpoint}`
      : import.meta.env.PUBLIC_API_URL;
    const url = new URL(baseUrl, window.location.origin);

    url.searchParams.set('limit', '100');
    if (cursorValue) {
      url.searchParams.set('cursor', cursorValue);
    }

    return url;
  }

  function applyUsernames(smols: Smol[], users?: ArtistProfile[]) {
    if (!users?.length) return smols;

    const usersByAddress = new Map(users.map((user) => [user.Address, user]));
    return smols.map((smol) => {
      if (!smol.Address || smol.Username) return smol;
      const user = usersByAddress.get(smol.Address);
      return user ? { ...smol, Username: user.Username } : smol;
    });
  }

  function readSmolList(data: SmolListResponse | Smol[]) {
    if (Array.isArray(data)) {
      return {
        smols: data,
        nextCursor: null,
        hasMore: false,
      };
    }

    return {
      smols: applyUsernames(data.smols || [], data.users),
      nextCursor: data.pagination?.nextCursor || null,
      hasMore: data.pagination?.hasMore || false,
    };
  }

  async function fetchInitialData(seed: SmolListResponse | null = null) {
    if (isAuthOnlyEndpoint && !userState.contractId) {
      results = [];
      loading = false;
      error = null;
      return;
    }

    loading = true;
    error = null;
    paginationError = null;

    try {
      const url = buildSmolListUrl();
      const listPromise = seed ?? fetchWithTimeout(url, { credentials: 'include' }).then(async (response) => {
        await throwIfNotOk(response, url.toString());
        return response.json();
      });
      const skipLikesFetch = endpoint === 'liked';
      const likedPromise = !skipLikesFetch && userState.contractId
        ? fetchLikedSmols().catch(() => [] as string[])
        : Promise.resolve([]);

      const [list, likedIds] = await Promise.all([listPromise, likedPromise]);
      const data = readSmolList(list);
      results = data.smols;
      cursor = data.nextCursor;
      hasMore = data.hasMore;

      likes = likedIds;
      if (skipLikesFetch) {
        results = results.map((smol) => ({ ...smol, Liked: true }));
      } else if (likedIds.length > 0) {
        const likedIdSet = new Set(likedIds);
        results = results.map((smol) => ({
          ...smol,
          Liked: likedIdSet.has(smol.Id),
        }));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load songs.';
      logger.error('smol', 'Failed to fetch initial data:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void fetchInitialData(initialData);
    if (playlist) {
      try {
        localStorage.setItem('smol:playlist', playlist);
      } catch {
        // Ignore storage errors.
      }
    }
  });

  $effect(() => {
    if (!scrollTrigger) return;

    const scrollObserver = scrollHook.createScrollObserver(() => {
      if (hasMore && !loadingMore && !loading && !paginationError) {
        void loadMore();
      }
    });

    scrollObserver.observe(scrollTrigger);

    return () => {
      scrollObserver.disconnect();
    };
  });

  function addToMixtape(smol: Smol) {
    addTrack(toMixtapeTrack(smol));
    toast.success(`Added "${smol.Title}" to mixtape draft.`);
  }

  function handleDragStart(event: DragEvent, smol: Smol) {
    if (!mixtapeModeState.active || smol.Public === 0) return;
    draggingId = smol.Id;
    if (event.dataTransfer) {
      const payload = { type: 'smol' as const, track: toMixtapeTrack(smol) };
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', payload.track.title);
    }
  }

  function handleDragEnd() {
    draggingId = null;
  }

  function handleLikeChanged(smol: Smol, liked: boolean) {
    setTrackLiked(smol.Id, liked);
    const foundSmol = results.find((s) => s.Id === smol.Id);
    if (foundSmol) {
      foundSmol.Liked = liked;
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore || !cursor) return;

    loadingMore = true;
    paginationError = null;

    try {
      const url = buildSmolListUrl(cursor);
      const response = await fetchWithTimeout(url, {
        credentials: 'include',
      });

      await throwIfNotOk(response, url.toString());

      const data = readSmolList(await response.json());
      const likedIdSet = new Set(likes);
      const smolsWithLikes = data.smols.map((smol: Smol) => ({
        ...smol,
        Liked: endpoint === 'liked' ? true : likedIdSet.has(smol.Id),
      }));

      results = [...results, ...smolsWithLikes];
      cursor = data.nextCursor;
      hasMore = data.hasMore;
    } catch (err) {
      paginationError = err instanceof Error ? err.message : 'Could not load more songs.';
      logger.error('smol', 'Failed to load more smols:', err);
    } finally {
      loadingMore = false;
    }
  }
</script>

<section class="app-container py-5 sm:py-6">
  {#if heading}
    <header class="mb-5">
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">{heading}</h1>
    </header>
  {/if}

  {#if needsAuth}
    <div class="py-12">
      <StateFeedback
        kind="empty"
        icon="user"
        title={endpoint === 'liked' ? 'Sign in to see liked songs' : 'Sign in to see your songs'}
        message="Your created and liked tracks follow your SMOL passkey account."
        actionLabel="Sign in"
        onAction={() => openAuthSheet('signin')}
      />
    </div>
  {:else if loading}
    <Skeleton variant="card" count={12} />
  {:else if error}
    <div class="py-12">
      <StateFeedback
        kind="error"
        title="Could not load songs"
        message={error}
        actionLabel="Try again"
        onAction={() => void fetchInitialData()}
      />
    </div>
  {:else if results.length === 0}
    <div class="py-12">
      <StateFeedback
        kind="empty"
        title={emptyTitle}
        message={emptyDescription || (endpoint === 'liked' ? 'Songs you like will show up here.' : 'Create or explore songs to fill this space.')}
        actionLabel={endpoint === 'created' ? 'Create a song' : 'Browse songs'}
        actionHref={endpoint === 'created' ? '/create' : '/'}
      />
    </div>
  {:else}
    <div
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {#each results as smol (smol.Id)}
        <SmolCard
          {smol}
          onPlay={() => playSmolQueue(results, smol, { wrap: true, album: playlist ?? undefined })}
          onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
          onAddToMixtape={() => addToMixtape(smol)}
          onDragStart={(e) => handleDragStart(e, smol)}
          onDragEnd={handleDragEnd}
          isDragging={draggingId === smol.Id}
        />
      {/each}
    </div>
  {/if}

  {#if paginationError}
    <div class="mt-8 flex flex-col items-center gap-3 text-center">
      <p class="text-sm text-danger">{paginationError}</p>
      <Button variant="secondary" size="sm" onclick={loadMore}>
        Retry loading more
      </Button>
    </div>
  {/if}

  {#if (hasMore && cursor) || loadingMore}
    <div bind:this={scrollTrigger} class="flex justify-center py-8">
      {#if loadingMore}
        <Loader classNames="size-6" textColor="text-ink-2" />
      {/if}
    </div>
  {/if}
</section>
