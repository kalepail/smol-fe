<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { MixtapeDetail, SmolTrackData } from "../../utils/api/mixtapes";
    import { getSmolTrackData } from "../../utils/api/mixtapes";
    import type { MixtapeTrack } from "../../store/mixtape";
    import Loader from "../Loader.svelte";
    import BarAudioPlayer from "../BarAudioPlayer.svelte";
    import MiniAudioPlayer from "../MiniAudioPlayer.svelte";
    import LikeButton from "../LikeButton.svelte";
    import TokenBalancePill from "../TokenBalancePill.svelte";
    import PurchaseModal from "./PurchaseModal.svelte";
    import { playingId, currentSong, selectSong, togglePlayPause, audioProgress } from "../../store/audio";
    import { contractId } from "../../store/contractId";
    import { keyId } from "../../store/keyId";
    import { sac } from "../../utils/passkey-kit";
    import { getTokenBalance } from "../../utils/balance";
    import { createMintTransaction, submitMintTransaction, MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from "../../utils/mint";
    import { Client as SmolClient } from "smol-sdk";

    export let mixtape: MixtapeDetail | null = null;

    let trackDataMap = new Map<string, SmolTrackData | null>();
    let loadingTracks = new Set<string>();
    let mixtapeTracks: any[] = []; // Full track data for playback
    let trackLikedStates = new Map<string, boolean>(); // Track liked states
    let currentTrackIndex = -1;
    let isPlayingAll = false;
    let likes: string[] = []; // Array of liked song IDs
    let likesLoaded = false; // Track if likes have been loaded

    // Mint tracking
    let trackMintStatus = new Map<string, { minted: boolean; minting: boolean; mintToken: string | null; mintAmm: string | null }>();
    let trackBalances = new Map<string, bigint>();
    let mintingTracks = new Set<string>();
    let mintTimeouts = new Map<string, NodeJS.Timeout>();
    let mintIntervals = new Map<string, NodeJS.Timeout>();

    // Purchase modal state
    let showPurchaseModal = false;
    let isPurchasing = false;
    let purchaseCurrentStep = "";
    let purchaseCompletedSteps = new Set<string>();

    // Reactive: Check if any audio is currently playing
    $: isAnyPlaying = $playingId !== null && $currentSong !== null;

    // Reactive: Check if fully owned
    $: fullyOwned = mixtape ? mixtape.tracks.every(track => {
        const status = trackMintStatus.get(track.id);
        const balance = trackBalances.get(track.id) || 0n;
        return status?.minted && balance > 0n;
    }) : false;

    // Reactive: Build purchase modal data
    $: tracksToMint = mixtape ? mixtape.tracks.filter(track => {
        const status = trackMintStatus.get(track.id);
        return !status?.minted;
    }).map(track => ({
        id: track.id,
        title: trackDataMap.get(track.id)?.title || "Unknown Track"
    })) : [];

    $: tracksToPurchase = mixtape ? mixtape.tracks.filter(track => {
        const status = trackMintStatus.get(track.id);
        const balance = trackBalances.get(track.id) || 0n;
        return status?.minted && balance === 0n;
    }).map(track => ({
        id: track.id,
        title: trackDataMap.get(track.id)?.title || "Unknown Track"
    })) : [];

    // Reactively update liked states when likes are loaded or change
    $: if (likesLoaded && likes.length >= 0) {
        // Update liked states for all loaded tracks
        mixtapeTracks.forEach((track, index) => {
            if (track?.Id) {
                const isLiked = likes.includes(track.Id);
                if (track.Liked !== isLiked) {
                    track.Liked = isLiked;
                    trackLikedStates.set(track.Id, isLiked);
                }
            }
        });
        trackLikedStates = trackLikedStates;
    }

    onMount(() => {
        if (!mixtape) return;

        // Setup media session handlers for browser media controls
        if ("mediaSession" in navigator) {
            navigator.mediaSession.setActionHandler("previoustrack", () => {
                playPrevious();
            });

            navigator.mediaSession.setActionHandler("nexttrack", () => {
                playNext();
            });

            navigator.mediaSession.setActionHandler("play", () => {
                togglePlayPause();
            });

            navigator.mediaSession.setActionHandler("pause", () => {
                togglePlayPause();
            });
        }

        // Add keyboard event listener
        window.addEventListener("keydown", handleKeyboard);

        // Handle async operations without awaiting
        (async () => {
            // Fetch likes FIRST and wait for it to complete if user is connected
            if ($contractId && !likesLoaded) {
                likes = await fetch(`${import.meta.env.PUBLIC_API_URL}/likes`, {
                    credentials: "include",
                }).then(async (res) => {
                    if (res.ok) return res.json();
                    return [];
                });
                likesLoaded = true;
            }

            // Check for autoplay parameter in URL
            const urlParams = new URLSearchParams(window.location.search);
            const shouldAutoplay = urlParams.get("autoplay") === "true";

            // Load track data dynamically - this now runs AFTER likes are loaded
            const loadPromises = mixtape.tracks.map(async (track, index) => {
                loadingTracks.add(track.id);
                loadingTracks = loadingTracks; // Trigger reactivity

                try {
                    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${track.id}`, {
                        credentials: "include",
                    });
                    if (response.ok) {
                        const fullData = await response.json();
                        const d1 = fullData?.d1;
                        const kv_do = fullData?.kv_do;

                        // Store simplified track data for display
                        const trackData: SmolTrackData = {
                            id: track.id,
                            title: kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null,
                            creator: d1?.Address ?? null,
                            coverUrl: `${import.meta.env.PUBLIC_API_URL}/image/${track.id}.png`,
                            audioUrl: null, // Not needed for display
                            lyrics: kv_do?.lyrics ? {
                                title: kv_do.lyrics.title,
                                style: kv_do.lyrics.style,
                            } : null,
                        };

                        trackDataMap.set(track.id, trackData);

                        // Check if this track is in the user's likes (prefer /likes endpoint, fallback to individual response)
                        const isLiked = likesLoaded ? likes.includes(track.id) : (fullData?.liked || false);

                        // Store full data for playback (compatible with BarAudioPlayer)
                        mixtapeTracks[index] = {
                            Id: track.id,
                            Title: trackData.title,
                            Song_1: d1?.Song_1,
                            Liked: isLiked,
                            ...d1
                        };

                        // Initialize liked state
                        trackLikedStates.set(track.id, isLiked);

                        // Track mint status
                        const mintStatus = {
                            minted: Boolean(d1?.Mint_Token && d1?.Mint_Amm),
                            minting: false,
                            mintToken: d1?.Mint_Token || null,
                            mintAmm: d1?.Mint_Amm || null,
                        };
                        trackMintStatus.set(track.id, mintStatus);
                        trackMintStatus = trackMintStatus;

                        // If minted and user is connected, fetch balance
                        if (mintStatus.minted && mintStatus.mintToken && $contractId) {
                            await updateTrackBalance(track.id, mintStatus.mintToken);
                        }
                    } else {
                        trackDataMap.set(track.id, null);
                    }
                } catch (error) {
                    trackDataMap.set(track.id, null);
                } finally {
                    trackDataMap = trackDataMap; // Trigger reactivity
                    loadingTracks.delete(track.id);
                    loadingTracks = loadingTracks; // Trigger reactivity
                }
            });

            // If autoplay is requested, wait for at least the first track to load
            if (shouldAutoplay) {
                // Wait for first track to load
                await Promise.race([loadPromises[0], new Promise(resolve => setTimeout(resolve, 5000))]);

                // Remove autoplay parameter from URL
                urlParams.delete("autoplay");
                const newUrl = window.location.pathname + (urlParams.toString() ? "?" + urlParams.toString() : "");
                window.history.replaceState({}, "", newUrl);

                // Trigger play all after a short delay to ensure audio elements are bound
                setTimeout(() => handlePlayAll(), 500);
            }
        })();

        return () => {
            window.removeEventListener("keydown", handleKeyboard);

            // Clean up all mint polling
            for (const trackId of mintIntervals.keys()) {
                clearMintPolling(trackId);
            }
        };
    });

    onDestroy(() => {
        // Clean up all mint polling on destroy
        for (const trackId of mintIntervals.keys()) {
            clearMintPolling(trackId);
        }
    });

    $: coverUrls = mixtape
        ? Array.from({ length: 4 }, (_, i) => {
              const trackData = mixtape.tracks[i]
                  ? trackDataMap.get(mixtape.tracks[i].id)
                  : null;
              return trackData?.coverUrl ?? null;
          })
        : [];

    function handlePlayAll() {
        if (!mixtape || mixtape.tracks.length === 0) return;

        // Find first playable track
        const firstTrackIndex = mixtapeTracks.findIndex(t => t?.Song_1);

        if (firstTrackIndex === -1) {
            alert("No playable tracks found yet. Please wait for tracks to load.");
            return;
        }

        isPlayingAll = true;
        currentTrackIndex = firstTrackIndex;
        selectSong(mixtapeTracks[firstTrackIndex]);
    }

    function stopPlayAll() {
        isPlayingAll = false;
        selectSong(null);
        currentTrackIndex = -1;
    }

    function handleTrackClick(index: number) {
        const track = mixtapeTracks[index];
        if (!track || !track.Song_1) return;

        // If clicking the currently selected track, toggle play/pause
        if ($currentSong?.Id === track.Id) {
            togglePlayPause();
        } else {
            // Otherwise, select and play the new track
            currentTrackIndex = index;
            isPlayingAll = true;
            selectSong(track);
        }
    }

    function playNext() {
        if (!mixtape) return;

        // Find the next track with audio
        for (let i = currentTrackIndex + 1; i < mixtapeTracks.length; i++) {
            if (mixtapeTracks[i]?.Song_1) {
                currentTrackIndex = i;
                selectSong(mixtapeTracks[i]);
                return;
            }
        }

        // If Play All is enabled, wrap around to beginning
        if (isPlayingAll) {
            for (let i = 0; i <= currentTrackIndex; i++) {
                if (mixtapeTracks[i]?.Song_1) {
                    currentTrackIndex = i;
                    selectSong(mixtapeTracks[i]);
                    return;
                }
            }
        }

        // No more tracks
        isPlayingAll = false;
        currentTrackIndex = -1;
    }

    function playPrevious() {
        if (!mixtape || currentTrackIndex < 0) return;

        // Find the previous track with audio
        for (let i = currentTrackIndex - 1; i >= 0; i--) {
            if (mixtapeTracks[i]?.Song_1) {
                currentTrackIndex = i;
                selectSong(mixtapeTracks[i]);
                return;
            }
        }

        // Wrap around to end
        for (let i = mixtapeTracks.length - 1; i >= currentTrackIndex; i--) {
            if (mixtapeTracks[i]?.Song_1) {
                currentTrackIndex = i;
                selectSong(mixtapeTracks[i]);
                return;
            }
        }
    }

    function handleKeyboard(event: KeyboardEvent) {
        // Ignore if user is typing in an input/textarea
        const target = event.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
            return;
        }

        switch (event.key) {
            case " ":
                event.preventDefault();
                togglePlayPause();
                break;
            case "ArrowRight":
                event.preventDefault();
                playNext();
                break;
            case "ArrowLeft":
                event.preventDefault();
                playPrevious();
                break;
        }
    }

    function handlePurchaseClick() {
        if (!$contractId || !$keyId) {
            alert("Connect your wallet to purchase this mixtape");
            return;
        }

        showPurchaseModal = true;
    }

    async function handlePurchaseConfirm() {
        if (!mixtape || !$contractId || !$keyId) return;

        const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
        if (!smolContractId) {
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
                await mintAllTracksWithProgress();

                // Wait for all tracks to be minted with timeout
                const startTime = Date.now();
                const timeout = MINT_POLL_TIMEOUT;

                while (Date.now() - startTime < timeout) {
                    const allMinted = mixtape.tracks.every(track => {
                        const status = trackMintStatus.get(track.id);
                        return status?.minted;
                    });

                    if (allMinted) {
                        break;
                    }

                    await new Promise(resolve => setTimeout(resolve, MINT_POLL_INTERVAL));
                }

                // Check if all tracks are now minted
                const unmintedTracks = mixtape.tracks.filter(track => {
                    const status = trackMintStatus.get(track.id);
                    return !status?.minted;
                });

                if (unmintedTracks.length > 0) {
                    throw new Error(`Some tracks are still minting. Please wait and try again.`);
                }

                purchaseCompletedSteps.add("mint");
                purchaseCompletedSteps = purchaseCompletedSteps;
            }

            // After minting completes, refresh balances for all minted tracks
            console.log("Refreshing balances after minting...");
            const balanceUpdatePromises = mixtape.tracks.map(async (track) => {
                const status = trackMintStatus.get(track.id);
                if (status?.minted && status.mintToken) {
                    await updateTrackBalance(track.id, status.mintToken);
                }
            });
            await Promise.all(balanceUpdatePromises);
            console.log("Balances refreshed");

            // Build the tokens array for swap_them_in - only include tokens we don't own
            const tokensOut: string[] = [];

            for (const track of mixtape.tracks) {
                const status = trackMintStatus.get(track.id);
                const balance = trackBalances.get(track.id) || 0n;

                // Only include tokens we don't already own
                if (status?.mintToken && balance === 0n) {
                    tokensOut.push(status.mintToken);
                }
            }

            // Step 2: Purchase remaining tracks
            if (tokensOut.length > 0) {
                purchaseCurrentStep = "purchase";
                await purchaseTracksInBatches(tokensOut, smolContractId);
                purchaseCompletedSteps.add("purchase");
                purchaseCompletedSteps = purchaseCompletedSteps;
            }

            // Refresh balances after successful purchase
            await refreshAllBalances();

            // Final step
            purchaseCurrentStep = "complete";
            purchaseCompletedSteps.add("complete");
            purchaseCompletedSteps = purchaseCompletedSteps;

            setTimeout(() => {
                showPurchaseModal = false;
                isPurchasing = false;
                purchaseCurrentStep = "";
                purchaseCompletedSteps = new Set();
            }, 2000);

        } catch (error) {
            console.error("Purchase error:", error);
            alert(error instanceof Error ? error.message : String(error));
            isPurchasing = false;
        }
    }

    async function mintAllTracksWithProgress() {
        // Don't pre-mark as complete - let pollTrackMintStatus handle it
        await mintAllTracks();
    }

    async function purchaseTracksInBatches(tokensOut: string[], smolContractId: string) {
        if (!mixtape || !$contractId || !$keyId) return;

        const BATCH_SIZE = 9;

        // Build arrays of tokens and their corresponding comet addresses
        const tokenData: Array<{ token: string; comet: string; trackId: string }> = [];

        for (const track of mixtape.tracks) {
            const status = trackMintStatus.get(track.id);
            if (status?.mintToken && status?.mintAmm && tokensOut.includes(status.mintToken)) {
                tokenData.push({
                    token: status.mintToken,
                    comet: status.mintAmm,
                    trackId: track.id
                });
            }
        }

        const chunks: Array<typeof tokenData> = [];
        for (let i = 0; i < tokenData.length; i += BATCH_SIZE) {
            chunks.push(tokenData.slice(i, i + BATCH_SIZE));
        }

        console.log(`Processing ${tokenData.length} purchases in ${chunks.length} batch(es) of up to ${BATCH_SIZE}`);

        // Process each chunk sequentially
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            console.log(`Processing purchase batch ${chunkIndex + 1}/${chunks.length} with ${chunk.length} token(s)`);

            try {
                const tokensOutChunk = chunk.map(d => d.token);
                const cometAddressesChunk = chunk.map(d => d.comet);

                await purchaseBatch(tokensOutChunk, cometAddressesChunk, smolContractId);

                // Mark substeps as complete
                for (const data of chunk) {
                    purchaseCompletedSteps.add(`purchase-${data.trackId}`);
                }
                purchaseCompletedSteps = purchaseCompletedSteps;

            } catch (error) {
                console.error(`Error processing purchase batch ${chunkIndex + 1}:`, error);
                throw error;
            }
        }
    }

    async function purchaseBatch(tokensOut: string[], cometAddresses: string[], smolContractId: string) {
        if (!$contractId || !$keyId) return;

        const costPerToken = 33_0000000n; // 33 KALE per token

        // Create the swap_them_in transaction
        const smolClient = new SmolClient({
            contractId: smolContractId,
            rpcUrl: import.meta.env.PUBLIC_RPC_URL,
            networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
        });

        const tx = await smolClient.swap_them_in({
            user: $contractId,
            comet_addresses: cometAddresses,
            tokens_out: tokensOut,
            token_amount_in: costPerToken, // Per token, not cumulative
            fee_recipients: undefined,
        });

        const { rpc } = await import("../../utils/base");
        const { account, server } = await import("../../utils/passkey-kit");

        const { sequence } = await rpc.getLatestLedger();
        await account.sign(tx, {
            keyId: $keyId,
            expiration: sequence + 60,
        });

        // Log the XDR for inspection
        const xdrString = tx.built?.toXDR();
        console.log("Purchase Batch Transaction XDR:", xdrString);
        console.log("Tokens in batch:", tokensOut);

        // Submit transaction via passkey server
        await server.send(tx);
    }

    async function mintAllTracks() {
        if (!mixtape || !$contractId || !$keyId) return;

        const smolContractId = import.meta.env.PUBLIC_SMOL_CONTRACT_ID;
        if (!smolContractId) {
            console.error("Missing PUBLIC_SMOL_CONTRACT_ID env var");
            return;
        }

        // Find all tracks that need minting
        const tracksToMint = mixtape.tracks.filter(track => {
            const status = trackMintStatus.get(track.id);
            return !status?.minted && !status?.minting;
        });

        if (tracksToMint.length === 0) return;

        // Get track data for all tracks to mint
        const tracksWithData: Array<{ track: typeof mixtape.tracks[0], trackData: any }> = [];
        for (const track of tracksToMint) {
            const trackData = mixtapeTracks.find(t => t?.Id === track.id);
            if (!trackData?.Address) {
                console.warn(`No creator address for track ${track.id}`);
                continue;
            }
            tracksWithData.push({ track, trackData });
        }

        if (tracksWithData.length === 0) return;

        // Mark all tracks as minting upfront
        for (const { track } of tracksWithData) {
            mintingTracks.add(track.id);
            const status = trackMintStatus.get(track.id) || { minted: false, minting: true, mintToken: null, mintAmm: null };
            status.minting = true;
            trackMintStatus.set(track.id, status);
        }
        mintingTracks = mintingTracks;
        trackMintStatus = trackMintStatus;

        // Process in chunks of 5
        const CHUNK_SIZE = 5;
        const chunks: Array<Array<{ track: typeof mixtape.tracks[0], trackData: any }>> = [];

        for (let i = 0; i < tracksWithData.length; i += CHUNK_SIZE) {
            chunks.push(tracksWithData.slice(i, i + CHUNK_SIZE));
        }

        console.log(`Processing ${tracksWithData.length} mints in ${chunks.length} batch(es) of up to ${CHUNK_SIZE}`);

        // Process each chunk sequentially
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            console.log(`Processing batch ${chunkIndex + 1}/${chunks.length} with ${chunk.length} track(s)`);

            try {
                await mintBatch(chunk, smolContractId);
            } catch (error) {
                console.error(`Error processing batch ${chunkIndex + 1}:`, error);

                // Mark tracks in failed batch as not minting
                for (const { track } of chunk) {
                    const status = trackMintStatus.get(track.id);
                    if (status) {
                        status.minting = false;
                        trackMintStatus.set(track.id, status);
                    }
                    mintingTracks.delete(track.id);
                }
                trackMintStatus = trackMintStatus;
                mintingTracks = mintingTracks;

                // Continue to next batch instead of stopping
                alert(`Batch ${chunkIndex + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    async function mintBatch(
        tracksWithData: Array<{ track: MixtapeTrack, trackData: any }>,
        smolContractId: string
    ) {
        if (!$contractId || !$keyId) return;

        // Import dependencies
        const { Asset } = await import("@stellar/stellar-sdk/minimal");
        const { rpc } = await import("../../utils/base");
        const { account } = await import("../../utils/passkey-kit");

        // Prepare arrays for coin_them
        const assetBytesArray: Buffer[] = [];
        const saltsArray: Buffer[] = [];
        const feeRulesArray: Array<{ fee_asset: string; recipients: Array<{ percent: bigint; recipient: string }> } | undefined> = [];
        const issuer = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
        const kaleSacId = import.meta.env.PUBLIC_KALE_SAC_ID;

        for (const { track, trackData } of tracksWithData) {
            const salt = Buffer.from(track.id.padStart(64, "0"), "hex");
            if (salt.length !== 32) {
                throw new Error(`Invalid smol identifier for minting: ${track.id}`);
            }

            const assetCode = track.id.padStart(64, "0").substring(0, 12);
            const asset = new Asset(assetCode, issuer);

            assetBytesArray.push(Buffer.from(asset.toXDRObject().toXDR()));
            saltsArray.push(salt);

            // Build fee_rule for this track
            const creatorAddress = trackData.Address;

            if (creatorAddress === $contractId) {
                // Same address - give 50% to the single recipient
                feeRulesArray.push({
                    fee_asset: kaleSacId,
                    recipients: [{
                        percent: 50_00000n, // 50% in stroop format (6 decimals)
                        recipient: creatorAddress,
                    }],
                });
            } else {
                // Different addresses - split 25% each
                feeRulesArray.push({
                    fee_asset: kaleSacId,
                    recipients: [
                        {
                            percent: 25_00000n, // 25% to creator
                            recipient: creatorAddress,
                        },
                        {
                            percent: 25_00000n, // 25% to minter (user)
                            recipient: $contractId,
                        },
                    ],
                });
            }
        }

        // Create SmolClient and call coin_them
        const smolClient = new SmolClient({
            contractId: smolContractId,
            rpcUrl: import.meta.env.PUBLIC_RPC_URL,
            networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
        });

        let at = await smolClient.coin_them({
            user: $contractId,
            asset_bytes: assetBytesArray,
            salts: saltsArray,
            fee_rules: feeRulesArray,
        });

        // Sign the transaction
        const { sequence } = await rpc.getLatestLedger();
        at = await account.sign(at, {
            keyId: $keyId,
            expiration: sequence + 60,
        });

        const xdrString = at.built?.toXDR();

        if (!xdrString) {
            throw new Error("Failed to build signed coin_them transaction");
        }

        // Log the XDR for inspection
        console.log("Batch Mint Transaction XDR:", xdrString);
        console.log("Tracks in batch:", tracksWithData.map(({ track }) => track.id));

        // Submit to backend
        const response = await fetch(
            `${import.meta.env.PUBLIC_API_URL}/mint`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    xdr: xdrString,
                    ids: tracksWithData.map(({ track }) => track.id)
                }),
            },
        );

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "Failed to start batch mint workflow");
        }

        // Start polling for all tracks in this batch
        for (const { track } of tracksWithData) {
            const interval = setInterval(() => pollTrackMintStatus(track.id), MINT_POLL_INTERVAL);
            mintIntervals.set(track.id, interval);

            const timeout = setTimeout(() => {
                clearMintPolling(track.id);
                const status = trackMintStatus.get(track.id);
                if (status) {
                    status.minting = false;
                    trackMintStatus.set(track.id, status);
                    trackMintStatus = trackMintStatus;
                }
                mintingTracks.delete(track.id);
                mintingTracks = mintingTracks;
            }, MINT_POLL_TIMEOUT);
            mintTimeouts.set(track.id, timeout);

            // Do initial poll
            await pollTrackMintStatus(track.id);
        }
    }

    async function pollTrackMintStatus(trackId: string) {
        try {
            const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${trackId}`, {
                credentials: "include",
            });

            if (response.ok) {
                const data = await response.json();
                const d1 = data?.d1;

                if (d1?.Mint_Token && d1?.Mint_Amm) {
                    const status = trackMintStatus.get(trackId) || { minted: false, minting: false, mintToken: null, mintAmm: null };
                    status.minted = true;
                    status.minting = false;
                    status.mintToken = d1.Mint_Token;
                    status.mintAmm = d1.Mint_Amm;
                    trackMintStatus.set(trackId, status);
                    trackMintStatus = trackMintStatus;

                    clearMintPolling(trackId);
                    mintingTracks.delete(trackId);
                    mintingTracks = mintingTracks;

                    // Mark substep as complete if we're in purchase flow
                    if (isPurchasing) {
                        purchaseCompletedSteps.add(`mint-${trackId}`);
                        purchaseCompletedSteps = purchaseCompletedSteps;
                    }

                    // Update balance for this track
                    await updateTrackBalance(trackId, d1.Mint_Token);

                    // Update the track data as well
                    const index = mixtapeTracks.findIndex(t => t?.Id === trackId);
                    if (index !== -1 && mixtapeTracks[index]) {
                        mixtapeTracks[index].Mint_Token = d1.Mint_Token;
                        mixtapeTracks[index].Mint_Amm = d1.Mint_Amm;
                    }
                }
            }
        } catch (error) {
            console.error(`Error polling mint status for ${trackId}:`, error);
        }
    }

    async function updateTrackBalance(trackId: string, mintToken: string) {
        if (!$contractId) return;

        try {
            const mintTokenClient = sac.getSACClient(mintToken);
            const balance = await getTokenBalance(mintTokenClient, $contractId);
            trackBalances.set(trackId, balance);
            trackBalances = trackBalances;
        } catch (error) {
            console.error(`Error fetching balance for ${trackId}:`, error);
            trackBalances.set(trackId, 0n);
            trackBalances = trackBalances;
        }
    }

    async function refreshAllBalances() {
        if (!mixtape || !$contractId) return;

        console.log("Refreshing all balances...");
        const balanceUpdatePromises = mixtape.tracks.map(async (track) => {
            const status = trackMintStatus.get(track.id);
            if (status?.minted && status.mintToken) {
                await updateTrackBalance(track.id, status.mintToken);
            }
        });
        await Promise.all(balanceUpdatePromises);
        console.log("All balances refreshed");
    }

    function clearMintPolling(trackId: string) {
        const interval = mintIntervals.get(trackId);
        if (interval) {
            clearInterval(interval);
            mintIntervals.delete(trackId);
        }

        const timeout = mintTimeouts.get(trackId);
        if (timeout) {
            clearTimeout(timeout);
            mintTimeouts.delete(trackId);
        }
    }


    // Monitor current playing song and update track index
    $: if ($currentSong && mixtape) {
        const index = mixtapeTracks.findIndex(t => t?.Id === $currentSong.Id);
        if (index !== -1 && index !== currentTrackIndex) {
            currentTrackIndex = index;
        }

        // Sync liked state from currentSong to trackLikedStates
        if ($currentSong.Id && $currentSong.Liked !== undefined) {
            const currentLikedState = trackLikedStates.get($currentSong.Id);
            if (currentLikedState !== $currentSong.Liked) {
                trackLikedStates.set($currentSong.Id, $currentSong.Liked);
                trackLikedStates = trackLikedStates;
            }
        }

        // Update media session metadata
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: $currentSong.Title || "Unknown Track",
                artist: mixtape.title || "Mixtape",
                album: mixtape.title || "Smol Mixtape",
                artwork: [
                    {
                        src: `${import.meta.env.PUBLIC_API_URL}/image/${$currentSong.Id}.png?scale=8`,
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
            });
        }
    }

    // Detect when playback stops completely
    $: if (!$playingId && !$currentSong) {
        isPlayingAll = false;
        currentTrackIndex = -1;

        // Clear media session metadata
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = null;
        }
    }

    // Auto-disable Play All mode when user pauses (playingId becomes null but currentSong exists)
    $: if (!$playingId && $currentSong && isPlayingAll) {
        isPlayingAll = false;
    }

    // Re-enable Play All mode when user resumes playing
    $: if ($playingId && $currentSong && !isPlayingAll && currentTrackIndex >= 0) {
        isPlayingAll = true;
    }

    function truncateAddress(address: string | null): string {
        if (!address) return "";
        if (address.length <= 12) return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
</script>

{#if !mixtape}
    <div class="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">
        <p>We couldn't find that mixtape. Double-check the link or publish a new one.</p>
    </div>
{:else}
    <div class="mx-auto flex max-w-4xl flex-col gap-4 px-2 py-4 md:gap-8 md:px-4 md:py-8">
        <header class="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-xl md:flex-row md:gap-6 md:rounded-3xl md:p-6">
            <div class="grid h-auto w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl bg-slate-800 md:h-48 md:w-48 md:shrink-0">
                {#each Array.from({ length: 4 }) as _, index}
                    <div class="aspect-square bg-slate-900">
                        {#if coverUrls[index]}
                            <img
                                src={`${coverUrls[index]}${coverUrls[index]?.includes("?") ? "" : "?scale=4"}`}
                                alt={mixtape.title}
                                class="h-full w-full object-cover pixelated"
                                on:error={(e) => {
                                    // @ts-ignore
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        {:else}
                            <div class="flex h-full w-full items-center justify-center text-xs text-slate-500">
                                {#if mixtape.tracks[index] && loadingTracks.has(mixtape.tracks[index].id)}
                                    <Loader classNames="w-6 h-6" />
                                {:else}
                                    SMOL
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>

            <div class="flex flex-1 flex-col gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white">{mixtape.title}</h1>
                    <p class="mt-2 text-sm text-slate-400">{mixtape.description}</p>
                </div>

                <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                    {#if isPlayingAll && isAnyPlaying}
                        <button
                            class="flex items-center justify-center gap-2 rounded bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
                            on:click={stopPlayAll}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                                <rect width="6" height="12" x="2" y="2" rx="1"/>
                                <rect width="6" height="12" x="8" y="2" rx="1"/>
                            </svg>
                            Stop Playing
                        </button>
                    {:else}
                        <button
                            class="flex items-center justify-center gap-2 rounded bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-300"
                            on:click={handlePlayAll}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                                <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732Z"/>
                            </svg>
                            Play All
                        </button>
                    {/if}
                    {#if fullyOwned && $contractId}
                        <span class="relative flex items-center justify-center gap-2 rounded px-6 py-2 text-sm font-medium bg-gradient-to-r from-slate-400 to-slate-600">
                            Fully Owned
                            <img
                                src="/owned-badge.png"
                                alt="Fully Owned Badge"
                                class="absolute -top-4 -right-7 w-12 h-12 transform rotate-12 z-10"
                            />
                        </span>
                    {:else}
                        <button
                            class="flex items-center justify-center gap-2 rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            on:click={handlePurchaseClick}
                            disabled={isPurchasing}
                        >
                            {#if isPurchasing}
                                <Loader classNames="w-4 h-4" />
                                Processing...
                            {:else}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                                    <path d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.18 3a65.25 65.25 0 0113.36 1.412.75.75 0 01.58.875 48.645 48.645 0 01-1.618 6.2.75.75 0 01-.712.513H6a2.503 2.503 0 00-2.292 1.5H17.25a.75.75 0 010 1.5H2.76a.75.75 0 01-.748-.807 4.002 4.002 0 012.716-3.486L3.626 2.716a.25.25 0 00-.248-.216H1.75A.75.75 0 011 1.75zM6 17.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                                </svg>
                                Buy Mixtape
                            {/if}
                        </button>
                    {/if}
                </div>
            </div>
        </header>

        <section class="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg md:rounded-3xl md:p-6">
            <header class="mb-4 flex items-center justify-between">
                <h2 class="text-xl font-semibold text-white">Tracklist</h2>
                <span class="text-xs uppercase tracking-wide text-slate-500">{mixtape.trackCount} Smol{mixtape.trackCount === 1 ? "" : "s"}</span>
            </header>

            {#if mixtape.tracks.length === 0}
                <p class="rounded border border-dashed border-slate-600 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
                    Track details will appear here after the backend is connected.
                </p>
            {:else}
                <ul class="flex flex-col gap-3">
                    {#each mixtape.tracks as track, index (track.id)}
                        {@const trackData = trackDataMap.get(track.id)}
                        {@const isLoading = loadingTracks.has(track.id)}
                        {@const isCurrentTrack = $currentSong?.Id === track.id}
                        {@const isCurrentlyPlaying = isCurrentTrack && $playingId === track.id}
                        {@const mintStatus = trackMintStatus.get(track.id)}
                        {@const balance = trackBalances.get(track.id) || 0n}
                        <li
                            class="flex items-stretch gap-3 rounded-xl border p-3 transition-colors cursor-pointer md:items-center md:p-4 {isCurrentTrack ? 'border-lime-500 bg-slate-800' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-800/60'}"
                            on:click={() => handleTrackClick(index)}
                        >
                            <a
                                href={`/${track.id}`}
                                target="_blank"
                                class="relative w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900 group md:h-16 md:w-16"
                                on:click|stopPropagation
                            >
                                {#if isLoading}
                                    <div class="flex h-full w-full items-center justify-center">
                                        <Loader classNames="w-6 h-6" />
                                    </div>
                                {:else if trackData?.coverUrl}
                                    <img
                                        src={`${trackData.coverUrl}${trackData.coverUrl.includes("?") ? "" : "?scale=4"}`}
                                        alt={trackData.title ?? "Track"}
                                        class="h-full w-full object-cover pixelated transition-transform group-hover:scale-110"
                                        on:error={(e) => {
                                            // @ts-ignore
                                            e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect fill="%23334155" width="64" height="64"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-family="monospace" font-size="12">SMOL</text></svg>';
                                        }}
                                    />
                                {:else}
                                    <div class="flex h-full w-full items-center justify-center text-xs text-slate-500">
                                        {index + 1}
                                    </div>
                                {/if}
                            </a>

                            <div class="flex flex-1 flex-col gap-2 min-w-0">
                                <div class="flex flex-col min-w-0">
                                    <div class="font-semibold text-white truncate">
                                        {#if isLoading}
                                            Loading...
                                        {:else}
                                            {trackData?.title ?? "Unknown Track"}
                                        {/if}
                                    </div>
                                    {#if trackData?.creator}
                                        <span class="text-xs text-slate-400 truncate" title={trackData.creator}>
                                            {truncateAddress(trackData.creator)}
                                        </span>
                                    {/if}
                                    {#if trackData?.lyrics?.style && trackData.lyrics.style.length > 0}
                                        <div class="mt-1 flex flex-wrap gap-1">
                                            {#each trackData.lyrics.style.slice(0, 3) as tag}
                                                <span class="text-[10px] bg-slate-700/50 text-slate-300 px-2 py-0.5 rounded-full">
                                                    {tag}
                                                </span>
                                            {/each}
                                            {#if mintStatus?.minted}
                                                <span class="text-[10px] bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                                                    Minted
                                                </span>
                                            {/if}
                                            {#if mintStatus?.minted && balance > 0n}
                                                <TokenBalancePill balance={balance} />
                                            {/if}
                                        </div>
                                    {:else if mintStatus?.minted || balance > 0n}
                                        <div class="mt-1 flex flex-wrap gap-1">
                                            {#if mintStatus?.minted}
                                                <span class="text-[10px] bg-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                                                    Minted
                                                </span>
                                            {/if}
                                            {#if balance > 0n}
                                                <TokenBalancePill balance={balance} />
                                            {/if}
                                        </div>
                                    {/if}
                                </div>

                                <div class="flex items-center justify-between gap-2 md:hidden">
                                    <div class="flex items-center gap-2">
                                        {#if mixtapeTracks[index]?.Song_1}
                                            <div class="relative z-2" on:click|stopPropagation>
                                                <MiniAudioPlayer
                                                    id={track.id}
                                                    playing_id={$playingId}
                                                    songToggle={() => handleTrackClick(index)}
                                                    songNext={playNext}
                                                    progress={$currentSong?.Id === track.id ? $audioProgress : 0}
                                                />
                                            </div>
                                        {/if}

                                        <div on:click|stopPropagation>
                                            <LikeButton
                                                smolId={track.id}
                                                liked={trackLikedStates.get(track.id) || false}
                                                classNames="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
                                                on:likeChanged={(e) => {
                                                    trackLikedStates.set(e.detail.smolId, e.detail.liked);
                                                    trackLikedStates = trackLikedStates;

                                                    // Update mixtapeTracks array as well
                                                    if (mixtapeTracks[index]) {
                                                        mixtapeTracks[index].Liked = e.detail.liked;
                                                    }

                                                    // If this is the currently playing song, update currentSong
                                                    if ($currentSong?.Id === e.detail.smolId) {
                                                        $currentSong.Liked = e.detail.liked;
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div class="text-sm text-slate-500 font-mono">
                                        #{index + 1}
                                    </div>
                                </div>
                            </div>

                            <div class="hidden md:flex items-center gap-2">
                                {#if mixtapeTracks[index]?.Song_1}
                                    <div class="relative z-2" on:click|stopPropagation>
                                        <MiniAudioPlayer
                                            id={track.id}
                                            playing_id={$playingId}
                                            songToggle={() => handleTrackClick(index)}
                                            songNext={playNext}
                                            progress={$currentSong?.Id === track.id ? $audioProgress : 0}
                                        />
                                    </div>
                                {/if}

                                <div on:click|stopPropagation>
                                    <LikeButton
                                        smolId={track.id}
                                        liked={trackLikedStates.get(track.id) || false}
                                        classNames="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
                                        on:likeChanged={(e) => {
                                            trackLikedStates.set(e.detail.smolId, e.detail.liked);
                                            trackLikedStates = trackLikedStates;

                                            // Update mixtapeTracks array as well
                                            if (mixtapeTracks[index]) {
                                                mixtapeTracks[index].Liked = e.detail.liked;
                                            }

                                            // If this is the currently playing song, update currentSong
                                            if ($currentSong?.Id === e.detail.smolId) {
                                                $currentSong.Liked = e.detail.liked;
                                            }
                                        }}
                                    />
                                </div>

                                <div class="text-sm text-slate-500 font-mono">
                                    #{index + 1}
                                </div>
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    </div>
{/if}

<BarAudioPlayer
    classNames="fixed z-30 p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
    songNext={playNext}
/>

<PurchaseModal
    isOpen={showPurchaseModal}
    {tracksToMint}
    {tracksToPurchase}
    isProcessing={isPurchasing}
    currentStep={purchaseCurrentStep}
    completedSteps={purchaseCompletedSteps}
    on:close={() => showPurchaseModal = false}
    on:confirm={handlePurchaseConfirm}
/>



