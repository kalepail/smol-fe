<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import type { Smol } from '../../types/domain';
  import MixtapeHeader from './MixtapeHeader.svelte';
  import MixtapeTracklist from './MixtapeTracklist.svelte';
  import PurchaseModal from './PurchaseModal.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import { next, player, playQueue, previous, setTrackLiked, stop, toggle } from '../../stores/audio.svelte';
  import { toTrack, trackKey } from '../../utils/track';
  import { userState } from '../../stores/user.svelte';
  import { balanceState, updateContractBalance } from '../../stores/balance.svelte';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from '../../utils/mintConstants';
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

  let showPurchaseModal = $state(false);
  let balancesLoading = $state(false);
  let isPurchasing = $state(false);
  let purchaseCurrentStep = $state('');
  const purchaseCompletedSteps = new SvelteSet<string>();

  // Lazy-loaded Web3 hooks (never imported until user interacts with Buy Mixtape).
  let mintingHookRef: ReturnType<typeof import('../../hooks/useMixtapeMinting').useMixtapeMinting> | null = null;

  const ownsQueue = $derived(player.queueId === id);
  const isPlayingAll = $derived(ownsQueue && (player.status === 'playing' || player.status === 'loading'));
  const canPlay = $derived(player.ready && mixtapeTracks.some((track) => Boolean(track.Song_1)));

  const fullyOwned = $derived(
    Boolean(
      mixtape &&
        mixtapeTracks.length > 0 &&
        mixtapeTracks.every(
          (track) =>
            track?.Mint_Token &&
            track?.Mint_Amm &&
            track?.balance !== undefined &&
            track.balance > 0n
        )
    )
  );

  const coverUrls = $derived(
    mixtape
      ? Array.from({ length: 4 }, (_, i) => {
          const track = mixtapeTracks[i];
          return track?.Id ? `${import.meta.env.PUBLIC_API_URL}/image/${track.Id}.png` : null;
        })
      : []
  );

  const tracksToMint = $derived(
    mixtapeTracks
      .filter((track) => track && !track.Mint_Token)
      .map((track) => ({
        id: track.Id,
        title: track.Title || 'Untitled track',
      }))
  );

  const tracksToPurchase = $derived(
    mixtapeTracks
      .filter(
        (track) =>
          track &&
          track.Mint_Token &&
          track.Mint_Amm &&
          (track.balance || 0n) === 0n
      )
      .map((track) => ({
        id: track.Id,
        title: track.Title || 'Untitled track',
      }))
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

  function handleKeyboard(event: KeyboardEvent) {
    if (!ownsQueue || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [contenteditable]')) return;

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
        minting: false,
        balance: undefined,
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

  onDestroy(() => {
    mintingHookRef?.clearAllMintPolling();
  });

  function handleBalanceUpdated(trackId: string, balance: bigint) {
    const index = mixtapeTracks.findIndex((t) => t?.Id === trackId);
    if (index !== -1 && mixtapeTracks[index]) {
      mixtapeTracks[index].balance = balance;
      mixtapeTracks = [...mixtapeTracks];
    }
  }

  async function refreshBalancesLazily() {
    if (!userState.contractId) return;
    balancesLoading = true;
    try {
      const { useMixtapeBalances } = await import('../../hooks/useMixtapeBalances');
      const balancesHook = useMixtapeBalances();
      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated
      );
    } catch (err) {
      logger.error('mixtape', 'Failed to refresh track balances:', err);
    } finally {
      balancesLoading = false;
    }
  }

  async function handleMintStatusUpdate(trackId: string, mintToken: string, mintAmm: string) {
    if (isPurchasing) {
      purchaseCompletedSteps.add(`mint-${trackId}`);
    }

    const index = mixtapeTracks.findIndex((t) => t?.Id === trackId);
    if (index !== -1 && mixtapeTracks[index]) {
      mixtapeTracks[index].Mint_Token = mintToken;
      mixtapeTracks[index].Mint_Amm = mintAmm;
      mixtapeTracks[index].minting = false;
      mixtapeTracks = [...mixtapeTracks];
    }

    if (userState.contractId) {
      const { useMixtapeBalances } = await import('../../hooks/useMixtapeBalances');
      const balancesHook = useMixtapeBalances();
      await balancesHook.updateTrackBalance(
        trackId,
        mintToken,
        userState.contractId,
        handleBalanceUpdated
      );
    }
  }

  function handlePurchaseClick() {
    if (!userState.contractId || !userState.keyId) {
      openAuthSheet('signin', 'Sign in to buy tracks in this mixtape.');
      return;
    }
    showPurchaseModal = true;
    void refreshBalancesLazily();
    void updateContractBalance(userState.contractId);
  }

  async function handlePurchaseConfirm() {
    if (!mixtape || !userState.contractId || !userState.keyId) return;

    const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
    if (!smolContractId) {
      logger.error('mixtape', 'Missing PUBLIC_SMOL_CONTRACT_ID env var');
      toast.error('Purchasing is temporarily unavailable. Try again later.');
      return;
    }

    isPurchasing = true;
    purchaseCurrentStep = '';
    purchaseCompletedSteps.clear();

    try {
      const [{ useMixtapeMinting }, { useMixtapePurchase }, { useMixtapeBalances }] =
        await Promise.all([
          import('../../hooks/useMixtapeMinting'),
          import('../../hooks/useMixtapePurchase'),
          import('../../hooks/useMixtapeBalances'),
        ]);

      const mintingHook = useMixtapeMinting();
      const purchaseHook = useMixtapePurchase();
      const balancesHook = useMixtapeBalances();
      mintingHookRef = mintingHook;

      if (tracksToMint.length > 0) {
        purchaseCurrentStep = 'mint';

        for (const track of tracksToMint) {
          const index = mixtapeTracks.findIndex((t) => t?.Id === track.id);
          if (index !== -1 && mixtapeTracks[index]) {
            mixtapeTracks[index].minting = true;
          }
        }
        mixtapeTracks = [...mixtapeTracks];

        await mintingHook.mintAllTracks(
          {
            mixtapeTracks,
            userContractId: userState.contractId,
            userKeyId: userState.keyId,
          },
          mixtape,
          (trackId, mintToken, mintAmm) => {
            void handleMintStatusUpdate(trackId, mintToken, mintAmm);
          },
          (chunkIndex, batchError) => {
            if (batchError.name !== 'NotAllowedError') {
              toast.error(`Batch ${chunkIndex + 1} failed: ${batchError.message}`);
            }
          }
        );

        const startTime = Date.now();
        while (Date.now() - startTime < MINT_POLL_TIMEOUT) {
          const allMinted = mixtapeTracks.every((track) => track?.Mint_Token && track?.Mint_Amm);
          if (allMinted) break;
          await new Promise((resolve) => setTimeout(resolve, MINT_POLL_INTERVAL));
        }

        const unmintedTracks = mixtapeTracks.filter((track) => track && !track.Mint_Token);
        if (unmintedTracks.length > 0) {
          throw new Error('Some tracks are still minting. Wait a moment and try again.');
        }

        purchaseCompletedSteps.add('mint');
      }

      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated
      );

      const tokensOut: string[] = [];
      for (const track of mixtapeTracks) {
        if (track?.Mint_Token && track?.Mint_Amm && (track.balance || 0n) === 0n) {
          tokensOut.push(track.Mint_Token);
        }
      }

      if (tokensOut.length > 0) {
        purchaseCurrentStep = 'purchase';
        await purchaseHook.purchaseTracksInBatches(
          mixtapeTracks,
          tokensOut,
          smolContractId,
          userState.contractId,
          userState.keyId,
          (trackIds) => {
            for (const trackId of trackIds) {
              purchaseCompletedSteps.add(`purchase-${trackId}`);
            }
          }
        );
        purchaseCompletedSteps.add('purchase');
      }

      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated
      );

      purchaseCurrentStep = 'complete';
      purchaseCompletedSteps.add('complete');
      mintingHook.clearAllMintPolling();
      toast.success('Mixtape purchased.');

      setTimeout(() => {
        showPurchaseModal = false;
        isPurchasing = false;
        purchaseCurrentStep = '';
        purchaseCompletedSteps.clear();
      }, 1500);
    } catch (err) {
      logger.error('mixtape', 'Purchase error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorName = err instanceof Error ? err.name : '';

      const isCancellation =
        errorName === 'NotAllowedError' ||
        errorMessage.toLowerCase().includes('abort') ||
        errorMessage.toLowerCase().includes('cancel') ||
        errorMessage.toLowerCase().includes('not allowed');

      mintingHookRef?.clearAllMintPolling();
      isPurchasing = false;
      purchaseCurrentStep = '';
      purchaseCompletedSteps.clear();
      mixtapeTracks = mixtapeTracks.map((track) => (track ? { ...track, minting: false } : track));

      if (!isCancellation) {
        toast.error(`Purchase failed: ${errorMessage}`);
        showPurchaseModal = false;
      }
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
        {isPlayingAll}
        {canPlay}
        {fullyOwned}
        {isPurchasing}
        onPlayAll={() => startMixtape()}
        onStopPlayAll={stop}
        onPurchaseClick={handlePurchaseClick}
      />

      <MixtapeTracklist
        {mixtape}
        {mixtapeTracks}
        onTrackClick={startMixtape}
        onLikeChanged={handleLikeChanged}
      />
    </div>
  {/if}
</section>

<PurchaseModal
  isOpen={showPurchaseModal}
  {balancesLoading}
  kaleBalance={balanceState.balance}
  kaleBalanceLoading={balanceState.loading}
  onRefreshKaleBalance={() => {
    if (userState.contractId) void updateContractBalance(userState.contractId);
  }}
  {tracksToMint}
  {tracksToPurchase}
  isProcessing={isPurchasing}
  currentStep={purchaseCurrentStep}
  completedSteps={purchaseCompletedSteps}
  onClose={() => {
    mintingHookRef?.clearAllMintPolling();
    showPurchaseModal = false;
  }}
  onConfirm={handlePurchaseConfirm}
/>
