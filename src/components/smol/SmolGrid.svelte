<script lang="ts">
  import { onMount } from 'svelte';
  import type { Smol } from '../../types/domain';
  import SmolCard from './SmolCard.svelte';
  import { playSmolQueue, setTrackLiked } from '../../stores/audio.svelte';
  import { mixtapeDraftState, mixtapeModeState, addTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { fetchWithTimeout, throwIfNotOk } from '../../services/api/fetch';
  import { useVisibilityTracking } from '../../hooks/useVisibilityTracking';
  import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
  import { toMixtapeTrack } from '../../utils/track';
  import { logger } from '../../utils/logger';
  import type { ArtistProfile, SmolListResponse } from '../../types/api';

  interface Props {
    playlist?: string | null;
    endpoint?: string;
    initialData?: SmolListResponse | null;
    emptyTitle?: string;
    emptyDescription?: string;
  }

  let {
    playlist = null,
    endpoint = '',
    initialData = null,
    emptyTitle = 'No smols yet',
    emptyDescription = ''
  }: Props = $props();

  let results = $state<Smol[]>([]);
  let cursor = $state<string | null>(null);
  let hasMore = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let likes = $state<string[]>([]);
  let draggingId = $state<string | null>(null);
  let visibleCards = $state<Record<string, boolean>>({});
  let loadingMore = $state(false);
  let paginationError = $state<string | null>(null);
  let scrollTrigger = $state<HTMLDivElement | null>(null);

  const visibilityHook = useVisibilityTracking();
  const scrollHook = useInfiniteScroll();

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
        hasMore: false
      };
    }

    return {
      smols: applyUsernames(data.smols || [], data.users),
      nextCursor: data.pagination?.nextCursor || null,
      hasMore: data.pagination?.hasMore || false
    };
  }

  const observeVisibility = visibilityHook.createVisibilityObserver(
    (id) => {
      visibleCards[id] = true;
    },
    (id) => {
      visibleCards[id] = false;
    }
  );

  async function fetchInitialData(seed: SmolListResponse | null = null) {
    loading = true;
    error = null;
    paginationError = null;

    try {
      const url = buildSmolListUrl();
      const listPromise = seed ?? fetchWithTimeout(url, { credentials: 'include' }).then(async (response) => {
        await throwIfNotOk(response, url.toString());
        return response.json();
      });
      const likedPromise = userState.contractId
        ? fetchLikedSmols().catch(() => [] as string[])
        : Promise.resolve([]);

      const [list, likedIds] = await Promise.all([listPromise, likedPromise]);
      const data = readSmolList(list);
      results = data.smols;
      cursor = data.nextCursor;
      hasMore = data.hasMore;

      likes = likedIds;
      if (likedIds.length > 0) {
        const likedIdSet = new Set(likedIds);
        results = results.map((smol) => ({
          ...smol,
          Liked: likedIdSet.has(smol.Id),
        }));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load';
      logger.error('smol', 'Failed to fetch initial data:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void fetchInitialData(initialData);
    if (playlist) localStorage.setItem('smol:playlist', playlist);
  });

  // Infinite scroll observer - set up when scrollTrigger is available
  $effect(() => {
    if (!scrollTrigger) return;

    const scrollObserver = scrollHook.createScrollObserver(() => {
      if (hasMore && !loadingMore && !loading) {
        loadMore();
      }
    });

    scrollObserver.observe(scrollTrigger);

    return () => {
      scrollObserver.disconnect();
    };
  });

  function addToMixtape(smol: Smol) {
    addTrack(toMixtapeTrack(smol));
  }

  function handleDragStart(event: DragEvent, smol: Smol) {
    if (!mixtapeModeState.active || smol.Public === 0) return;

    const payload = {
      type: 'smol' as const,
      track: toMixtapeTrack(smol),
    };

    draggingId = smol.Id;

    if (event.dataTransfer) {
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
    if (loadingMore || !hasMore) return;

    if (!cursor) {
      paginationError = 'More smols are unavailable right now.';
      hasMore = false;
      return;
    }

    loadingMore = true;
    paginationError = null;

    try {
      const url = buildSmolListUrl(cursor);
      const response = await fetchWithTimeout(url, {
        credentials: 'include'
      });

      await throwIfNotOk(response, url.toString());

      const data = readSmolList(await response.json());
      const likedIdSet = new Set(likes);
      const smolsWithLikes = data.smols.map((smol: Smol) => ({
        ...smol,
        Liked: likedIdSet.has(smol.Id),
      }));

      results = [...results, ...smolsWithLikes];
      cursor = data.nextCursor;
      hasMore = data.hasMore;
    } catch (err) {
      paginationError = err instanceof Error ? err.message : 'Failed to load more smols';
      hasMore = false;
      logger.error('smol', 'Failed to load more smols:', err);
    } finally {
      loadingMore = false;
    }
  }
</script>

{#if loading}
  <div class="flex justify-center items-center py-20">
    <div class="text-lime-500">Loading...</div>
  </div>
{:else if error}
  <div class="flex justify-center items-center px-2 py-20 text-center">
    <div>
      <div class="text-red-500">{error}</div>
      <button
        class="mt-4 rounded border border-lime-400 px-3 py-1 text-sm text-lime-300 hover:bg-lime-400/10"
        onclick={() => fetchInitialData()}
      >
        Retry
      </button>
    </div>
  </div>
{:else if results.length === 0}
  <div class="flex justify-center px-2 py-20 text-center">
    <div>
      <h2 class="text-lg font-semibold text-white">{emptyTitle}</h2>
      {#if emptyDescription}
        <p class="mt-2 text-sm text-slate-400">{emptyDescription}</p>
      {/if}
    </div>
  </div>
{:else}
  <div
    class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2 pb-10"
  >
    {#each results as smol (smol.Id)}
      <div use:observeVisibility={smol.Id}>
        <SmolCard
          {smol}
          onPlay={() => playSmolQueue(results, smol, { wrap: true, album: playlist ?? undefined })}
          isVisible={!!visibleCards[smol.Id]}
          onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
          onAddToMixtape={() => addToMixtape(smol)}
          onDragStart={(e) => handleDragStart(e, smol)}
          onDragEnd={handleDragEnd}
          isDragging={draggingId === smol.Id}
        />
      </div>
    {/each}
  </div>
{/if}

{#if paginationError}
  <div class="flex justify-center px-2 pb-20 text-center text-sm text-red-400">
    {paginationError}
  </div>
{/if}

{#if (hasMore && cursor) || loadingMore}
  <div bind:this={scrollTrigger} class="flex justify-center mb-20 py-8">
    {#if loadingMore}
      <div class="text-lime-500">Loading...</div>
    {/if}
  </div>
{/if}
