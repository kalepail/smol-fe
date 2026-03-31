<script lang="ts">
  import type { SmolDetailResponse } from '../types/domain';
  import { onMount, onDestroy } from 'svelte';
  import SmolGenerator from './smol/SmolGenerator.svelte';
  import SmolDisplay from './smol/SmolDisplay.svelte';
  import SmolRetryPanel from './smol/SmolRetryPanel.svelte';
  import SmolTradeSection from './smol/SmolTradeSection.svelte';
  import SimilarSmols from './search/SimilarSmols.svelte';
  import { userState } from '../stores/user.svelte';
  import { updateContractBalance } from '../stores/balance.svelte';
  import { useSmolGeneration } from '../hooks/useSmolGeneration';
  import { useSmolMinting } from '../hooks/useSmolMinting';
  import { audioState } from '../stores/audio.svelte';
  import { logger } from '../utils/logger';

  interface Props {
    id?: string | null;
  }

  let { id = $bindable() }: Props = $props();

  // State
  let data = $state<SmolDetailResponse | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let d1 = $state<SmolDetailResponse['d1']>(undefined);
  let kv_do = $state<SmolDetailResponse['kv_do']>(undefined);
  let liked = $state<boolean | undefined>(undefined);
  let prompt = $state('');
  let is_public = $state(true);
  let is_instrumental = $state(false);
  let best_song = $state<string | undefined>(undefined);
  let audioElements = $state<HTMLAudioElement[]>([]);
  let interval = $state<ReturnType<typeof setTimeout> | null>(null);
  let pollDelay = $state(3000); // start at 3s, grows 1.5x, caps at 15s
  let pollGeneration = 0; // nonce to prevent stale poll callbacks
  let failed = $state(false);
  let playlist = $state<string | null>(null);
  let minting = $state(false);
  let showTradeModal = $state(false);
  let tradeMintBalance = $state<bigint>(0n);

  // Hooks
  const generationHook = useSmolGeneration();
  const mintingHook = useSmolMinting();

  // Derived
  const minted = $derived(Boolean(d1?.Mint_Token || d1?.Mint_Amm));
  const tradeReady = $derived(Boolean(id && d1?.Mint_Amm && d1?.Mint_Token));
  const isOwner = $derived(d1?.Address === userState.contractId);
  const maxLength = $derived(is_instrumental ? 380 : 2280);
  const tradeSongId = $derived(id ?? d1?.Id ?? null);
  const tradeTitle = $derived(
    kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null
  );
  const tradeImageUrl = $derived(
    tradeSongId
      ? `${import.meta.env.PUBLIC_API_URL}/image/${tradeSongId}.png`
      : null
  );

  // Effects
  $effect(() => {
    if (!tradeReady && showTradeModal) {
      showTradeModal = false;
    }
  });

  // Initialize best_song from d1?.Song_1, but preserve manual overrides
  $effect(() => {
    if (d1?.Song_1 && !best_song) {
      best_song = d1.Song_1;
    }
  });

  // Track previous minted state to only update balance when mint completes
  let wasMinted = $state(false);
  $effect(() => {
    // Only update balance when transitioning from unminted -> minted
    if (minted && !wasMinted) {
      minting = false;
      mintingHook.clearMintPolling();
      if (userState.contractId) {
        updateContractBalance(userState.contractId);
      }
    }
    wasMinted = minted;
  });

  // Track last fetched ID to prevent duplicate fetches
  let lastFetchedId = $state<string | null>(null);

  // Fetch smol data when id changes
  async function fetchSmolData(smolId: string) {
    loading = true;
    error = null;

    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${smolId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to load smol');
      }

      data = await response.json();
      d1 = data?.d1;
      kv_do = data?.kv_do;
      liked = data?.liked;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load';
      logger.error('smol', 'Failed to fetch smol data:', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Only fetch if id actually changed
    if (id && id !== lastFetchedId) {
      lastFetchedId = id;
      fetchSmolData(id);
    }
  });

  onMount(async () => {
    switch (data?.wf?.status) {
      case 'queued':
      case 'running':
      case 'paused':
      case 'waiting':
      case 'waitingForPause':
        startPolling();
        break;
      case 'errored':
      case 'terminated':
      case 'unknown':
        failed = true;
        break;
    }

    const urlParams = new URLSearchParams(window.location.search);
    playlist = urlParams.get('playlist') || localStorage.getItem('smol:playlist');

    if (playlist) {
      localStorage.setItem('smol:playlist', playlist);
    }
  });

  function scheduleNextPoll() {
    const gen = pollGeneration;
    interval = setTimeout(async () => {
      await getGen();
      // If a new polling cycle started (e.g. Retry), abandon this one
      if (gen !== pollGeneration) return;
      // getGen clears interval when polling should stop;
      // if it's still set, schedule another with increased delay
      if (interval !== null) {
        pollDelay = Math.min(pollDelay * 1.5, 15000);
        scheduleNextPoll();
      }
    }, pollDelay);
  }

  function startPolling() {
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

  function playAudio(index: number) {
    // Pause and clear global audio player if it's playing
    if (audioState.audioElement && !audioState.audioElement.paused) {
      audioState.audioElement.pause();
    }
    audioState.playingId = null;
    audioState.currentSong = null;

    // Pause all local audio elements except the one being played
    audioElements.forEach((audio, i) => {
      if (i !== index) {
        audio.pause();
      } else {
        audio.play();
      }
    });
  }

  // Effect: Pause local audio elements when global player starts playing
  $effect(() => {
    const globalPlayingId = audioState.playingId;
    const globalAudio = audioState.audioElement;

    if (globalPlayingId && globalAudio && !globalAudio.paused) {
      // Global player is playing, pause all local audio elements
      audioElements.forEach((audio) => {
        if (!audio.paused) {
          audio.pause();
        }
      });
    }
  });

  function removePlaylist() {
    const url = new URL(window.location.href);
    url.searchParams.delete('playlist');
    history.replaceState({}, '', url.toString());
    localStorage.removeItem('smol:playlist');
    playlist = null;
    location.reload();
  }

  function limitPromptLength() {
    if (prompt.length > maxLength) {
      prompt = prompt.substring(0, maxLength);
    }
  }

  async function makeSongPublic() {
    await fetch(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
      method: 'PUT',
      credentials: 'include',
    });

    if (d1) {
      d1.Public = d1.Public === 1 ? 0 : 1;
    }
  }

  async function deleteSong() {
    if (!confirm('Are you sure you want to delete this song?')) return;

    await fetch(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    history.replaceState({}, '', '/');
    location.reload();
  }

  async function selectBestSong(song_id: string) {
    await fetch(`${import.meta.env.PUBLIC_API_URL}/${id}/${song_id}`, {
      method: 'PUT',
      credentials: 'include',
    });
  }

  async function postGen() {
    if (!prompt) return;

    id = null;
    d1 = undefined;
    kv_do = undefined;
    failed = false;

    stopPolling();

    id = await generationHook.postGen(prompt, is_public, is_instrumental, playlist);
    prompt = '';

    startPolling();
    await getGen();
  }

  async function retryGen() {
    d1 = undefined;
    kv_do = undefined;

    stopPolling();

    if (!id) return;

    id = await generationHook.retryGen(id);
    failed = false;
    startPolling();
    await getGen();
  }

  async function triggerMint() {
    if (!id || minting || minted) return;

    if (!userState.contractId || !userState.keyId) {
      alert('Connect your wallet to mint');
      return;
    }

    const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;

    if (!smolContractId) {
      logger.error('smol', 'Missing PUBLIC_SMOL_CONTRACT_ID env var');
      alert('Minting is temporarily unavailable. Please try again later.');
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
    } catch (error) {
      logger.error('smol', error);
      alert(error instanceof Error ? error.message : String(error));
      mintingHook.clearMintPolling();
      minting = false;
    }
  }

  async function getGen() {
    if (!id) return;

    const res = await generationHook.getGen(id);
    d1 = res?.d1;
    kv_do = res?.kv_do;
    best_song = d1?.Song_1;

    if (generationHook.shouldStopPolling(res?.wf?.status)) {
      stopPolling();
      if (generationHook.isFailed(res.wf.status)) {
        failed = true;
      }
    }

    if (interval && d1) {
      stopPolling();
    }

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
  <div class="flex justify-center items-center py-20">
    <div class="text-lime-500">Loading...</div>
  </div>
{:else if error}
  <div class="flex justify-center items-center py-20">
    <div class="text-red-500">{error}</div>
  </div>
{:else if !id}
  {#if !userState.contractId}
    <div class="px-2 py-10 bg-slate-900">
      <div class="flex flex-col items-center max-w-[1024px] mx-auto">
        <h1 class="bg-rose-950 border border-rose-400 rounded px-2 py-1">
          Login or Create New Account
        </h1>
      </div>
    </div>
  {:else}
    <SmolGenerator
      bind:prompt
      bind:isPublic={is_public}
      bind:isInstrumental={is_instrumental}
      {playlist}
      isGenerating={!!id && !!interval}
      {maxLength}
      onPromptChange={limitPromptLength}
      onPublicChange={() => limitPromptLength()}
      onInstrumentalChange={() => limitPromptLength()}
      onSubmit={postGen}
      onRemovePlaylist={removePlaylist}
    />
  {/if}
{/if}

{#if id}
  {#if failed}
    <SmolRetryPanel
      isPolling={!!id && !!interval}
      {playlist}
      onRetry={retryGen}
      onRemovePlaylist={removePlaylist}
    />
  {/if}

  <SmolDisplay
    {id}
    {d1}
    {kv_do}
    {liked}
    bind:bestSong={best_song}
    {interval}
    {minting}
    {minted}
    {tradeReady}
    {tradeMintBalance}
    {isOwner}
    bind:audioElements
    onMakeSongPublic={makeSongPublic}
    onDeleteSong={deleteSong}
    onSelectBestSong={selectBestSong}
    onPlayAudio={playAudio}
    onTriggerMint={triggerMint}
    onOpenTradeModal={openTradeModal}
    onLikeChanged={(likedValue) => (liked = likedValue)}
  />

  {#if d1?.Public === 1}
    <SimilarSmols id={id} />
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
    userContractId={userState.contractId}
    bind:mintBalance={tradeMintBalance}
    onClose={() => (showTradeModal = false)}
    onComplete={handleTradeComplete}
  />
{/if}
