<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import type { MusicProvider, SmolDetailResponse } from '../types/domain';
  import SmolGenerator from './smol/SmolGenerator.svelte';
  import SmolDisplay from './smol/SmolDisplay.svelte';
  import SmolTradeSection from './smol/SmolTradeSection.svelte';
  import SimilarSmols from './search/SimilarSmols.svelte';
  import StateFeedback from './ui/StateFeedback.svelte';
  import { captureSessionTicket, getSessionGeneration, userState } from '../stores/user.svelte';
  import { updateContractBalance } from '../stores/balance.svelte';
  import { toast } from '../stores/toast.svelte';
  import { confirmAction } from '../stores/confirm.svelte';
  import { openAuthSheet } from '../stores/authSheet.svelte';
  import { pauseBackgroundGenerationPolling, stopTrackingGeneration } from '../stores/generations.svelte';
  import { applyQuotaExceeded, decrementQuota, refreshQuota } from '../stores/quota.svelte';
  import { useSmolGeneration } from '../hooks/useSmolGeneration';
  import { useSmolMinting } from '../hooks/useSmolMinting';
  import { fetchWithTimeout, throwIfNotOk } from '../services/api/fetch';
  import { QuotaExceededError } from '../utils/quota';
  import {
    DEFAULT_PROVIDER,
    expectedTakeCount,
    normalizeProvider,
    providerOf,
    readStoredProvider,
    requestedProviderOf,
  } from '../utils/takes';
  import { logger } from '../utils/logger';

  interface Props {
    id?: string | null;
    initialData?: SmolDetailResponse | null;
  }

  type WorkflowStatus = NonNullable<SmolDetailResponse['wf']>['status'];

  let { id = $bindable(), initialData = null }: Props = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);
  let errorStatus = $state<number | null>(null);
  let d1 = $state<SmolDetailResponse['d1']>(undefined);
  let kv_do = $state<SmolDetailResponse['kv_do']>(undefined);
  let liked = $state<boolean | undefined>(undefined);
  let prompt = $state('');
  let is_public = $state(true);
  let is_instrumental = $state(false);
  let provider = $state<MusicProvider>(DEFAULT_PROVIDER);
  let best_song = $state<string | undefined>(undefined);
  let savingBest = $state(false);
  let interval = $state<ReturnType<typeof setTimeout> | null>(null);
  let generationPoll: AbortController | null = null;
  let resumeBackgroundPolling: (() => void) | undefined;
  let submittingGeneration = $state(false);
  let failed = $state(false);
  let quotaError = $state<string | null>(null);
  let retryError = $state<string | null>(null);
  let pendingCreatedId = $state<string | null>(null);
  let playlist = $state<string | null>(null);
  let minting = $state(false);
  let mintError = $state<string | null>(null);
  let mintConfirmedId = $state<string | null>(null);
  let mintRequest: AbortController | null = null;
  let showTradeModal = $state(false);
  let tradeMintBalance = $state<bigint>(0n);

  const generationHook = useSmolGeneration();
  const mintingHook = useSmolMinting();

  const detail = $derived<SmolDetailResponse>({ d1, kv_do, liked });
  const activeProvider = $derived(providerOf(detail));
  const requestedProvider = $derived(requestedProviderOf(detail));
  // Canonical market verified on chain (deep-link check or the trade sheet). An
  // unindexed on-chain mint is still minted: never offer a second Mint for it.
  let verifiedMarket = $state<{ songId: string; sac: string; pool: string } | null>(null);
  const chainVerified = $derived(Boolean(verifiedMarket && verifiedMarket.songId === id));
  const minted = $derived(Boolean(d1?.Mint_Token || d1?.Mint_Amm || chainVerified || (id && mintConfirmedId === id)));
  const tradeReady = $derived(Boolean(id && ((d1?.Mint_Amm && d1?.Mint_Token) || chainVerified)));
  const ownerAddress = $derived(d1?.Address ?? kv_do?.payload?.address ?? null);
  const isOwner = $derived(
    Boolean(ownerAddress && userState.contractId && ownerAddress === userState.contractId)
  );
  const tradeSongId = $derived(id ?? d1?.Id ?? null);
  const tradeTitle = $derived(
    kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null
  );
  const tradeImageUrl = $derived(
    tradeSongId ? `${import.meta.env.PUBLIC_API_URL}/image/${tradeSongId}.png` : null
  );
  const expectedTakes = $derived(expectedTakeCount(activeProvider));
  const hasSongSnapshots = $derived(Boolean(kv_do?.songs?.length));
  const hasAllExpectedSongs = $derived(
    Boolean(kv_do?.songs && kv_do.songs.length >= expectedTakes)
  );
  const hasIncompleteSongs = $derived(
    Boolean(
      !hasAllExpectedSongs ||
        kv_do?.songs?.some((song) => !song.music_id || song.status < 4)
    )
  );
  const showGenerationLoader = $derived(
    Boolean(interval && !d1?.Id && (!hasSongSnapshots || hasIncompleteSongs))
  );

  // F3: /create swaps to the new song in place (no navigation): keep the tab title current.
  $effect(() => {
    if (!id || (!d1 && !kv_do)) return; // nothing loaded yet: keep the SSR title
    const songTitle = kv_do?.lyrics?.title || d1?.Title || (failed ? 'Song' : 'Creating your song…');
    document.title = `${songTitle} · SMOL`;
  });

  $effect(() => {
    if (!tradeReady && showTradeModal) {
      showTradeModal = false;
    }
  });

  // `/{id}?trade=1` (mixtape holdings → Trade) opens the trade sheet. The sheet
  // itself resolves and verifies the canonical market before showing anything;
  // a song minted on chain but not yet indexed in D1 is found here first.
  let tradeDeepLinkHandled = false;
  $effect(() => {
    if (tradeDeepLinkHandled || typeof window === 'undefined' || !id || !d1) return;
    tradeDeepLinkHandled = true;
    if (new URLSearchParams(window.location.search).get('trade') !== '1') return;
    if (d1.Mint_Amm && d1.Mint_Token) {
      showTradeModal = true;
      return;
    }
    const songId = id;
    void import('../utils/smolChainIdentity')
      .then(({ readMixtapeChainSnapshot }) => readMixtapeChainSnapshot({ tracks: [{ id: songId }] }))
      .then((snapshot) => {
        if (songId !== id) return;
        const facts = snapshot.tracks.get(songId)?.facts;
        if (facts?.status === 'minted') {
          verifiedMarket = { songId, sac: facts.sac, pool: facts.pool };
          showTradeModal = true;
        }
      })
      .catch(() => {
        /* stays untradeable; the page still plays */
      });
  });

  $effect(() => {
    if (d1?.Song_1 && !best_song) {
      best_song = d1.Song_1;
    }
  });

  let lastFetchedId = $state<string | null>(null);

  function isTransientCreatedSmol404(smolId: string, status?: number) {
    return status === 404 && pendingCreatedId === smolId;
  }

  function isActiveWorkflow(status?: WorkflowStatus) {
    switch (status) {
      case 'queued':
      case 'running':
      case 'paused':
      case 'waiting':
      case 'waitingForPause':
        return true;
      default:
        return false;
    }
  }

  function hydrateGenerationState(response: SmolDetailResponse | null | undefined) {
    const status = response?.wf?.status;
    const songs = response?.kv_do?.songs ?? [];
    const expected = expectedTakeCount(providerOf(response));
    const songsArePlaybackReady =
      songs.length >= expected && songs.every((song) => song.music_id && song.status >= 4);

    if (isActiveWorkflow(status) && !songsArePlaybackReady) {
      failed = false;
      if (!interval) {
        startPolling();
      }
      return;
    }

    const published = Boolean(response?.d1?.Id) && !response?.wf;

    if (songsArePlaybackReady || published || generationHook.shouldStopPolling(status)) {
      if (id) stopTrackingGeneration(id);
      stopPolling();
      failed = generationHook.isFailed(status);
    }
  }

  function applySmolData(response: SmolDetailResponse) {
    d1 = response.d1;
    kv_do = response.kv_do;
    liked = response.liked;
    best_song = d1?.Song_1;
    pendingCreatedId = null;
    hydrateGenerationState(response);
  }

  async function fetchSmolData(smolId: string) {
    loading = true;
    error = null;
    errorStatus = null;

    try {
      const response = await fetchWithTimeout(`${import.meta.env.PUBLIC_API_URL}/${smolId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (isTransientCreatedSmol404(smolId, response.status)) {
          return;
        }
        errorStatus = response.status;
        if (response.status === 404) {
          throw new Error('This song could not be found.');
        }
        throw new Error('Could not load this song.');
      }

      applySmolData(await response.json());
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load this song.';
      logger.error('smol', 'Failed to fetch smol data:', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (id && id !== lastFetchedId) {
      const smolId = id;
      const seed = lastFetchedId === null ? initialData : null;
      lastFetchedId = smolId;
      mintRequest?.abort();
      minting = false;
      mintError = null;
      retryError = null;
      untrack(() => {
        stopPolling();
        if (seed) applySmolData(seed);
        else void fetchSmolData(smolId);
      });
    }
  });

  onMount(() => {
    provider = readStoredProvider();
    const urlParams = new URLSearchParams(window.location.search);
    try {
      playlist = urlParams.get('playlist') || localStorage.getItem('smol:playlist');
      if (playlist) {
        localStorage.setItem('smol:playlist', playlist);
      }

      const remixRaw = sessionStorage.getItem('smol:remixDraft');
      // Astro dev pre-hydrates the next page in a hidden same-origin iframe:
      // only the visible page may consume the one-shot draft.
      if (remixRaw && !id && !window.frameElement) {
        sessionStorage.removeItem('smol:remixDraft');
        const draft = JSON.parse(remixRaw) as {
          prompt?: string;
          instrumental?: boolean;
          public?: boolean;
          provider?: MusicProvider;
        };
        if (typeof draft.prompt === 'string') prompt = draft.prompt;
        if (typeof draft.instrumental === 'boolean') is_instrumental = draft.instrumental;
        if (typeof draft.public === 'boolean') is_public = draft.public;
        const parsedProvider = normalizeProvider(draft.provider);
        if (parsedProvider) provider = parsedProvider;
      }
    } catch {
      // Ignore storage errors.
    }
  });

  function scheduleNextPoll(signal: AbortSignal, delay: number) {
    interval = setTimeout(async () => {
      try {
        await getGen(signal);
      } catch (err) {
        if (!signal.aborted) logger.error('smol', 'Poll failed:', err);
      }
      if (signal.aborted) return;
      scheduleNextPoll(signal, Math.min(15_000, Math.max(3_000, delay * 1.5)));
    }, delay);
  }

  function startPolling(delay = 3_000) {
    if (generationPoll || !id) return;
    generationPoll = new AbortController();
    resumeBackgroundPolling = pauseBackgroundGenerationPolling(id);
    scheduleNextPoll(generationPoll.signal, delay);
  }

  function stopPolling() {
    generationPoll?.abort();
    generationPoll = null;
    if (interval) clearTimeout(interval);
    interval = null;
    resumeBackgroundPolling?.();
    resumeBackgroundPolling = undefined;
  }

  onDestroy(() => {
    stopPolling();
    mintRequest?.abort();
  });

  function removePlaylist() {
    const url = new URL(window.location.href);
    url.searchParams.delete('playlist');
    history.replaceState({}, '', url.toString());
    try {
      localStorage.removeItem('smol:playlist');
    } catch {
      // Ignore.
    }
    playlist = null;
    toast.info('Removed playlist tag.');
  }

  async function makeSongPublic() {
    if (!id) return;
    const prev = d1?.Public;
    if (d1) d1.Public = prev === 1 ? 0 : 1;
    try {
      const response = await fetchWithTimeout(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
        method: 'PUT',
        credentials: 'include',
      });
      await throwIfNotOk(response, `PUT /${id}`);
      toast.success(d1?.Public === 1 ? 'Song published to feed.' : 'Song set to private.');
    } catch (err) {
      if (d1) d1.Public = prev;
      toast.error(err instanceof Error ? err.message : 'Could not update song visibility.');
    }
  }

  async function deleteSong() {
    if (!id) return;
    const songTitle = tradeTitle || 'this song';
    const confirmed = await confirmAction({
      title: `Delete "${songTitle}"?`,
      message: 'This removes the song from SMOL and cannot be undone.',
      confirmLabel: 'Delete song',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      const response = await fetchWithTimeout(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await throwIfNotOk(response, `DELETE /${id}`);
      toast.success(`Deleted "${songTitle}".`);
      await navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete song.');
    }
  }

  async function selectBestSong(song_id: string) {
    if (!id || (kv_do?.songs?.length ?? 0) <= 1 || savingBest) return;
    const previous = best_song;
    best_song = song_id;
    savingBest = true;

    try {
      const response = await fetchWithTimeout(
        `${import.meta.env.PUBLIC_API_URL}/${id}/${encodeURIComponent(song_id)}`,
        {
          method: 'PUT',
          credentials: 'include',
        }
      );
      await throwIfNotOk(response, `PUT /${id}/${song_id}`);
      // The API swaps the takes: the chosen one becomes Song_1, the old main Song_2.
      if (d1) [d1.Song_1, d1.Song_2] = [song_id, d1.Song_1];
      toast.success('Updated main take.');
    } catch (err) {
      best_song = previous;
      toast.error(err instanceof Error ? err.message : 'Could not update main take.');
    } finally {
      savingBest = false;
    }
  }

  async function postGen() {
    if (!prompt.trim() || submittingGeneration) return;

    id = null;
    d1 = undefined;
    kv_do = undefined;
    failed = false;
    error = null;
    quotaError = null;
    submittingGeneration = true;

    stopPolling();

    try {
      const submittedProvider = provider;
      const newId = await generationHook.postGen(
        prompt,
        is_public,
        is_instrumental,
        playlist,
        submittedProvider
      );
      if (!newId) return;

      decrementQuota(submittedProvider);
      void refreshQuota(userState.contractId);

      pendingCreatedId = newId;
      // AE-2: show what was submitted (e.g. Private) until the first GET lands.
      kv_do = { payload: { prompt, public: is_public, instrumental: is_instrumental, provider: submittedProvider } };
      // Set lastFetchedId before setting id so the route $effect does not fire a second GET.
      lastFetchedId = newId;
      id = newId;
      prompt = '';

      startPolling(0);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        applyQuotaExceeded(err, userState.contractId);
        quotaError = err.message;
        toast.error(err.message);
      } else if (!id || !isTransientCreatedSmol404(id, (err as Error & { status?: number }).status)) {
        const msg = err instanceof Error ? err.message : 'Could not start song generation.';
        toast.error(msg);
        logger.error('smol', 'Failed to generate smol:', err);
      }
    } finally {
      submittingGeneration = false;
    }
  }

  async function retryGen(overrideProvider?: MusicProvider) {
    if (!id) return;
    const currentId = id;
    retryError = null;
    stopPolling();

    try {
      const targetProvider = overrideProvider ?? activeProvider;
      const newId = await generationHook.retryGen(currentId, overrideProvider);
      if (!newId) return;

      decrementQuota(targetProvider);
      void refreshQuota(userState.contractId);

      d1 = undefined;
      kv_do = kv_do?.payload && { payload: { ...kv_do.payload, provider: targetProvider } };
      pendingCreatedId = newId;
      lastFetchedId = newId;
      id = newId;
      failed = false;
      startPolling(0);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        applyQuotaExceeded(err, userState.contractId);
        retryError = err.message;
        toast.error(err.message);
      } else {
        const msg = err instanceof Error ? err.message : 'Could not retry generation.';
        retryError = msg;
        toast.error(msg);
      }
    }
  }

  function handleEditPrompt() {
    const promptText = kv_do?.payload?.prompt ?? '';
    try {
      sessionStorage.setItem(
        'smol:remixDraft',
        JSON.stringify({
          prompt: promptText,
          instrumental: Boolean(kv_do?.payload?.instrumental || d1?.Instrumental),
          public: d1 ? d1.Public !== 0 : kv_do?.payload?.public !== false,
          provider: requestedProvider,
        })
      );
    } catch {
      // Ignore storage errors.
    }
    void navigate('/create');
  }

  async function triggerMint() {
    if (!id || minting || minted) return;

    // The session this mint is for (captured at click): the mint is built for,
    // signed by and submitted from exactly this wallet, or aborted.
    const session = captureSessionTicket();
    if (!session) {
      openAuthSheet('signin', 'Sign in to mint this song as a collectible.');
      return;
    }

    const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
    if (!smolContractId) {
      logger.error('smol', 'Missing PUBLIC_SMOL_CONTRACT_ID env var');
      toast.error('Minting is temporarily unavailable. Try again later.');
      return;
    }

    // Canonical preflight (C-15): never mint a song that already exists on chain
    // (D1 may not have indexed it yet). An inconclusive check blocks minting.
    const songId = id;
    const request = new AbortController();
    mintRequest = request;
    minting = true;
    mintError = null;

    try {
      const { readMixtapeChainSnapshot } = await import('../utils/smolChainIdentity');
      const snapshot = await readMixtapeChainSnapshot({
        tracks: [{ id: songId, mintToken: d1?.Mint_Token ?? null, mintAmm: d1?.Mint_Amm ?? null }],
      });
      if (request.signal.aborted || songId !== id) return;
      const facts = snapshot.tracks.get(songId)?.facts;
      if (facts?.status === 'minted') {
        verifiedMarket = { songId, sac: facts.sac, pool: facts.pool };
        toast.info('This song is already minted. Opening its market.');
        showTradeModal = true;
        return;
      }
      if (facts?.status !== 'unminted') {
        mintError = "Couldn't confirm this song's mint status, so nothing was minted. Try again in a moment.";
        return;
      }

      await mintingHook.triggerMint(
        {
          id: songId,
          session,
          smolContractId,
          rpcUrl: import.meta.env.PUBLIC_RPC_URL as string,
          networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE as string,
          creatorAddress: d1?.Address || '',
          kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID as string,
        },
        request.signal,
        () => toast.success('Mint submitted. Waiting for confirmation.')
      );
      if (request.signal.aborted || songId !== id) return;

      mintConfirmedId = songId;
      if (session.generation === getSessionGeneration()) {
        void updateContractBalance(session.contractId, { force: true });
      }

      // Settlement can precede indexing. Verify the market directly if the
      // one metadata refresh hasn't picked up the mint yet.
      try {
        await getGen(request.signal);
      } catch (err) {
        if (!request.signal.aborted) logger.warn('smol', 'Could not refresh mint metadata', err);
      }
      if (request.signal.aborted || songId !== id || tradeReady) return;
      const settled = await readMixtapeChainSnapshot({ tracks: [{ id: songId }] });
      const market = settled.tracks.get(songId)?.facts;
      if (!request.signal.aborted && songId === id && market?.status === 'minted') {
        verifiedMarket = { songId, sac: market.sac, pool: market.pool };
      }
    } catch (err) {
      if (request.signal.aborted || songId !== id) return;
      logger.error('smol', err);
      if (!minted) mintError = err instanceof Error ? err.message : 'Minting failed.';
    } finally {
      if (mintRequest === request) {
        mintRequest = null;
        minting = false;
      }
    }
  }

  async function getGen(signal: AbortSignal) {
    const songId = id;
    if (!songId) return;

    let res: SmolDetailResponse;
    try {
      res = await generationHook.getGen(songId, signal);
    } catch (err) {
      if (isTransientCreatedSmol404(songId, (err as Error & { status?: number }).status)) {
        return;
      }
      throw err;
    }

    if (id !== songId || signal.aborted) return;
    applySmolData(res);
    return res;
  }

  function openTradeModal() {
    if (!tradeReady) return;
    showTradeModal = true;
  }
</script>

{#if loading}
  <div class="app-container py-8">
    <div class="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10" aria-hidden="true">
      <div class="space-y-4">
        <div class="mx-auto aspect-square w-full max-w-[min(240px,30dvh)] animate-pulse rounded-[var(--radius-media)] bg-surface-1 lg:mx-0 lg:max-w-none"></div>
        <div class="hidden h-44 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1 lg:block"></div>
      </div>
      <div class="space-y-4">
        <div class="h-9 w-2/3 animate-pulse rounded bg-surface-1"></div>
        <div class="h-4 w-1/3 animate-pulse rounded bg-surface-1"></div>
        <div class="flex gap-2">
          <div class="h-11 w-32 animate-pulse rounded-full bg-surface-1"></div>
          <div class="h-11 w-24 animate-pulse rounded-full bg-surface-1"></div>
          <div class="size-11 animate-pulse rounded-full bg-surface-1"></div>
        </div>
        <div class="h-20 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1"></div>
        <div class="h-24 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1"></div>
        <div class="h-36 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1"></div>
      </div>
    </div>
  </div>
{:else if error}
  <div class="app-container py-16">
    <StateFeedback
      kind="error"
      title={errorStatus === 404 ? 'Song not found' : 'Could not load song'}
      message={error}
      actionLabel={errorStatus === 404 || !id ? 'Browse songs' : 'Try again'}
      actionHref={errorStatus === 404 || !id ? '/' : undefined}
      onAction={errorStatus === 404 || !id ? undefined : () => void fetchSmolData(id!)}
    />
  </div>
{:else if !id}
  <SmolGenerator
    bind:prompt
    bind:isPublic={is_public}
    bind:isInstrumental={is_instrumental}
    bind:provider
    {playlist}
    isGenerating={submittingGeneration}
    isAuthenticated={Boolean(userState.contractId)}
    {quotaError}
    onSubmit={postGen}
    onRemovePlaylist={removePlaylist}
    onClearQuotaError={() => (quotaError = null)}
  />
{:else}
  <SmolDisplay
    {id}
    {d1}
    {kv_do}
    {liked}
    bind:bestSong={best_song}
    {showGenerationLoader}
    {failed}
    isPolling={Boolean(interval)}
    {playlist}
    {retryError}
    {minting}
    {mintError}
    {minted}
    {tradeReady}
    {tradeMintBalance}
    {isOwner}
    {savingBest}
    onMakeSongPublic={makeSongPublic}
    onDeleteSong={deleteSong}
    onSelectBestSong={selectBestSong}
    onTriggerMint={triggerMint}
    onOpenTradeModal={openTradeModal}
    onLikeChanged={(likedValue) => (liked = likedValue)}
    onRetry={retryGen}
    onEditPrompt={handleEditPrompt}
    onRemovePlaylist={removePlaylist}
  />

  {#if d1?.Public === 1 && kv_do?.nsfw?.safe !== false}
    <SimilarSmols {id} />
  {/if}
{/if}

{#if tradeReady && tradeSongId}
  <!-- ammId / mintTokenId are D1 hints; the sheet trades only the verified canonical pair. -->
  <SmolTradeSection
    bind:show={showTradeModal}
    songId={tradeSongId}
    ammId={d1?.Mint_Amm ?? ''}
    mintTokenId={d1?.Mint_Token ?? ''}
    onVerified={(market) => {
      if (tradeSongId) verifiedMarket = { songId: tradeSongId, ...market };
    }}
    title={tradeTitle}
    imageUrl={tradeImageUrl}
    bind:mintBalance={tradeMintBalance}
    onClose={() => (showTradeModal = false)}
  />
{/if}
