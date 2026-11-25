<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { Smol } from '../../types/domain';
  import type { ArtistProfile, SmolListResponse } from '../../types/api';
  import SmolCard from './SmolCard.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import Loader from '../ui/Loader.svelte';
  import { playSmolQueue, setTrackLiked } from '../../stores/audio.svelte';
  import { toggleDraftTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { fetchWithTimeout, throwIfNotOk } from '../../services/api/fetch';
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
  let loadingMore = $state(false);
  let paginationError = $state<string | null>(null);
  let scrollTrigger = $state<HTMLDivElement | null>(null);
  let settledAccount = $state<string | null | undefined>(undefined);
  let likesSettledAccount = $state<string | null>(null);
  let likesError = $state(false);
  let retryingLikes = $state(false);

  let loadSeq = 0;
  let likesSeq = 0;
  let likeToggleEpoch = 0;
  const localLikeOverrides = new Map<string, { liked: boolean; epoch: number }>();
  let activeController: AbortController | null = null;
  let loadMoreController: AbortController | null = null;
  let likesController: AbortController | null = null;
  let lastEndpoint: string | undefined;
  let lastAccount: string | null | undefined;

  type LikesFetchResult = { ok: true; ids: string[] } | { ok: false };

  const isAuthOnlyEndpoint = $derived(endpoint === 'created' || endpoint === 'liked');
  const needsAuth = $derived(isAuthOnlyEndpoint && !userState.contractId);
  const awaitingAuthLoad = $derived(
    isAuthOnlyEndpoint && Boolean(userState.contractId) && settledAccount !== userState.contractId
  );
  // Gate heart toggles on non-/liked grids until a successful /likes snapshot
  // settles for the signed-in account (a failed /likes keeps unknown hearts disabled).
  const likesUnavailable = $derived(
    Boolean(userState.contractId) && endpoint !== 'liked' && likesSettledAccount !== userState.contractId
  );
  const likesBusy = $derived(likesUnavailable && (!likesError || retryingLikes));

  const feedback = $derived(
    needsAuth
      ? {
          kind: 'empty' as const,
          icon: 'user' as const,
          title: endpoint === 'liked' ? 'Sign in to see liked songs' : 'Sign in to see your songs',
          message: 'Your created and liked tracks follow your SMOL passkey account.',
          actionLabel: 'Sign in',
          onAction: (): void => {
            openAuthSheet('signin');
          },
        }
      : error
        ? {
            kind: 'error' as const,
            title: 'Could not load songs',
            message: error,
            actionLabel: 'Try again',
            onAction: (): void => {
              void fetchInitialData();
            },
          }
        : results.length === 0
          ? {
              kind: 'empty' as const,
              title: emptyTitle,
              message:
                emptyDescription ||
                (endpoint === 'liked'
                  ? 'Songs you like will show up here.'
                  : 'Create or explore songs to fill this space.'),
              actionLabel: endpoint === 'created' ? 'Create a song' : 'Browse songs',
              actionHref: endpoint === 'created' ? '/create' : '/',
            }
          : null
  );

  function fetchLikesSafely(signal: AbortSignal): Promise<LikesFetchResult> {
    return fetchLikedSmols(signal).then(
      (ids) => ({ ok: true as const, ids }),
      () => ({ ok: false as const }),
    );
  }

  function abortInFlight() {
    activeController?.abort();
    loadMoreController?.abort();
    likesController?.abort();
    activeController = loadMoreController = likesController = null;
  }

  function resetList() {
    results = [];
    cursor = null;
    hasMore = false;
    likes = [];
  }

  function applyLikesSnapshot(
    smols: Smol[],
    account: string | null,
    likesResult: LikesFetchResult,
    snapshotStartEpoch: number
  ) {
    if (endpoint === 'liked') {
      likes = [];
      results = smols.map((s) => ({ ...s, Liked: true }));
      likesSettledAccount = account;
      likesError = false;
      return;
    }
    if (!account) {
      likes = [];
      results = smols;
      likesSettledAccount = null;
      likesError = false;
      return;
    }
    if (!likesResult.ok) {
      likes = [];
      results = smols;
      likesSettledAccount = null;
      likesError = true;
      return;
    }
    const mergedSet = new Set(likesResult.ids);
    for (const [id, ov] of localLikeOverrides) {
      if (ov.epoch > snapshotStartEpoch) {
        if (ov.liked) mergedSet.add(id);
        else mergedSet.delete(id);
      }
    }
    likes = [...mergedSet];
    results = smols.map((s) => ({ ...s, Liked: mergedSet.has(s.Id) }));
    likesSettledAccount = account;
    likesError = false;
  }

  function buildSmolListUrl(cursorValue?: string | null) {
    const clean = endpoint.replace(/^\/+/, '');
    const url = new URL(
      clean ? `${import.meta.env.PUBLIC_API_URL}/${clean}` : import.meta.env.PUBLIC_API_URL,
      window.location.origin
    );
    url.searchParams.set('limit', '100');
    if (cursorValue) url.searchParams.set('cursor', cursorValue);
    return url;
  }

  function readSmolList(data: SmolListResponse | Smol[]) {
    if (Array.isArray(data)) return { smols: data, nextCursor: null, hasMore: false };
    const users = data.users?.length ? new Map<string, ArtistProfile>(data.users.map((u) => [u.Address, u])) : null;
    const raw = data.smols || [];
    const smols = users
      ? raw.map((s) => {
          if (!s.Address || s.Username) return s;
          const u = users.get(s.Address);
          return u ? { ...s, Username: u.Username } : s;
        })
      : raw;
    return {
      smols,
      nextCursor: data.pagination?.nextCursor || null,
      hasMore: data.pagination?.hasMore || false,
    };
  }

  async function fetchInitialData(
    seed: SmolListResponse | null = null,
    account: string | null = userState.contractId
  ) {
    const seq = ++loadSeq;
    ++likesSeq;
    abortInFlight();
    loadingMore = false;
    paginationError = null;
    error = null;
    likesError = false;
    retryingLikes = false;

    if (isAuthOnlyEndpoint && !account) {
      resetList();
      loading = false;
      settledAccount = null;
      likesSettledAccount = null;
      return;
    }

    const controller = new AbortController();
    activeController = controller;
    loading = true;
    if (isAuthOnlyEndpoint) resetList();

    try {
      const url = buildSmolListUrl();
      const snapshotStartEpoch = likeToggleEpoch;
      const listPromise = seed
        ? Promise.resolve(seed)
        : fetchWithTimeout(url, { credentials: 'include', signal: controller.signal }).then(async (res) => {
            await throwIfNotOk(res, url.toString());
            return res.json();
          });
      const likedPromise: Promise<LikesFetchResult> =
        endpoint !== 'liked' && account
          ? fetchLikesSafely(controller.signal)
          : Promise.resolve({ ok: true as const, ids: [] });

      const [list, likesResult] = await Promise.all([listPromise, likedPromise]);
      if (seq !== loadSeq || controller.signal.aborted) return;

      const data = readSmolList(list);
      cursor = data.nextCursor;
      hasMore = data.hasMore;
      applyLikesSnapshot(data.smols, account, likesResult, snapshotStartEpoch);
      settledAccount = account;
    } catch (err) {
      if (seq !== loadSeq || controller.signal.aborted) return;
      error = err instanceof Error ? err.message : 'Could not load songs.';
      settledAccount = account;
      logger.error('smol', 'Failed to fetch initial data:', err);
    } finally {
      if (seq === loadSeq) {
        loading = false;
        if (activeController === controller) activeController = null;
      }
    }
  }

  async function syncPublicLikes(account: string | null, isRetry = false) {
    const seq = ++likesSeq;
    const expectedLoadSeq = loadSeq;
    likesController?.abort();
    likesController = null;

    if (!account) {
      localLikeOverrides.clear();
      likes = [];
      results = results.map((s) => (s.Liked ? { ...s, Liked: false } : s));
      settledAccount = null;
      likesSettledAccount = null;
      likesError = false;
      retryingLikes = false;
      return;
    }

    const controller = new AbortController();
    likesController = controller;
    const snapshotStartEpoch = likeToggleEpoch;
    likesError = false;
    retryingLikes = isRetry;

    try {
      const likesResult = await fetchLikesSafely(controller.signal);
      if (seq !== likesSeq || expectedLoadSeq !== loadSeq || controller.signal.aborted) return;
      if (likesResult.ok) {
        applyLikesSnapshot(results, account, likesResult, snapshotStartEpoch);
        settledAccount = account;
      } else {
        likesSettledAccount = null;
        likesError = true;
      }
    } finally {
      if (seq === likesSeq) {
        retryingLikes = false;
        if (likesController === controller) likesController = null;
      }
    }
  }

  function retryLikes() {
    if (userState.contractId && !retryingLikes) void syncPublicLikes(userState.contractId, true);
  }

  onMount(() => {
    if (playlist) {
      try {
        localStorage.setItem('smol:playlist', playlist);
      } catch {
        // Ignore storage errors.
      }
    }
  });

  $effect(() => {
    const account = userState.contractId;
    const currentEndpoint = endpoint;
    const endpointChanged = currentEndpoint !== lastEndpoint;
    const accountChanged = account !== lastAccount;
    if (!endpointChanged && !accountChanged) return;

    const isFirst = lastEndpoint === undefined;
    if (accountChanged) localLikeOverrides.clear();
    lastEndpoint = currentEndpoint;
    lastAccount = account;

    untrack(() => {
      if (isFirst || endpointChanged || isAuthOnlyEndpoint || error || results.length === 0) {
        const seed = isFirst || (!endpointChanged && !isAuthOnlyEndpoint && !error) ? initialData : null;
        void fetchInitialData(seed, account);
      } else {
        void syncPublicLikes(account);
      }
    });
  });

  onDestroy(() => {
    loadSeq++;
    likesSeq++;
    abortInFlight();
  });

  $effect(() => {
    if (!scrollTrigger) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loadingMore && !loading && !paginationError) {
          void loadMore();
        }
      },
      { rootMargin: '400px', threshold: 0 }
    );
    observer.observe(scrollTrigger);
    return () => observer.disconnect();
  });

  function handleLikeChanged(smol: Smol, liked: boolean) {
    localLikeOverrides.set(smol.Id, { liked, epoch: ++likeToggleEpoch });
    const nextLikes = new Set(likes);
    if (liked) nextLikes.add(smol.Id);
    else nextLikes.delete(smol.Id);
    likes = [...nextLikes];
    setTrackLiked(smol.Id, liked);
    const found = results.find((s) => s.Id === smol.Id);
    if (found) found.Liked = liked;
  }

  async function loadMore() {
    if (loadingMore || !hasMore || !cursor || (isAuthOnlyEndpoint && !userState.contractId)) return;

    const seq = loadSeq;
    loadMoreController?.abort();
    const controller = new AbortController();
    loadMoreController = controller;
    loadingMore = true;
    paginationError = null;

    try {
      const url = buildSmolListUrl(cursor);
      const res = await fetchWithTimeout(url, { credentials: 'include', signal: controller.signal });
      await throwIfNotOk(res, url.toString());
      const data = readSmolList(await res.json());
      if (seq !== loadSeq || controller.signal.aborted) return;

      const likedSet = new Set(likes);
      results = [
        ...results,
        ...data.smols.map((s: Smol) => ({ ...s, Liked: endpoint === 'liked' ? true : likedSet.has(s.Id) })),
      ];
      cursor = data.nextCursor;
      hasMore = data.hasMore;
    } catch (err) {
      if (seq !== loadSeq || controller.signal.aborted) return;
      paginationError = err instanceof Error ? err.message : 'Could not load more songs.';
      logger.error('smol', 'Failed to load more smols:', err);
    } finally {
      if (seq === loadSeq) {
        loadingMore = false;
        if (loadMoreController === controller) loadMoreController = null;
      }
    }
  }
