<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import type { Smol } from '../../types/domain';
  import MixtapeHeader from './MixtapeHeader.svelte';
  import MixtapeTracklist from './MixtapeTracklist.svelte';
  import BarAudioPlayer from '../audio/BarAudioPlayer.svelte';
  import PurchaseModal from './PurchaseModal.svelte';
  import { audioState } from '../../stores/audio.svelte';
  import { userState } from '../../stores/user.svelte';
  import { useMixtapeMinting } from '../../hooks/useMixtapeMinting';
  import { useMixtapePurchase } from '../../hooks/useMixtapePurchase';
  import { useMixtapeBalances } from '../../hooks/useMixtapeBalances';
  import { useMixtapePlayback } from '../../hooks/useMixtapePlayback';
  import { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from '../../utils/mint';

  interface Props {
    mixtape: MixtapeDetail | null;
  }

  let { mixtape = null }: Props = $props();

  // State
  let loadingTracks = $state(new Set<string>());
  let mixtapeTracks = $state<Smol[]>([]);
  let currentTrackIndex = $state(-1);
  let isPlayingAll = $state(false);
  let likes = $state<string[]>([]);
  let likesLoaded = $state(false);

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
  const isAnyPlaying = $derived(
    audioState.playingId !== null && audioState.currentSong !== null
  );

  const fullyOwned = $derived(
    mixtape
      ? mixtapeTracks.every((track) => {
          return (
            track?.Mint_Token &&
            track?.Mint_Amm &&
            (track?.balance || 0n) > 0n
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

  // Playback hook
  const playbackHook = useMixtapePlayback({
    get mixtapeTracks() {
      return mixtapeTracks;
    },
    get currentTrackIndex() {
      return currentTrackIndex;
    },
    get isPlayingAll() {
      return isPlayingAll;
    },
    onTrackIndexChange: (index: number) => {
      currentTrackIndex = index;
    },
    onPlayingAllChange: (playing: boolean) => {
      isPlayingAll = playing;
    },
  });

  // Reactively update liked states when likes are loaded or change
  $effect(() => {
    if (likesLoaded && likes.length >= 0) {
      untrack(() => {
        mixtapeTracks = mixtapeTracks.map((track) => {
          if (track?.Id) {
            const isLiked = likes.includes(track.Id);
            return { ...track, Liked: isLiked };
          }
          return track;
        });
      });
    }
  });

  onMount(() => {
    if (!mixtape) return;

    // Setup media session handlers
    playbackHook.setupMediaSession();

    // Add keyboard event listener
    window.addEventListener('keydown', playbackHook.handleKeyboard);

    // Handle async operations
    (async () => {
      // Fetch likes FIRST if user is connected
      if (userState.contractId && !likesLoaded) {
        likes = await fetch(`${import.meta.env.PUBLIC_API_URL}/likes`, {
          credentials: 'include',
        }).then(async (res) => {
          if (res.ok) return res.json();
          return [];
        });
        likesLoaded = true;
      }

      // Check for autoplay parameter
      const urlParams = new URLSearchParams(window.location.search);
      const shouldAutoplay = urlParams.get('autoplay') === 'true';

      // Load track data
      const loadPromises = mixtape.tracks.map(async (track, index) => {
        loadingTracks.add(track.id);

        try {
          const response = await fetch(
            `${import.meta.env.PUBLIC_API_URL}/${track.id}`,
            {
              credentials: 'include',
            }
          );
          if (response.ok) {
            const fullData = await response.json();
            const d1 = fullData?.d1;
            const kv_do = fullData?.kv_do;

            const isLiked = likesLoaded
              ? likes.includes(track.id)
              : fullData?.liked || false;

            const smolTrack: Smol = {
              Id: track.id,
              Title:
                kv_do?.lyrics?.title ??
                kv_do?.description ??
                d1?.Title ??
                'Unknown Track',
              Song_1: d1?.Song_1,
              Liked: isLiked,
              lyrics: kv_do?.lyrics,
              minting: false,
              balance: 0n,
              ...d1,
            };

            mixtapeTracks[index] = smolTrack;
            mixtapeTracks = [...mixtapeTracks];

            // If minted and user is connected, fetch balance
            if (
              d1?.Mint_Token &&
              d1?.Mint_Amm &&
              userState.contractId
            ) {
              await balancesHook.updateTrackBalance(
                track.id,
                d1.Mint_Token,
                userState.contractId,
                handleBalanceUpdated
              );
            }
          } else {
            mixtapeTracks[index] = null as any;
            mixtapeTracks = [...mixtapeTracks];
          }
        } catch (error) {
          mixtapeTracks[index] = null as any;
          mixtapeTracks = [...mixtapeTracks];
        } finally {
          loadingTracks.delete(track.id);
        }
      });

      // Handle autoplay
      if (shouldAutoplay) {
        await Promise.race([
          loadPromises[0],
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);

        urlParams.delete('autoplay');
        const newUrl =
          window.location.pathname +
          (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);

        setTimeout(() => playbackHook.handlePlayAll(), 500);
      }
    })();

    return () => {
      window.removeEventListener('keydown', playbackHook.handleKeyboard);
      mintingHook.clearAllMintPolling();
    };
  });

  onDestroy(() => {
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
      console.error('Missing PUBLIC_SMOL_CONTRACT_ID env var');
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
            // Mark failed tracks as not minting
            alert(`Batch ${chunkIndex + 1} failed: ${error.message}`);
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
      console.log('Refreshing balances after minting...');
      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated
      );
      console.log('Balances refreshed');

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

      setTimeout(() => {
        showPurchaseModal = false;
        isPurchasing = false;
        purchaseCurrentStep = '';
        purchaseCompletedSteps = new Set();
      }, 2000);
    } catch (error) {
      console.error('Purchase error:', error);
      alert(error instanceof Error ? error.message : String(error));
      isPurchasing = false;
    }
  }

  function handleLikeChanged(index: number, liked: boolean) {
    if (mixtapeTracks[index]) {
      mixtapeTracks[index].Liked = liked;
      mixtapeTracks = [...mixtapeTracks];
    }

    // If this is the currently playing song, update currentSong
    if (audioState.currentSong?.Id === mixtapeTracks[index]?.Id) {
      audioState.currentSong.Liked = liked;
    }
  }

  // Monitor current playing song and update media session
  $effect(() => {
    if (audioState.currentSong && mixtape) {
      const currentSong = audioState.currentSong;
      const index = mixtapeTracks.findIndex(
        (t) => t?.Id === currentSong.Id
      );

      untrack(() => {
        if (index !== -1 && index !== currentTrackIndex) {
          currentTrackIndex = index;
        }

        playbackHook.updateMediaSessionMetadata(currentSong, mixtape.title);
      });
    }
  });

  // Detect when playback stops completely
  $effect(() => {
    if (!audioState.playingId && !audioState.currentSong) {
      untrack(() => {
        isPlayingAll = false;
        currentTrackIndex = -1;
        playbackHook.clearMediaSessionMetadata();
      });
    }
  });

  // Auto-disable Play All mode when user pauses
  $effect(() => {
    if (!audioState.playingId && audioState.currentSong && isPlayingAll) {
      isPlayingAll = false;
    }
  });

  // Re-enable Play All mode when user resumes playing
  $effect(() => {
    if (
      audioState.playingId &&
      audioState.currentSong &&
      !isPlayingAll &&
      currentTrackIndex >= 0
    ) {
      isPlayingAll = true;
    }
  });
</script>

{#if !mixtape}
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
      {isAnyPlaying}
      {fullyOwned}
      {isPurchasing}
      onPlayAll={playbackHook.handlePlayAll}
      onStopPlayAll={playbackHook.stopPlayAll}
      onPurchaseClick={handlePurchaseClick}
    />

    <MixtapeTracklist
      {mixtape}
      {mixtapeTracks}
      {loadingTracks}
      onTrackClick={(index) =>
        playbackHook.handleTrackClick(index, audioState.currentSong?.Id ?? null)}
      onPlayNext={playbackHook.playNext}
      onLikeChanged={handleLikeChanged}
    />
  </div>
{/if}

<BarAudioPlayer
  classNames="fixed z-30 p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
  songNext={playbackHook.playNext}
/>

<PurchaseModal
  isOpen={showPurchaseModal}
  {tracksToMint}
  {tracksToPurchase}
  isProcessing={isPurchasing}
  currentStep={purchaseCurrentStep}
  completedSteps={purchaseCompletedSteps}
  on:close={() => (showPurchaseModal = false)}
  on:confirm={handlePurchaseConfirm}
/>
