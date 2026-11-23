<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import type { Smol } from '../../types/domain';
  import MixtapeHeader from './MixtapeHeader.svelte';
  import MixtapeTracklist from './MixtapeTracklist.svelte';
  import PurchaseModal from './PurchaseModal.svelte';
  import { next, player, playQueue, previous, setTrackLiked, stop, toggle } from '../../stores/audio.svelte';
  import { toTrack, trackKey } from '../../utils/track';
  import { userState } from '../../stores/user.svelte';
  import { useMixtapeMinting } from '../../hooks/useMixtapeMinting';
  import { useMixtapePurchase } from '../../hooks/useMixtapePurchase';
  import { useMixtapeBalances } from '../../hooks/useMixtapeBalances';
  import { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from '../../utils/mint';
  import { getMixtapeDetail } from '../../services/api/mixtapes';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { logger } from '../../utils/logger';

  interface Props {
    id: string;
    initialData?: MixtapeDetail | null;
  }

  let { id, initialData = null }: Props = $props();

  // State
  let mixtape = $state<MixtapeDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let mixtapeTracks = $state<Smol[]>([]);

  let loadingTracks = $state(new Set<string>());

  // Purchase modal state
  let showPurchaseModal = $state(false);
  let isPurchasing = $state(false);
  let purchaseCurrentStep = $state('');
  let purchaseCompletedSteps = $state(new Set<string>());

  // Initialize hooks
  const mintingHook = useMixtapeMinting();
  const purchaseHook = useMixtapePurchase();
  const balancesHook = useMixtapeBalances();

  // Derived values
  const ownsQueue = $derived(player.queueId === id);
  const isPlayingAll = $derived(ownsQueue && (player.status === 'playing' || player.status === 'loading'));
  const canPlay = $derived(player.ready && mixtapeTracks.some((track) => Boolean(track.Song_1)));

  const fullyOwned = $derived(
    mixtape && mixtapeTracks.length > 0
      ? mixtapeTracks.every((track) => {
          return (
            track?.Mint_Token &&
            track?.Mint_Amm &&
            track?.balance !== undefined &&
            track.balance > 0n
          );
        })
      : false
  );

  const coverUrls = $derived(
    mixtape
      ? Array.from({ length: 4 }, (_, i) => {
          const track = mixtapeTracks[i];
          return track?.Id
            ? `${import.meta.env.PUBLIC_API_URL}/image/${track.Id}.png`
            : null;
        })
      : []
  );

  const tracksToMint = $derived(
    mixtapeTracks
      .filter((track) => {
        return track && !track.Mint_Token;
      })
      .map((track) => ({
        id: track.Id,
        title: track.Title || 'Unknown Track',
      }))
  );

  const tracksToPurchase = $derived(
    mixtapeTracks
      .filter((track) => {
        return (
          track &&
          track.Mint_Token &&
          track.Mint_Amm &&
          (track.balance || 0n) === 0n
        );
      })
      .map((track) => ({
        id: track.Id,
        title: track.Title || 'Unknown Track',
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
      case ' ': event.preventDefault(); toggle(); break;
      case 'ArrowRight': event.preventDefault(); next(); break;
      case 'ArrowLeft': event.preventDefault(); previous(); break;
    }
  }

  // Track last fetched ID to prevent duplicate fetches
  let lastFetchedMixtapeId = $state<string | null>(null);

  // Fetch mixtape data
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
        throw new Error('Mixtape not found');
      }

      mixtape = mixtapeData;
      const likedTrackIdSet = new Set(likedTrackIds);

      // Initialize tracks
      mixtapeTracks = mixtapeData.tracks.map((track) => {
        const isLiked = likedTrackIdSet.has(track.Id);
        return {
          Id: track.Id,
          Title: track.Title,
          Address: track.Address,
          Song_1: track.Song_1,
          Mint_Token: track.Mint_Token,
          Mint_Amm: track.Mint_Amm,
          Public: track.Public,
          Liked: isLiked,
          minting: false,
          balance: undefined,
          lyrics: track.Tags?.length
            ? {
                style: track.Tags,
              }
            : undefined,
        } as Smol;
      });

      // Fetch track balances if authenticated
      if (userState.contractId) {
        await balancesHook.refreshAllBalances(
          mixtapeTracks,
          userState.contractId,
          handleBalanceUpdated
        );
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load mixtape';
      logger.error('mixtape', 'Failed to fetch mixtape data:', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Only fetch if id actually changed
    if (id && id !== lastFetchedMixtapeId) {
      const mixtapeId = id;
      const seed = initialData?.id === mixtapeId ? initialData : null;
      lastFetchedMixtapeId = mixtapeId;
      untrack(() => void fetchMixtapeData(mixtapeId, seed));
    }
  });

  // Refetch balances when user state becomes available (handles full page refresh)
  let balanceRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastBalanceRefreshKey = $state<string | null>(null);

  $effect(() => {
    const contractId = userState.contractId;
    const tracksLength = mixtapeTracks.length;
    const isLoading = loading;

    // Use untrack to prevent this effect from re-running when balance updates
    untrack(() => {
      if (contractId && tracksLength > 0 && !isLoading) {
        const hasUndefinedBalances = mixtapeTracks.some(
          (track) => track?.Mint_Token && track?.balance === undefined
        );

        if (hasUndefinedBalances) {
          // Create a key to track this specific balance fetch
          const trackIds = mixtapeTracks
            .filter((t) => t?.Mint_Token && t?.balance === undefined)
            .map((t) => t.Id)
            .sort()
            .join(',');
          const refreshKey = `${contractId}-${trackIds}`;

          // Only refresh if we haven't already fetched these exact balances
          if (refreshKey !== lastBalanceRefreshKey) {
            // Debounce balance refresh to prevent rapid re-fetches
            if (balanceRefreshTimeout) clearTimeout(balanceRefreshTimeout);

            balanceRefreshTimeout = setTimeout(() => {
              lastBalanceRefreshKey = refreshKey;
              balancesHook.refreshAllBalances(
                mixtapeTracks,
                contractId,
                handleBalanceUpdated
              );
            }, 300);
          }
        }
      }
    });

    return () => {
      if (balanceRefreshTimeout) clearTimeout(balanceRefreshTimeout);
    };
  });

  onDestroy(() => {
    if (balanceRefreshTimeout) clearTimeout(balanceRefreshTimeout);
    mintingHook.clearAllMintPolling();
  });

  function handleBalanceUpdated(trackId: string, balance: bigint) {
    const index = mixtapeTracks.findIndex((t) => t?.Id === trackId);
    if (index !== -1 && mixtapeTracks[index]) {
      mixtapeTracks[index].balance = balance;
      mixtapeTracks = [...mixtapeTracks];
    }
  }

  function handleMintStatusUpdate(
    trackId: string,
    mintToken: string,
    mintAmm: string
  ) {
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
      balancesHook.updateTrackBalance(
        trackId,
        mintToken,
        userState.contractId,
        handleBalanceUpdated
      );
    }
  }

  function handlePurchaseClick() {
    if (!userState.contractId || !userState.keyId) {
      alert('Connect your wallet to purchase this mixtape');
      return;
    }
    showPurchaseModal = true;
  }

  async function handlePurchaseConfirm() {
    if (!mixtape || !userState.contractId || !userState.keyId) return;

    const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
    if (!smolContractId) {
      logger.error('mixtape', 'Missing PUBLIC_SMOL_CONTRACT_ID env var');
      alert('Purchasing is temporarily unavailable. Please try again later.');
      return;
    }

    isPurchasing = true;
    purchaseCurrentStep = '';
    purchaseCompletedSteps = new Set();

    try {
      // Step 1: Mint all unminted tracks
      if (tracksToMint.length > 0) {
        purchaseCurrentStep = 'mint';

        // Mark tracks as minting
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
          handleMintStatusUpdate,
          (chunkIndex, error) => {
            // Don't alert for user cancellations
            if (error.name !== 'NotAllowedError') {
              alert(`Batch ${chunkIndex + 1} failed: ${error.message}`);
            }
          }
        );

        // Wait for all tracks to be minted
        const startTime = Date.now();
        while (Date.now() - startTime < MINT_POLL_TIMEOUT) {
          const allMinted = mixtapeTracks.every((track) => {
            return track?.Mint_Token && track?.Mint_Amm;
          });

          if (allMinted) break;

          await new Promise((resolve) =>
            setTimeout(resolve, MINT_POLL_INTERVAL)
          );
        }

        const unmintedTracks = mixtapeTracks.filter((track) => {
          return track && !track.Mint_Token;
        });

        if (unmintedTracks.length > 0) {
          throw new Error(
            `Some tracks are still minting. Please wait and try again.`
          );
        }

        purchaseCompletedSteps.add('mint');
      }

      // Refresh balances after minting
      logger.info('mixtape', 'Refreshing balances after minting...');
      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated
      );
      logger.info('mixtape', 'Balances refreshed');

      // Build tokens array for swap_them_in
      const tokensOut: string[] = [];
      for (const track of mixtapeTracks) {
        if (
          track?.Mint_Token &&
          track?.Mint_Amm &&
          (track.balance || 0n) === 0n
        ) {
          tokensOut.push(track.Mint_Token);
        }
      }

      logger.info('mixtape', 'Tracks to purchase:', tokensOut.length);

      // Step 2: Purchase remaining tracks
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

      // Refresh balances after purchase
      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated
      );

      // Final step
      purchaseCurrentStep = 'complete';
      purchaseCompletedSteps.add('complete');

      // Clean up polling - minting is complete
      mintingHook.clearAllMintPolling();

      setTimeout(() => {
        showPurchaseModal = false;
        isPurchasing = false;
        purchaseCurrentStep = '';
        purchaseCompletedSteps = new Set();
      }, 2000);
    } catch (error) {
      logger.error('mixtape', 'Purchase error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';

      // Check if user cancelled the transaction
      const isCancellation =
        errorName === 'NotAllowedError' ||
        errorMessage.toLowerCase().includes('abort') ||
        errorMessage.toLowerCase().includes('cancel') ||
        errorMessage.toLowerCase().includes('not allowed');

      if (isCancellation) {
        // User cancelled - reset to initial state but keep modal open so they can retry
        mintingHook.clearAllMintPolling();
        isPurchasing = false;
        purchaseCurrentStep = '';
        purchaseCompletedSteps = new Set();

        // Reset minting state for tracks
        mixtapeTracks = mixtapeTracks.map(track => {
          if (track) {
            return { ...track, minting: false };
          }
          return track;
        });
      } else {
        // Real error - show alert and close modal
        alert(`Purchase failed: ${errorMessage}`);

        // Clean up polling intervals/timeouts
        mintingHook.clearAllMintPolling();

        // Reset modal state and close
        showPurchaseModal = false;
        isPurchasing = false;
        purchaseCurrentStep = '';
        purchaseCompletedSteps = new Set();
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

{#if loading}
  <div class="mx-auto max-w-4xl px-4 py-16 text-center">
    <p class="text-lime-500">Loading...</p>
  </div>
{:else if error}
  <div class="mx-auto max-w-4xl px-4 py-16 text-center">
    <p class="text-red-500">{error}</p>
  </div>
{:else if !mixtape}
  <div class="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">
    <p>
      We couldn't find that mixtape. Double-check the link or publish a new
      one.
    </p>
  </div>
{:else}
  <div
    class="mx-auto flex max-w-4xl flex-col gap-4 px-2 py-4 md:gap-8 md:px-4 md:py-8"
  >
    <MixtapeHeader
      {mixtape}
      {coverUrls}
      {loadingTracks}
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
      {loadingTracks}
      onTrackClick={startMixtape}
      onLikeChanged={handleLikeChanged}
    />
  </div>
{/if}

<PurchaseModal
  isOpen={showPurchaseModal}
  {tracksToMint}
  {tracksToPurchase}
  isProcessing={isPurchasing}
  currentStep={purchaseCurrentStep}
  completedSteps={purchaseCompletedSteps}
  on:close={() => {
    mintingHook.clearAllMintPolling();
    showPurchaseModal = false;
  }}
  on:confirm={handlePurchaseConfirm}
/>
