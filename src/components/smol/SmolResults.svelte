<script lang="ts">
    import type { Smol, SmolDetailResponse } from "../../types/domain";
    import {
        audioState,
        selectSong,
        togglePlayPause,
        isPlaying,
    } from "../../stores/audio.svelte.ts";
    import { navigate } from "astro:transitions/client";
    import { onDestroy } from "svelte";
    import RadioPlayer from "../radio/RadioPlayer.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import Loader from "../ui/Loader.svelte";
    import TokenBalancePill from "../ui/TokenBalancePill.svelte";
    import { userState, isAuthenticated } from "../../stores/user.svelte.ts";
    import { updateContractBalance } from "../../stores/balance.svelte.ts";
    import { useSmolMinting } from "../../hooks/useSmolMinting";
    import { sac } from "../../utils/passkey-kit";
    import { getTokenBalance } from "../../utils/balance";
    import { RPC_URL } from "../../utils/rpc";
    import MintTradeModal from "../MintTradeModal.svelte";
    import TipArtistModal from "../artist/TipArtistModal.svelte";

    let { id }: { id: string } = $props();

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

    // Data State
    let data = $state<SmolDetailResponse | null>(null);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showTradeModal = $state(false);
    let minting = $state(false);
    let showTipModal = $state(false);
    let tipArtistAddress = $state<string | null>(null);
    let activeTab = $state<"lyrics" | "metadata">("lyrics");
    let autoScroll = $state(false); // Enable auto-scroll (Default OFF)
    let tradeMintBalance = $state(0n); // Restored missing state

    // Polling state for generation-aware loading
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let retryCount = $state(0);
    let isPolling = $state(false);
    const MAX_RETRIES = 30; // 30 * 2s = 60s max
    const POLL_INTERVAL = 2000;

    // Context-aware back navigation
    let backContext = $state<{
        type: "radio" | "artist";
        label: string;
    } | null>(null);

    $effect(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const from = params.get("from");
            if (from === "radio") {
                backContext = { type: "radio", label: "Back to Radio" };
            } else if (from === "artist") {
                backContext = { type: "artist", label: "Back to Artist" };
            }
        }
    });

    const mintingHook = useSmolMinting();

    // Version Handling
    let selectedVersionId = $state<string | null>(null);

    const versions = $derived.by(() => {
        if (!data?.kv_do?.songs) return [];
        // Map song IDs to V1, V2 labels
        return data.kv_do.songs.map((s, i) => ({
            id: s.music_id,
            label: `V${i + 1}`,
            isBest: s.music_id === data?.d1?.Song_1,
            audio: s.audio,
        }));
    });

    // Set default version on load
    $effect(() => {
        if (!selectedVersionId && versions.length > 0) {
            const best = versions.find((v) => v.isBest);
            selectedVersionId = best ? best.id : versions[0].id;
        }
    });

    // Derived track object for player with DYNAMIC AUDIO
    const track = $derived.by(() => {
        if (!data?.d1) return null;

        let audioUrl = "";
        if (selectedVersionId) {
            audioUrl = `${API_URL}/song/${selectedVersionId}.mp3`;
        } else if (data?.d1?.Song_1) {
            audioUrl = `${API_URL}/song/${data.d1.Song_1}.mp3`;
        }

        return {
            ...data.d1,
            Liked: data.liked,
            Tags: data.kv_do?.lyrics?.style || [],
            Song_1: selectedVersionId || data.d1?.Song_1 || "",
            kv_do: data.kv_do,
        } as Smol;
    });

    // RESTORED LOGIC FROM ORIGINAL FILE
    const isOwner = $derived(data?.d1?.Address === userState.contractId);
    const tradeReady = $derived(
        Boolean(id && data?.d1?.Mint_Amm && data?.d1?.Mint_Token),
    );
    const minted = $derived(
        Boolean(data?.d1?.Mint_Token || data?.d1?.Mint_Amm),
    );

    // Lyrics
    let lyricsContainerRef = $state<HTMLDivElement | null>(null);
    const lyrics = $derived(data?.kv_do?.lyrics?.lyrics || "");
    const lyricsLines = $derived(
        lyrics
            ? lyrics
                  .split("\n")
                  .map((l) => l.replace(/\[.*?\]/g, "").trim())
                  .filter((l) => l.length > 0)
            : [],
    );

    // Check if song is still generating - only poll if we're MISSING essential data
    function isStillGenerating(response: SmolDetailResponse | null): boolean {
        if (!response) return true;

        // If wf.status is complete or undefined (old songs), we're done
        const status = response.wf?.status;
        if (status === "complete" || status === undefined) {
            return false;
        }

        // If we have d1.Title OR kv_do data, song has partial data ready to display
        // kv_do contains image_base64 and lyrics which arrive early during generation
        if (
            response.d1?.Title ||
            response.kv_do?.image_base64 ||
            response.kv_do?.lyrics?.title
        ) {
            return false; // We have enough to display
        }

        // Still generating - no data yet
        return (
            status === "queued" ||
            status === "running" ||
            status === "waiting" ||
            status === "paused"
        );
    }

    // Check if generation failed
    function isGenerationFailed(response: SmolDetailResponse | null): boolean {
        if (!response) return false;
        const status = response.wf?.status;
        return status === "errored" || status === "terminated";
    }

    // Stop polling
    function stopPolling() {
        if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
        }
        isPolling = false;
    }

    async function fetchData(isRetry = false) {
        if (!isRetry) {
            loading = true;
            error = null;
            retryCount = 0;
        }

        try {
            const res = await fetch(`${API_URL}/${id}`, {
                credentials: "include",
                cache: "no-store",
            });

            if (!res.ok) {
                // 404 might mean song is still being created - start polling
                if (res.status === 404 && retryCount < MAX_RETRIES) {
                    isPolling = true;
                    startPolling();
                    return;
                }
                throw new Error(
                    res.status === 404
                        ? "Song not found"
                        : "Failed to load track",
                );
            }

            data = await res.json();

            // Check if still generating
            if (isStillGenerating(data) && retryCount < MAX_RETRIES) {
                isPolling = true;
                startPolling();
                return;
            }

            // Check if generation failed
            if (isGenerationFailed(data)) {
                stopPolling();
                error = "Generation failed. Please try again.";
                loading = false;
                return;
            }

            // Complete! Stop polling and show content
            stopPolling();
            loading = false;

            // Auto-play if track is ready
            if (track) {
                selectSong(track);
            }
        } catch (e: any) {
            // On error, try polling if we haven't exhausted retries
            if (retryCount < MAX_RETRIES && !error) {
                isPolling = true;
                startPolling();
            } else {
                stopPolling();
                error = e.message;
                loading = false;
            }
        }
    }

    function startPolling() {
        if (pollIntervalId) return; // Already polling

        pollIntervalId = setInterval(() => {
            retryCount++;

            if (retryCount >= MAX_RETRIES) {
                stopPolling();
                error = "Taking longer than expected. Click retry to continue.";
                loading = false;
                return;
            }

            fetchData(true);
        }, POLL_INTERVAL);
    }

    function retryFetch() {
        error = null;
        retryCount = 0;
        fetchData();
    }

    // Track last fetched ID to prevent duplicate fetches on re-renders
    let lastFetchedId: string | null = null;

    $effect(() => {
        if (id && id !== lastFetchedId) {
            lastFetchedId = id;
            // IMPORTANT: Clear old data to prevent showing stale content from previous song
            data = null;
            error = null;
            stopPolling();
            fetchData();
        }
    });

    // Cleanup on destroy
    onDestroy(() => {
        stopPolling();
        loading = false;
        data = null;
    });

    // Fetch mint balance
    $effect(() => {
        const mintToken = data?.d1?.Mint_Token;
        const contractId = userState.contractId;
        if (mintToken && contractId) {
            const client = sac.get().getSACClient(mintToken);
            getTokenBalance(client, contractId).then(
                (b) => (tradeMintBalance = b),
            );
        }
    });

    // Lyrics auto-scroll
    $effect(() => {
        const container = lyricsContainerRef;
        if (
            !container ||
            !isPlaying() ||
            lyricsLines.length === 0 ||
            !autoScroll
        )
            return;

        const intervalId = setInterval(() => {
            const progress = audioState.progress;
            const maxScroll = container.scrollHeight - container.clientHeight;
            container.scrollTop = (progress / 100) * maxScroll;
        }, 1000);

        return () => clearInterval(intervalId);
    });

    async function triggerMint() {
        if (!id || minting || minted) return;
        if (!userState.contractId) return alert("Connect wallet to mint");

        try {
            minting = true;
            await mintingHook.triggerMint(
                {
                    id,
                    contractId: userState.contractId,
                    keyId: userState.keyId!,
                    smolContractId:
                        import.meta.env.PUBLIC_SMOL_CONTRACT_ID ||
                        "CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA",
                    rpcUrl: RPC_URL,
                    networkPassphrase: import.meta.env
                        .PUBLIC_NETWORK_PASSPHRASE!,
                    creatorAddress: data?.d1?.Address || "",
                    kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID!,
                },
                () => fetchData(),
            );
        } catch (e: any) {
            alert(e.message);
        } finally {
            minting = false;
        }
    }

    async function togglePublic() {
        await fetch(`${API_URL}/${id}`, {
            method: "PUT",
            credentials: "include",
        });
        fetchData();
    }

    async function deleteSong() {
        if (!confirm("Delete this song?")) return;
        await fetch(`${API_URL}/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        window.location.href = "/";
    }

    function share() {
        // Create clean URL without query parameters for better social media compatibility
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;

        navigator
            .share?.({
                title: data?.d1?.Title,
                url: cleanUrl,
            })
            .catch(() => {
                navigator.clipboard.writeText(cleanUrl);
                alert("Link copied!");
            });
    }

    // Copy any value to clipboard with visual feedback
    let copiedField = $state<string | null>(null);
    let copiedFieldTimeout: ReturnType<typeof setTimeout> | null = null;
    async function copyToClipboard(
        value: string | undefined | null,
        fieldName: string,
    ) {
        if (!value) return;
        // Clear any existing timeout to prevent accumulation
        if (copiedFieldTimeout) clearTimeout(copiedFieldTimeout);
        try {
            await navigator.clipboard.writeText(value);
            copiedField = fieldName;
            copiedFieldTimeout = setTimeout(() => {
                copiedField = null;
                copiedFieldTimeout = null;
            }, 1500);
        } catch (e) {
            // Fallback for older browsers
            const textarea = document.createElement("textarea");
            textarea.value = value;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            copiedField = fieldName;
            copiedFieldTimeout = setTimeout(() => {
                copiedField = null;
                copiedFieldTimeout = null;
            }, 1500);
        }
    }
</script>

<div class="max-w-6xl mx-auto px-4 font-mono overflow-x-hidden">
    {#if loading}
        <div
            data-smol-loading
            class="flex flex-col items-center justify-center py-16 gap-6 animate-in fade-in duration-500"
        >
            <!-- Progressive loading card -->
            <div class="w-full max-w-md mx-auto">
                <div
                    class="relative bg-[#1a1a1a]/80 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl overflow-hidden"
                >
                    <!-- Animated gradient border -->
                    <div
                        class="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#d836ff]/20 via-transparent to-[#d836ff]/20 opacity-50 animate-pulse"
                    ></div>

                    <div class="relative flex items-center gap-6">
                        <!-- Artwork - use kv_do.image_base64 first (available during generation), then API image -->
                        {#if data?.kv_do?.image_base64}
                            <div
                                class="w-24 h-24 rounded-xl overflow-hidden shadow-lg ring-2 ring-[#d836ff]/30 shrink-0"
                            >
                                <img
                                    src="data:image/png;base64,{data.kv_do
                                        .image_base64}"
                                    alt="Loading artwork"
                                    class="w-full h-full object-cover animate-in fade-in duration-500"
                                />
                            </div>
                        {:else if data?.d1?.Title}
                            <div
                                class="w-24 h-24 rounded-xl overflow-hidden shadow-lg ring-2 ring-[#d836ff]/30 shrink-0"
                            >
                                <img
                                    src="{API_URL}/image/{id}.png?scale=8"
                                    alt="Loading artwork"
                                    class="w-full h-full object-cover animate-in fade-in duration-500"
                                    onerror={(e) =>
                                        ((
                                            e.currentTarget as HTMLElement
                                        ).style.display = "none")}
                                />
                            </div>
                        {:else}
                            <div
                                class="w-24 h-24 rounded-xl bg-gradient-to-br from-[#d836ff]/20 to-[#d836ff]/5 animate-pulse flex items-center justify-center shrink-0"
                            >
                                <svg
                                    class="w-8 h-8 text-[#d836ff]/40"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                                    />
                                </svg>
                            </div>
                        {/if}

                        <div class="flex-1 min-w-0">
                            <!-- Title - use kv_do.lyrics.title first (available during generation) -->
                            {#if data?.kv_do?.lyrics?.title || data?.d1?.Title}
                                <h3
                                    class="text-lg font-bold text-white truncate mb-1 animate-in fade-in slide-in-from-right-2 duration-500"
                                >
                                    {data?.kv_do?.lyrics?.title ||
                                        data?.d1?.Title}
                                </h3>
                            {:else}
                                <div
                                    class="h-6 w-3/4 bg-white/10 rounded animate-pulse mb-2"
                                ></div>
                            {/if}

                            <!-- Artist -->
                            {#if data?.d1?.Creator}
                                <p
                                    class="text-sm text-[#d836ff]/80 truncate mb-3 animate-in fade-in slide-in-from-right-2 duration-700"
                                >
                                    {data.d1.Creator}
                                </p>
                            {:else}
                                <div
                                    class="h-4 w-1/2 bg-white/5 rounded animate-pulse mb-3"
                                ></div>
                            {/if}

                            <!-- Status -->
                            <div class="flex items-center gap-2">
                                <div
                                    class="w-2 h-2 rounded-full bg-[#d836ff] animate-pulse shadow-[0_0_8px_#d836ff]"
                                ></div>
                                <span class="text-xs text-white/50">
                                    {#if isPolling}
                                        Finalizing track...
                                    {:else}
                                        Loading...
                                    {/if}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Progress steps -->
                    {#if isPolling}
                        <div class="mt-6 pt-4 border-t border-white/5">
                            <div
                                class="flex justify-between text-[10px] uppercase tracking-wider"
                            >
                                <span
                                    class="text-[#d836ff] flex items-center gap-1"
                                >
                                    <svg
                                        class="w-3 h-3"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path
                                            fill-rule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                    Created
                                </span>
                                <span
                                    class="{data?.kv_do?.image_base64
                                        ? 'text-[#d836ff]'
                                        : 'text-white/30'} flex items-center gap-1"
                                >
                                    {#if data?.kv_do?.image_base64}
                                        <svg
                                            class="w-3 h-3"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    {:else}
                                        <Loader
                                            classNames="w-3 h-3"
                                            textColor="text-white/30"
                                        />
                                    {/if}
                                    Artwork
                                </span>
                                <span
                                    class="{data?.kv_do?.lyrics?.title ||
                                    data?.d1?.Title
                                        ? 'text-[#d836ff]'
                                        : 'text-white/30'} flex items-center gap-1"
                                >
                                    {#if data?.kv_do?.lyrics?.title || data?.d1?.Title}
                                        <svg
                                            class="w-3 h-3"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    {:else}
                                        <Loader
                                            classNames="w-3 h-3"
                                            textColor="text-white/30"
                                        />
                                    {/if}
                                    Metadata
                                </span>
                                <span
                                    class="text-white/30 flex items-center gap-1"
                                >
                                    <Loader
                                        classNames="w-3 h-3"
                                        textColor="text-white/30"
                                    />
                                    Audio
                                </span>
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {:else if error}
        <div class="text-center py-32">
            <h2 class="text-2xl font-bold text-red-500 mb-4">Error</h2>
            <p class="text-white/40 mb-6">{error}</p>
            <div class="flex gap-4 justify-center">
                <button
                    onclick={retryFetch}
                    class="px-6 py-2 bg-[#d836ff] hover:bg-[#d836ff]/80 text-white rounded-lg font-medium transition-colors"
                >
                    Retry
                </button>
                <a
                    href="/"
                    class="px-6 py-2 border border-white/20 hover:border-[#d836ff] text-white/60 hover:text-[#d836ff] rounded-lg transition-colors"
                    >Back Home</a
                >
            </div>
        </div>
    {:else if data}
        <div class="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <!-- Main Portal -->
            <div
                class="reactive-glass border border-white/5 bg-[#1a1a1a] overflow-hidden rounded-2xl shadow-2xl"
            >
                <!-- Top Nav / Action Bar -->
                <div
                    class="flex items-center justify-between px-6 py-2 bg-black/40 border-b border-white/5"
                >
                    <div
                        class="flex items-center gap-4 min-w-0 overflow-hidden flex-1"
                    >
                        <div
                            class="text-[#d836ff] drop-shadow-[0_0_8px_#d836ff]"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                class="w-4 h-4"
                                fill="currentColor"
                            >
                                <path
                                    d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                                />
                            </svg>
                        </div>
                        <div class="flex items-baseline gap-3 overflow-hidden">
                            <span
                                class="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 whitespace-nowrap hidden sm:inline"
                                >Track Detail /</span
                            >
                            <span
                                class="text-xs font-bold text-white tracking-tight truncate"
                                >{data.d1?.Title || "Untitled"}</span
                            >
                            <span
                                class="text-[9px] text-[#d836ff]/60 uppercase tracking-widest flex items-center gap-1 shrink-0"
                            >
                                BY <a
                                    href="/artist/{data.d1?.Address}"
                                    onclick={(e) => {
                                        e.preventDefault();
                                        if (data?.d1?.Address) {
                                            navigate(
                                                `/artist/${data.d1.Address}?play=${id}`,
                                            );
                                        }
                                    }}
                                    class="hover:underline text-[#d836ff]"
                                    >{data.d1?.Address?.slice(0, 8) || "..."}</a
                                >
                            </span>
                        </div>

                        <div class="flex gap-2 ml-2">
                            {#if minted}
                                <span
                                    class="px-2 py-0.5 rounded bg-[#d836ff]/10 text-[#d836ff] text-[8px] border border-[#d836ff]/20 uppercase font-bold tracking-widest"
                                    >MINTED</span
                                >
                            {/if}
                            {#if data.kv_do?.nsfw?.safe === false}
                                <span
                                    class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[8px] border border-rose-500/20 uppercase font-bold tracking-widest"
                                    >NSFW</span
                                >
                            {/if}
                        </div>
                    </div>

                    <div class="flex items-center gap-4">
                        {#if isOwner}
                            <button
                                onclick={deleteSong}
                                class="text-[9px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-400"
                            >
                                Delete
                            </button>
                        {/if}
                    </div>
                </div>

                <div
                    class="flex flex-col lg:flex-row gap-2 lg:gap-8 items-stretch px-4 py-8 lg:p-6 h-auto lg:h-[580px]"
                >
                    <!-- Left: Player Column -->
                    <div class="w-full lg:w-1/2 flex flex-col">
                        <RadioPlayer
                            playlist={track ? [track] : []}
                            currentIndex={0}
                            accentColor="#d836ff"
                            onSelect={() => {}}
                            onNext={() => {
                                // Navigate to artist page with song ID to continue playback
                                if (data?.d1?.Address && id) {
                                    navigate(
                                        `/artist/${data.d1.Address}?play=${id}`,
                                    );
                                }
                            }}
                            onPrev={() => {
                                // Restart song on "Previous" click
                                if (audioState.audioElement) {
                                    audioState.audioElement.currentTime = 0;
                                    if (!isPlaying()) togglePlayPause();
                                }
                            }}
                            onTrade={tradeReady
                                ? () => (showTradeModal = true)
                                : undefined}
                            {versions}
                            currentVersionId={selectedVersionId || ""}
                            onVersionSelect={(id) => {
                                selectedVersionId = id;
                                // Force player update if needed
                                if (track) selectSong(track);
                            }}
                            onMint={!minted ? triggerMint : undefined}
                            isMinting={minting}
                            isAuthenticated={isAuthenticated()}
                            showMiniActions={false}
                            onTogglePublish={isOwner ? togglePublic : undefined}
                            onSetDefaultVersion={isOwner
                                ? async (vid) => {
                                      await fetch(`${API_URL}/${id}`, {
                                          method: "PUT",
                                          headers: {
                                              "Content-Type":
                                                  "application/json",
                                          },
                                          body: JSON.stringify({
                                              Song_1: vid,
                                          }),
                                          credentials: "include",
                                      });
                                      fetchData();
                                  }
                                : undefined}
                            isPublished={!!data.d1?.Public}
                            likeOnArt={false}
                            enableContextBack={true}
                            overlayControlsOnMobile={true}
                            onTip={() => {
                                if (!isAuthenticated()) {
                                    window.dispatchEvent(
                                        new CustomEvent("smol:request-login"),
                                    );
                                    return;
                                }
                                if (data?.d1?.Address) {
                                    tipArtistAddress = data.d1.Address;
                                    showTipModal = true;
                                }
                            }}
                            onToggleLike={(idx, liked) => {}}
                            onShare={share}
                        />

                        <!-- Desktop Action Bar Removed -->

                        <!-- Desktop Metadata Section (Moved from Tabs) -->
                        <div
                            class="hidden lg:block mt-8 space-y-8 animate-in fade-in duration-300 overflow-y-auto pr-2 custom-scrollbar max-h-[300px]"
                        >
                            <!-- Technical Details (First) -->
                            <div>
                                <h4
                                    class="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-4 font-bold"
                                >
                                    Technical Details
                                </h4>
                                <div class="grid grid-cols-2 gap-4 text-[11px]">
                                    <!-- ID Field - Copyable -->
                                    <button
                                        onclick={() =>
                                            copyToClipboard(id, "id")}
                                        class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                        title="Click to copy full ID"
                                    >
                                        <div
                                            class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                        >
                                            ID
                                            {#if copiedField === "id"}
                                                <span
                                                    class="text-emerald-400 text-[8px]"
                                                    >✓ Copied!</span
                                                >
                                            {:else}
                                                <svg
                                                    class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                    ><path
                                                        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                    /></svg
                                                >
                                            {/if}
                                        </div>
                                        <div
                                            class="text-white/80 font-mono truncate"
                                        >
                                            {id}
                                        </div>
                                    </button>

                                    <!-- Address Field - Copyable -->
                                    <button
                                        onclick={() =>
                                            copyToClipboard(
                                                data?.d1?.Address,
                                                "address",
                                            )}
                                        class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                        title={data.d1?.Address ||
                                            "Click to copy"}
                                    >
                                        <div
                                            class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                        >
                                            Address
                                            {#if copiedField === "address"}
                                                <span
                                                    class="text-emerald-400 text-[8px]"
                                                    >✓ Copied!</span
                                                >
                                            {:else}
                                                <svg
                                                    class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                    ><path
                                                        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                    /></svg
                                                >
                                            {/if}
                                        </div>
                                        <div
                                            class="text-[#d836ff] font-mono truncate"
                                        >
                                            {data.d1?.Address?.slice(0, 16)}...
                                        </div>
                                    </button>

                                    <!-- Mint Token Field - Copyable -->
                                    <button
                                        onclick={() =>
                                            copyToClipboard(
                                                data?.d1?.Mint_Token,
                                                "mint_token",
                                            )}
                                        class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                        title={data.d1?.Mint_Token ||
                                            "Not minted"}
                                        disabled={!data.d1?.Mint_Token}
                                    >
                                        <div
                                            class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                        >
                                            Mint Token
                                            {#if copiedField === "mint_token"}
                                                <span
                                                    class="text-emerald-400 text-[8px]"
                                                    >✓ Copied!</span
                                                >
                                            {:else if data.d1?.Mint_Token}
                                                <svg
                                                    class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                    ><path
                                                        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                    /></svg
                                                >
                                            {/if}
                                        </div>
                                        <div
                                            class="text-sky-400 font-mono truncate {!data
                                                .d1?.Mint_Token
                                                ? 'opacity-50'
                                                : ''}"
                                        >
                                            {data.d1?.Mint_Token?.slice(
                                                0,
                                                16,
                                            ) || "N/A"}{data.d1?.Mint_Token
                                                ? "..."
                                                : ""}
                                        </div>
                                    </button>

                                    <div
                                        class="p-3 rounded-lg bg-white/5 border border-white/5"
                                    >
                                        <div
                                            class="text-white/40 mb-1 uppercase tracking-widest text-[9px]"
                                        >
                                            Posted
                                        </div>
                                        <div
                                            class="text-white/60 font-mono text-[10px]"
                                        >
                                            {new Date(
                                                data.d1?.Created_At || "",
                                            ).toLocaleDateString()}
                                        </div>
                                    </div>

                                    <div
                                        class="p-3 rounded-lg bg-white/5 border border-white/5"
                                    >
                                        <div
                                            class="text-white/40 mb-1 uppercase tracking-widest"
                                        >
                                            Creator Share
                                        </div>
                                        <div
                                            class="text-emerald-400 font-mono uppercase"
                                        >
                                            10% Royalty
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Styles & Tags (Second) -->
                            <div>
                                <h4
                                    class="text-[9px] uppercase tracking-widest text-white/20 mb-3"
                                >
                                    Styles & Tags
                                </h4>
                                <div class="flex flex-wrap gap-2">
                                    {#each data.kv_do?.lyrics?.style || [] as tag}
                                        <span
                                            class="px-2 py-1 rounded bg-[#d836ff]/5 text-[#d836ff]/50 text-[10px] border border-[#d836ff]/10"
                                            >#{tag}</span
                                        >
                                    {/each}
                                </div>
                            </div>

                            <!-- Model Metadata (Third) -->
                            <div>
                                <h4
                                    class="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-4 font-bold"
                                >
                                    Model Metadata
                                </h4>
                                <div
                                    class="p-4 rounded-xl bg-black/40 border border-white/5 space-y-4"
                                >
                                    <div>
                                        <div
                                            class="text-[9px] text-white/30 uppercase tracking-[0.2em] mb-2"
                                        >
                                            Primary Prompt
                                        </div>
                                        <p
                                            class="text-xs text-white/70 italic leading-relaxed"
                                        >
                                            "{data.kv_do?.payload?.prompt ||
                                                "No prompt stored"}"
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Info/Lyrics Column -->
                    <div
                        class="w-full lg:w-1/2 flex flex-col h-[500px] lg:h-auto lg:min-h-0 bg-black/20 border border-white/5 rounded-2xl overflow-hidden shadow-inner isolate"
                    >
                        <!-- Content Tabs -->
                        <div
                            class="flex px-4 pt-4 gap-6 border-b border-white/5 flex-shrink-0 items-center justify-between"
                        >
                            <div class="flex gap-6">
                                <button
                                    onclick={() => (activeTab = "lyrics")}
                                    class="pb-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeTab ===
                                    'lyrics'
                                        ? 'text-[#d836ff] border-b-2 border-[#d836ff]'
                                        : 'text-white/30 hover:text-white'}"
                                    >Lyrics</button
                                >
                                <button
                                    onclick={() => (activeTab = "metadata")}
                                    class="pb-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors lg:hidden {activeTab ===
                                    'metadata'
                                        ? 'text-[#d836ff] border-b-2 border-[#d836ff]'
                                        : 'text-white/30 hover:text-white'}"
                                    >Metadata</button
                                >
                            </div>

                            {#if activeTab === "lyrics"}
                                <button
                                    onclick={() => (autoScroll = !autoScroll)}
                                    class="pb-3 px-2 text-[10px] font-bold transition-all {autoScroll
                                        ? 'text-[#d836ff] drop-shadow-[0_0_8px_rgba(216,54,255,0.5)]'
                                        : 'text-white/20 hover:text-white/50'}"
                                    title={autoScroll
                                        ? "Auto-scroll ON"
                                        : "Auto-scroll OFF"}
                                >
                                    S
                                </button>
                            {/if}
                        </div>

                        <div class="flex-1 relative overflow-hidden group">
                            <div
                                bind:this={lyricsContainerRef}
                                class="h-full overflow-y-auto p-6 scroll-smooth dark-scrollbar"
                            >
                                {#if activeTab === "lyrics"}
                                    <div class="space-y-4">
                                        {#each lyricsLines as line}
                                            <p
                                                class="text-xs md:text-sm text-white/80 font-pixel leading-relaxed hover:text-white transition-colors"
                                            >
                                                {line}
                                            </p>
                                        {/each}
                                    </div>
                                {:else}
                                    <div
                                        class="space-y-8 animate-in fade-in duration-300"
                                    >
                                        <!-- Technical Details (First) -->
                                        <div>
                                            <h4
                                                class="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-4 font-bold"
                                            >
                                                Technical Details
                                            </h4>
                                            <div
                                                class="grid grid-cols-2 gap-4 text-[11px]"
                                            >
                                                <!-- ID Field - Copyable -->
                                                <button
                                                    onclick={() =>
                                                        copyToClipboard(
                                                            id,
                                                            "id",
                                                        )}
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                                    title="Click to copy full ID"
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                                    >
                                                        ID
                                                        {#if copiedField === "id"}
                                                            <span
                                                                class="text-emerald-400 text-[8px]"
                                                                >✓ Copied!</span
                                                            >
                                                        {:else}
                                                            <svg
                                                                class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                                fill="currentColor"
                                                                viewBox="0 0 24 24"
                                                                ><path
                                                                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                                /></svg
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="text-white/80 font-mono truncate"
                                                    >
                                                        {id}
                                                    </div>
                                                </button>

                                                <!-- Address Field - Copyable -->
                                                <button
                                                    onclick={() =>
                                                        copyToClipboard(
                                                            data?.d1?.Address,
                                                            "address",
                                                        )}
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                                    title={data.d1?.Address ||
                                                        "Click to copy"}
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                                    >
                                                        Address
                                                        {#if copiedField === "address"}
                                                            <span
                                                                class="text-emerald-400 text-[8px]"
                                                                >✓ Copied!</span
                                                            >
                                                        {:else}
                                                            <svg
                                                                class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                                fill="currentColor"
                                                                viewBox="0 0 24 24"
                                                                ><path
                                                                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                                /></svg
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="text-[#d836ff] font-mono truncate"
                                                    >
                                                        {data.d1?.Address?.slice(
                                                            0,
                                                            16,
                                                        )}...
                                                    </div>
                                                </button>

                                                <!-- Mint Token Field - Copyable -->
                                                <button
                                                    onclick={() =>
                                                        copyToClipboard(
                                                            data?.d1
                                                                ?.Mint_Token,
                                                            "mint_token",
                                                        )}
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5 text-left hover:bg-white/10 hover:border-white/20 transition-all cursor-copy group relative"
                                                    title={data.d1
                                                        ?.Mint_Token ||
                                                        "Not minted"}
                                                    disabled={!data.d1
                                                        ?.Mint_Token}
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest flex items-center gap-2"
                                                    >
                                                        Mint Token
                                                        {#if copiedField === "mint_token"}
                                                            <span
                                                                class="text-emerald-400 text-[8px]"
                                                                >✓ Copied!</span
                                                            >
                                                        {:else if data.d1?.Mint_Token}
                                                            <svg
                                                                class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                                                                fill="currentColor"
                                                                viewBox="0 0 24 24"
                                                                ><path
                                                                    d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                                /></svg
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="text-sky-400 font-mono truncate {!data
                                                            .d1?.Mint_Token
                                                            ? 'opacity-50'
                                                            : ''}"
                                                    >
                                                        {data.d1?.Mint_Token?.slice(
                                                            0,
                                                            16,
                                                        ) || "N/A"}{data.d1
                                                            ?.Mint_Token
                                                            ? "..."
                                                            : ""}
                                                    </div>
                                                </button>

                                                <div
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5"
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest text-[9px]"
                                                    >
                                                        Posted
                                                    </div>
                                                    <div
                                                        class="text-white/60 font-mono text-[10px]"
                                                    >
                                                        {new Date(
                                                            data.d1?.Created_At ||
                                                                "",
                                                        ).toLocaleDateString()}
                                                    </div>
                                                </div>

                                                <div
                                                    class="p-3 rounded-lg bg-white/5 border border-white/5"
                                                >
                                                    <div
                                                        class="text-white/40 mb-1 uppercase tracking-widest"
                                                    >
                                                        Creator Share
                                                    </div>
                                                    <div
                                                        class="text-emerald-400 font-mono uppercase"
                                                    >
                                                        10% Royalty
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Styles & Tags (Second) -->
                                        <div>
                                            <h4
                                                class="text-[9px] uppercase tracking-widest text-white/20 mb-3"
                                            >
                                                Styles & Tags
                                            </h4>
                                            <div class="flex flex-wrap gap-2">
                                                {#each data.kv_do?.lyrics?.style || [] as tag}
                                                    <span
                                                        class="px-2 py-1 rounded bg-[#d836ff]/5 text-[#d836ff]/50 text-[10px] border border-[#d836ff]/10"
                                                        >#{tag}</span
                                                    >
                                                {/each}
                                            </div>
                                        </div>

                                        <!-- Model Metadata (Third) -->
                                        <div>
                                            <h4
                                                class="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-4 font-bold"
                                            >
                                                Model Metadata
                                            </h4>
                                            <div
                                                class="p-4 rounded-xl bg-black/40 border border-white/5 space-y-4"
                                            >
                                                <div>
                                                    <div
                                                        class="text-[9px] text-white/30 uppercase tracking-[0.2em] mb-2"
                                                    >
                                                        Primary Prompt
                                                    </div>
                                                    <p
                                                        class="text-xs text-white/70 italic leading-relaxed"
                                                    >
                                                        "{data.kv_do?.payload
                                                            ?.prompt ||
                                                            "No prompt stored"}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                {/if}

                                {#if activeTab === "lyrics" && lyricsLines.length === 0}
                                    <div
                                        class="h-full flex flex-col items-center justify-center text-center py-20"
                                    >
                                        <p
                                            class="text-white/20 italic text-sm mb-4"
                                        >
                                            No lyrics found for this track
                                        </p>
                                        <div
                                            class="w-12 h-1 bg-white/5 rounded-full"
                                        ></div>
                                    </div>
                                {/if}

                                <!-- Footer Info (Persistent) -->
                                <div
                                    class="mt-12 pt-12 border-t border-white/5 space-y-6"
                                ></div>
                            </div>

                            <!-- Fade overlays -->
                            <div
                                class="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#1a1a1a]/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                            ></div>
                            <div
                                class="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#1a1a1a]/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

{#if showTipModal && tipArtistAddress}
    <TipArtistModal
        artistAddress={tipArtistAddress}
        onClose={() => {
            showTipModal = false;
            tipArtistAddress = null;
        }}
    />
{/if}

{#if showTradeModal && data?.d1 && tradeReady}
    <MintTradeModal
        ammId={data.d1.Mint_Amm!}
        mintTokenId={data.d1.Mint_Token!}
        songId={id}
        title={data.d1.Title}
        imageUrl={`${API_URL}/image/${id}.png?scale=8`}
        on:close={() => (showTradeModal = false)}
        on:complete={() => {
            fetchData();
            showTradeModal = false;
        }}
    />
{/if}

<style>
    .dark-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .dark-scrollbar::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
    }
    .dark-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
    }
    .dark-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }
</style>