</script>

<section class="app-container py-5 sm:py-6">
  {#if heading}
    <header class="mb-5">
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">{heading}</h1>
    </header>
  {/if}

  {#if !needsAuth && (loading || awaitingAuthLoad)}
    <Skeleton variant="card" count={12} />
  {:else if feedback}
    <div class="py-12">
      <StateFeedback
        kind={feedback.kind}
        icon={feedback.icon}
        title={feedback.title}
        message={feedback.message}
        actionLabel={feedback.actionLabel}
        actionHref={feedback.actionHref}
        onAction={feedback.onAction}
      />
    </div>
  {:else}
    {#if (likesError || retryingLikes) && userState.contractId && endpoint !== 'liked'}
      <div
        role="status"
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-surface-2 px-3.5 py-2.5 text-sm text-ink-2 ring-1 ring-inset ring-line"
      >
        <span>Couldn’t load your likes yet. Hearts are paused until they load.</span>
        <button
          type="button"
          class="focus-ring inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-surface-2 px-3.5 text-sm font-medium text-ink-1 ring-1 ring-inset ring-line-strong hover:bg-surface-3 disabled:opacity-50"
          disabled={retryingLikes}
          aria-busy={retryingLikes || undefined}
          onclick={retryLikes}
        >
          Retry likes
        </button>
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {#each results as smol (smol.Id)}
        <SmolCard
          {smol}
          likeDisabled={likesUnavailable}
          likeBusy={likesBusy}
          onPlay={() => playSmolQueue(results, smol, { wrap: true, album: playlist ?? undefined })}
          onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
          onAddToMixtape={() => toggleDraftTrack(smol)}
        />
      {/each}
    </div>
  {/if}

  {#if paginationError}
    <div class="mt-8 flex flex-col items-center gap-3 text-center">
      <p class="text-sm text-danger">{paginationError}</p>
      <button
        type="button"
        class="focus-ring inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] bg-surface-2 px-3.5 text-sm font-medium text-ink-1 ring-1 ring-inset ring-line-strong hover:bg-surface-3"
        onclick={loadMore}
      >
        Retry loading more
      </button>
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
