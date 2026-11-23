<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import type { MusicProvider, SmolDetailResponse } from '../types/domain';
  import SmolGenerator from './smol/SmolGenerator.svelte';
  import SmolDisplay from './smol/SmolDisplay.svelte';
  import GenerationFailure from './create/GenerationFailure.svelte';
  import SmolTradeSection from './smol/SmolTradeSection.svelte';
  import SimilarSmols from './search/SimilarSmols.svelte';
  import Skeleton from './ui/Skeleton.svelte';
  import StateFeedback from './ui/StateFeedback.svelte';
  import { userState } from '../stores/user.svelte';
  import { updateContractBalance } from '../stores/balance.svelte';
  import { toast } from '../stores/toast.svelte';
  import { confirmAction } from '../stores/confirm.svelte';
  import { openAuthSheet } from '../stores/authSheet.svelte';
  import { trackGeneration, stopTrackingGeneration } from '../stores/generations.svelte';
  import { useSmolGeneration } from '../hooks/useSmolGeneration';
  import { useSmolMinting } from '../hooks/useSmolMinting';
  import { fetchWithTimeout, throwIfNotOk } from '../services/api/fetch';
  import {
    DEFAULT_PROVIDER,
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
  let pollDelay = $state(3000);
  let pollGeneration = 0;
  let submittingGeneration = $state(false);
  let failed = $state(false);
  let pendingCreatedId = $state<string | null>(null);
  let playlist = $state<string | null>(null);
  let minting = $state(false);
  let showTradeModal = $state(false);
  let tradeMintBalance = $state<bigint>(0n);

  const generationHook = useSmolGeneration();
  const mintingHook = useSmolMinting();

  const detail = $derived<SmolDetailResponse>({ d1, kv_do, liked });
  const activeProvider = $derived(providerOf(detail));
  const requestedProvider = $derived(requestedProviderOf(detail));
  const minted = $derived(Boolean(d1?.Mint_Token || d1?.Mint_Amm));
  const tradeReady = $derived(Boolean(id && d1?.Mint_Amm && d1?.Mint_Token));
  const isOwner = $derived(Boolean(d1?.Address && d1.Address === userState.contractId));
  const tradeSongId = $derived(id ?? d1?.Id ?? null);
  const tradeTitle = $derived(
    kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null
  );
  const tradeImageUrl = $derived(
    tradeSongId ? `${import.meta.env.PUBLIC_API_URL}/image/${tradeSongId}.png` : null
  );
  const hasSongSnapshots = $derived(Boolean(kv_do?.songs?.length));
  const hasIncompleteSongs = $derived(
    Boolean(kv_do?.songs?.some((song) => !song.music_id || song.status < 4))
  );
  const showGenerationLoader = $derived(
    Boolean(interval && (!hasSongSnapshots || hasIncompleteSongs))
  );

  $effect(() => {
    if (!tradeReady && showTradeModal) {
      showTradeModal = false;
    }
  });

  $effect(() => {
    if (d1?.Song_1 && !best_song) {
      best_song = d1.Song_1;
    }
  });

  let wasMinted = $state(false);
  $effect(() => {
    if (minted && !wasMinted) {
      minting = false;
      mintingHook.clearMintPolling();
      if (userState.contractId) {
        void updateContractBalance(userState.contractId);
      }
    }
    wasMinted = minted;
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
    const songsArePlaybackReady =
      songs.length > 0 && songs.every((song) => song.music_id && song.status >= 4);

    if (isActiveWorkflow(status) && !songsArePlaybackReady) {
      failed = false;
      if (!interval) {
        startPolling();
      }
      if (id) trackGeneration(id);
      return;
    }

    if (songsArePlaybackReady || generationHook.shouldStopPolling(status)) {
      stopPolling();
      if (id) stopTrackingGeneration(id);
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

    try {
      const response = await fetchWithTimeout(`${import.meta.env.PUBLIC_API_URL}/${smolId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (isTransientCreatedSmol404(smolId, response.status)) {
          return;
        }
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
      untrack(() => {
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
      if (remixRaw && !id) {
        sessionStorage.removeItem('smol:remixDraft');
        const draft = JSON.parse(remixRaw) as {
          prompt?: string;
          instrumental?: boolean;
          provider?: MusicProvider;
        };
        if (typeof draft.prompt === 'string') prompt = draft.prompt;
        if (typeof draft.instrumental === 'boolean') is_instrumental = draft.instrumental;
        const parsedProvider = normalizeProvider(draft.provider);
        if (parsedProvider) provider = parsedProvider;
      }
    } catch {
      // Ignore storage errors.
    }
  });

  function scheduleNextPoll() {
    const gen = pollGeneration;
    interval = setTimeout(async () => {
      try {
        await getGen();
      } catch (err) {
        logger.error('smol', 'Poll failed:', err);
      }
      if (gen !== pollGeneration) return;
      if (interval !== null) {
        pollDelay = Math.min(pollDelay * 1.5, 15000);
        scheduleNextPoll();
      }
    }, pollDelay);
  }

  function startPolling() {
    if (interval) return;
    pollGeneration++;
    pollDelay = 3000;
    scheduleNextPoll();
  }

  function stopPolling() {
    if (interval) {
      clearTimeout(interval);
      interval = null;
    }
  }

  onDestroy(() => {
    stopPolling();
    mintingHook.clearMintPolling();
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
      if (d1) d1.Song_1 = song_id;
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
    submittingGeneration = true;

    stopPolling();

    try {
      const newId = await generationHook.postGen(
        prompt,
        is_public,
        is_instrumental,
        playlist,
        provider
      );
      if (!newId) return;

      pendingCreatedId = newId;
      // Set lastFetchedId before setting id so the route $effect does not fire a second GET.
      lastFetchedId = newId;
      id = newId;
      prompt = '';

      startPolling();
      trackGeneration(newId);
      await getGen();
    } catch (err) {
      if (!id || !isTransientCreatedSmol404(id, (err as Error & { status?: number }).status)) {
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
    stopPolling();

    try {
      const newId = await generationHook.retryGen(currentId, overrideProvider);
      if (!newId) return;

      d1 = undefined;
      kv_do = undefined;
      pendingCreatedId = newId;
      lastFetchedId = newId;
      id = newId;
      failed = false;
      startPolling();
      trackGeneration(newId);

      try {
        await getGen();
      } catch (err) {
        if (!isTransientCreatedSmol404(newId, (err as Error & { status?: number }).status)) {
          throw err;
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not retry generation.');
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

    if (!userState.contractId || !userState.keyId) {
      openAuthSheet('signin', 'Sign in to mint this song as a collectible.');
      return;
    }

    const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
    if (!smolContractId) {
      logger.error('smol', 'Missing PUBLIC_SMOL_CONTRACT_ID env var');
      toast.error('Minting is temporarily unavailable. Try again later.');
      return;
    }

    try {
      minting = true;

      await mintingHook.triggerMint(
        {
          id,
          contractId: userState.contractId,
          keyId: userState.keyId,
          smolContractId,
          rpcUrl: import.meta.env.PUBLIC_RPC_URL as string,
          networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE as string,
          creatorAddress: d1?.Address || '',
          kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID as string,
        },
        async () => {
          await getGen();
        }
      );
      toast.success('Mint submitted. Waiting for confirmation.');
    } catch (err) {
      logger.error('smol', err);
      toast.error(err instanceof Error ? err.message : 'Minting failed.');
      mintingHook.clearMintPolling();
      minting = false;
    }
  }

  async function getGen() {
    if (!id) return;

    let res: SmolDetailResponse;
    try {
      res = await generationHook.getGen(id);
    } catch (err) {
      if (isTransientCreatedSmol404(id, (err as Error & { status?: number }).status)) {
        return;
      }
      throw err;
    }

    applySmolData(res);
    return res;
  }

  function openTradeModal() {
    if (!tradeReady) return;
    showTradeModal = true;
  }

  function handleTradeComplete() {
    void getGen();
  }
</script>

{#if loading}
  <div class="app-container py-8">
    <Skeleton variant="hero" />
  </div>
{:else if error}
  <div class="app-container py-16">
    <StateFeedback
      kind="error"
      title="Could not load song"
      message={error}
      actionLabel={id ? 'Try again' : 'Browse songs'}
      actionHref={id ? undefined : '/'}
      onAction={id ? () => void fetchSmolData(id!) : undefined}
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
    onSubmit={postGen}
    onRemovePlaylist={removePlaylist}
  />
{:else}
  {#if failed}
    <div class="app-container pt-6">
      <GenerationFailure
        isPolling={Boolean(interval)}
        failure={kv_do?.failure}
        provider={activeProvider}
        {playlist}
        onRetry={retryGen}
        onEditPrompt={handleEditPrompt}
        onRemovePlaylist={removePlaylist}
      />
    </div>
  {/if}

  <SmolDisplay
    {id}
    {d1}
    {kv_do}
    {liked}
    bind:bestSong={best_song}
    {showGenerationLoader}
    {minting}
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
  />

  {#if d1?.Public === 1}
    <SimilarSmols {id} />
  {/if}
{/if}

{#if tradeReady && d1?.Mint_Amm && d1?.Mint_Token && tradeSongId}
  <SmolTradeSection
    bind:show={showTradeModal}
    songId={tradeSongId}
    ammId={d1.Mint_Amm}
    mintTokenId={d1.Mint_Token}
    title={tradeTitle}
    imageUrl={tradeImageUrl}
    bind:mintBalance={tradeMintBalance}
    onClose={() => (showTradeModal = false)}
    onComplete={handleTradeComplete}
  />
{/if}
