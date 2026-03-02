<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import type { MixtapeDetail } from "../../services/api/mixtapes";
  import type { Smol } from "../../types/domain";
  import MixtapeHeader from "./MixtapeHeader.svelte";
  import MixtapeTracklist from "./MixtapeTracklist.svelte";
  import MixtapeSupportBanner from "./MixtapeSupportBanner.svelte";
  import PurchaseModal from "./PurchaseModal.svelte";
  import {
    audioState,
    registerSongNextCallback,
    setPlaylistContext,
  } from "../../stores/audio.svelte.ts";
  import { userState } from "../../stores/user.svelte.ts";
  import { useMixtapeMinting } from "../../hooks/useMixtapeMinting";
  import { useMixtapePurchase } from "../../hooks/useMixtapePurchase";
  import { useMixtapeBalances } from "../../hooks/useMixtapeBalances";
  import { useMixtapePlayback } from "../../hooks/useMixtapePlayback";
  import { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from "../../utils/mint";
  import { getMixtapeDetail } from "../../services/api/mixtapes";
  import { fetchLikedSmols, safeFetchSmols } from "../../services/api/smols";
  import {
    loadPublishedMixtape,
    enterMixtapeMode,
  } from "../../stores/mixtape.svelte.ts";

  interface Props {
    id: string;
  }

  let { id }: Props = $props();

  // State
  let mixtape = $state<MixtapeDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let mixtapeTracks = $state<Smol[]>([]);

  let loadingTracks = $state(new Set<string>());
  let currentTrackIndex = $state(-1);
  let isPlayingAll = $state(false);

  // Purchase modal state
  let showPurchaseModal = $state(false);
  let isPurchasing = $state(false);
  let purchaseCurrentStep = $state("");
  let purchaseCompletedSteps = $state(new Set<string>());

  // Support banner state (optional tip jar) - hidden by default, shown on artwork tap
  let showSupportBanner = $state(false);
  let supportBannerDismissed = $state(false);
  let purchaseModal: any;

  // Initialize hooks
  const mintingHook = useMixtapeMinting();
  const purchaseHook = useMixtapePurchase();
  const balancesHook = useMixtapeBalances();

  // Derived values
  const isAnyPlaying = $derived(
    audioState.playingId !== null && audioState.currentSong !== null,
  );

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
      : false,
  );

  const isCreator = $derived(
    userState.contractId && mixtape && userState.contractId === mixtape.creator,
  );

  const coverUrls = $derived(
    mixtape
      ? Array.from({ length: 4 }, (_, i) => {
          const track = mixtapeTracks[i];
          return track?.Id
            ? `${import.meta.env.PUBLIC_API_URL}/image/${track.Id}.png`
            : null;
        })
      : [],
  );

  const tracksToMint = $derived(
    mixtapeTracks
      .filter((track) => {
        return track && !track.Mint_Token;
      })
      .map((track) => ({
        id: track.Id,
        title: track.Title || "Unknown Track",
      })),
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
        title: track.Title || "Unknown Track",
      })),
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

  // Track last fetched ID to prevent duplicate fetches
  let lastFetchedMixtapeId = $state<string | null>(null);

  // Fetch mixtape data
  async function fetchMixtapeData(mixtapeId: string) {
    loading = true;
    error = null;

    try {
      // Fetch mixtape
      const mixtapeData = await getMixtapeDetail(mixtapeId);

      if (!mixtapeData) {
        throw new Error("Mixtape not found");
      }

      mixtape = mixtapeData;

      // Fetch liked tracks if authenticated
      let likedTrackIds: string[] = [];
      if (userState.contractId) {
        likedTrackIds = await fetchLikedSmols();
      }

      // Fetch snapshot to get Minted_By data
      const snapshot = await safeFetchSmols();
      const snapshotMap = new Map(snapshot.map((s) => [s.Id, s]));

      // Initialize tracks with Minted_By from snapshot
      mixtapeTracks = mixtapeData.tracks.map((track) => {
        const isLiked = likedTrackIds.includes(track.Id);
        const snapshotTrack = snapshotMap.get(track.Id);
        return {
          Id: track.Id,
          Title: track.Title,
          Address: track.Address,
          Song_1: track.Song_1,
          Mint_Token: track.Mint_Token,
          Mint_Amm: track.Mint_Amm,
          Minted_By: track.Minted_By || snapshotTrack?.Minted_By, // Use API or fallback to snapshot
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
          handleBalanceUpdated,
        );
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load mixtape";
      console.error("Failed to fetch mixtape data:", err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Only fetch if id actually changed
    if (id && id !== lastFetchedMixtapeId) {
      lastFetchedMixtapeId = id;
      fetchMixtapeData(id);
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
          (track) => track?.Mint_Token && track?.balance === undefined,
        );

        if (hasUndefinedBalances) {
          // Create a key to track this specific balance fetch
          const trackIds = mixtapeTracks
            .filter((t) => t?.Mint_Token && t?.balance === undefined)
            .map((t) => t.Id)
            .sort()
            .join(",");
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
                handleBalanceUpdated,
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

  // Setup playback when mixtape loads
  $effect(() => {
    if (!mixtape) return;

    // Register the playNext callback for this page
    registerSongNextCallback(playbackHook.playNext);

    // Setup media session handlers
    playbackHook.setupMediaSession();

    // Handle autoplay
    const urlParams = new URLSearchParams(window.location.search);
    const shouldAutoplay = urlParams.get("autoplay") === "true";

    if (shouldAutoplay) {
      urlParams.delete("autoplay");
      const newUrl =
        window.location.pathname +
        (urlParams.toString() ? "?" + urlParams.toString() : "");
      window.history.replaceState({}, "", newUrl);

      setTimeout(() => playbackHook.handlePlayAll(), 500);
    }
  });

  onMount(() => {
    // Add keyboard event listener
    window.addEventListener("keydown", playbackHook.handleKeyboard);

    return () => {
      window.removeEventListener("keydown", playbackHook.handleKeyboard);
      mintingHook.clearAllMintPolling();
    };
  });

  onDestroy(() => {
    // Clear balance refresh timeout
    if (balanceRefreshTimeout) {
      clearTimeout(balanceRefreshTimeout);
    }

    mintingHook.clearAllMintPolling();
    // Unregister the callback when this component is destroyed
    registerSongNextCallback(null);
  });

  // Store playlist context for fallback playback when navigating to pages without playlists
  $effect(() => {
    if (mixtapeTracks.length > 0) {
      setPlaylistContext(mixtapeTracks, Math.max(0, currentTrackIndex));
    }
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
    mintAmm: string,
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
        handleBalanceUpdated,
      );
    }
  }

  function handlePurchaseClick() {
    if (!userState.contractId || !userState.keyId) {
      alert("Connect your wallet to purchase this mixtape");
      return;
    }
    showPurchaseModal = true;
  }

  async function handlePurchaseConfirm(event: CustomEvent<{ token: string }>) {
    const { token } = event.detail;
    if (!mixtape || !userState.contractId || !userState.keyId || !token) return;

    const smolContractId =
      import.meta.env.PUBLIC_SMOL_CONTRACT_ID ||
      "CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA";
    if (!smolContractId) {
      // This check will now always be false due to the fallback
      console.error("Missing PUBLIC_SMOL_CONTRACT_ID env var");
      alert("Purchasing is temporarily unavailable. Please try again later.");
      return;
    }

    isPurchasing = true;
    purchaseCurrentStep = "";
    purchaseCompletedSteps = new Set();

    try {
      // Step 1: Mint all unminted tracks
      if (tracksToMint.length > 0) {
        purchaseCurrentStep = "mint";

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
            turnstileToken: token,
          },
          mixtape,
          handleMintStatusUpdate,
          (chunkIndex, error) => {
            // Don't alert for user cancellations
            if (error.name !== "NotAllowedError") {
              alert(`Batch ${chunkIndex + 1} failed: ${error.message}`);
            }
          },
        );

        // Wait for tracks to be minted (with progress updates)
        const startTime = Date.now();
        let lastMintedCount = 0;

        while (Date.now() - startTime < MINT_POLL_TIMEOUT) {
          const mintedCount = mixtapeTracks.filter(
            (track) => track?.Mint_Token && track?.Mint_Amm,
          ).length;
          const totalTracks = mixtapeTracks.length;

          // Log progress if changed
          if (mintedCount !== lastMintedCount) {
            console.log(
              `Minting progress: ${mintedCount}/${totalTracks} tracks minted`,
            );
            lastMintedCount = mintedCount;
          }

          const allMinted = mintedCount === totalTracks;
          if (allMinted) break;

          await new Promise((resolve) =>
            setTimeout(resolve, MINT_POLL_INTERVAL),
          );
        }

        const mintedTracks = mixtapeTracks.filter(
          (track) => track?.Mint_Token && track?.Mint_Amm,
        );
        const unmintedTracks = mixtapeTracks.filter(
          (track) => track && !track.Mint_Token,
        );

        // Partial success handling - don't throw, just log and continue with minted tracks
        if (unmintedTracks.length > 0) {
          console.warn(
            `Partial mint: ${mintedTracks.length}/${mixtapeTracks.length} tracks minted. ${unmintedTracks.length} tracks still pending.`,
          );
          // If ALL tracks failed, that's a real problem
          if (mintedTracks.length === 0) {
            throw new Error(
              "No tracks were minted. Please check your connection and try again.",
            );
          }
          // Otherwise continue with partial mint - user can buy what's ready
        }

        purchaseCompletedSteps.add("mint");
      }

      // Refresh balances after minting

      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated,
      );

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
        purchaseCurrentStep = "purchase";
        await purchaseHook.purchaseTracksInBatches(
          mixtapeTracks,
          tokensOut,
          smolContractId,
          userState.contractId,
          userState.keyId,
          token,
          (trackIds) => {
            for (const trackId of trackIds) {
              purchaseCompletedSteps.add(`purchase-${trackId}`);
            }
          },
          async () => {
            return await purchaseModal.requestNewToken();
          },
        );
        purchaseCompletedSteps.add("purchase");
      }

      // Refresh balances after purchase
      await balancesHook.refreshAllBalances(
        mixtapeTracks,
        userState.contractId,
        handleBalanceUpdated,
      );

      // Final step
      purchaseCurrentStep = "complete";
      purchaseCompletedSteps.add("complete");

      // Clean up polling - minting is complete
      mintingHook.clearAllMintPolling();

      setTimeout(() => {
        showPurchaseModal = false;
        isPurchasing = false;
        purchaseCurrentStep = "";
        purchaseCompletedSteps = new Set();
      }, 2000);
    } catch (error) {
      console.error("Purchase error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "";

      // Check if user cancelled the transaction
      const isCancellation =
        errorName === "NotAllowedError" ||
        errorMessage.toLowerCase().includes("abort") ||
        errorMessage.toLowerCase().includes("cancel") ||
        errorMessage.toLowerCase().includes("not allowed");

      if (isCancellation) {
        // User cancelled - reset to initial state but keep modal open so they can retry
        mintingHook.clearAllMintPolling();
        isPurchasing = false;
        purchaseCurrentStep = "";
        purchaseCompletedSteps = new Set();

        // Reset minting state for tracks
        mixtapeTracks = mixtapeTracks.map((track) => {
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
        purchaseCurrentStep = "";
        purchaseCompletedSteps = new Set();
      }
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
      const mixtapeTitle = mixtape.title;
      const index = mixtapeTracks.findIndex((t) => t?.Id === currentSong.Id);

      untrack(() => {
        if (index !== -1 && index !== currentTrackIndex) {
          currentTrackIndex = index;
        }

        playbackHook.updateMediaSessionMetadata(currentSong, mixtapeTitle);
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

  function handleEdit() {
    if (!mixtape) return;
    loadPublishedMixtape({
      id: mixtape.id,
      title: mixtape.title,
      description: mixtape.description,
      tracks: mixtape.tracks.map((track) => ({
        id: track.Id,
        title: track.Title,
        coverUrl: `${import.meta.env.PUBLIC_API_URL}/image/${track.Id}.png`,
        creator: track.Address,
      })),
    });
    enterMixtapeMode();
  }

  function handleSendToRadio() {
    if (!mixtape) return;
    window.location.href = `/radio?mixtape=${mixtape.id}&from=mixtape`;
  }
</script>

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
      We couldn't find that mixtape. Double-check the link or publish a new one.
    </p>
  </div>
{:else}
  <div
    class="mx-auto flex w-full max-w-[1024px] flex-col gap-4 px-2 py-4 md:gap-8 md:px-4 md:py-8"
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
      onEdit={isCreator ? handleEdit : undefined}
      onSendToRadio={handleSendToRadio}
      onArtworkClick={() => {
        showSupportBanner = true;
      }}
    />

    <MixtapeTracklist
      {mixtape}
      {mixtapeTracks}
      {loadingTracks}
      onTrackClick={(index) =>
        playbackHook.handleTrackClick(
          index,
          audioState.currentSong?.Id ?? null,
        )}
      onPlayNext={playbackHook.playNext}
      onLikeChanged={handleLikeChanged}
    />

    <!-- Support Banner (Optional Tip Jar) - placed after tracklist to avoid blocking header buttons -->
    {#if showSupportBanner && !supportBannerDismissed && !isCreator && mixtapeTracks.length > 0}
      <MixtapeSupportBanner
        curatorAddress={mixtape.creator}
        curatorName={mixtape.creator.slice(0, 8) + "..."}
        tracks={mixtapeTracks}
        onDismiss={() => {
          supportBannerDismissed = true;
        }}
      />
    {/if}
  </div>
{/if}

<PurchaseModal
  bind:this={purchaseModal}
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
