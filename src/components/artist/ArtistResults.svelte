<script lang="ts">
    import type { Smol } from "../../types/domain";
    import { audioState, selectSong } from "../../stores/audio.svelte";
    import RadioPlayer from "../radio/RadioPlayer.svelte";
    import { isAuthenticated, userState } from "../../stores/user.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import { useSmolMinting } from "../../hooks/useSmolMinting";
    import TokenBalancePill from "../ui/TokenBalancePill.svelte";
    import MintTradeModal from "../MintTradeModal.svelte";
    import { getTokenBalance } from "../../utils/balance";
    import TipArtistModal from "./TipArtistModal.svelte";
    import { sac } from "../../utils/passkey-kit";

    let {
        discography = [],
        minted = [],
        collected = [],
        address,
        publishedCount,
        collectedCount,
        mintedCount,
        topTags = [],
    }: {
        discography: Smol[];
        minted: Smol[];
        collected: Smol[];
        address: string;
        publishedCount: number;
        collectedCount: number;
        mintedCount: number;
        topTags: string[];
    } = $props();

    let activeModule = $state<"discography" | "minted" | "collected">(
        "discography",
    );
    let shuffleEnabled = $state(false);
    let currentIndex = $state(0);
    let minting = $state(false);
    let showTradeModal = $state(false);
    let tradeMintBalance = $state(0n);
    let showGridView = $state(false);
    let showTipModal = $state(false);

    const mintingHook = useSmolMinting();
    const currentSong = $derived(audioState.currentSong);

    const isMinted = $derived(
        Boolean(currentSong?.Mint_Token && currentSong?.Mint_Amm),
    );

    $effect(() => {
        if (currentSong?.Mint_Token && userState.contractId) {
            getTokenBalance(
                sac.getSACClient(currentSong.Mint_Token),
                userState.contractId,
            ).then((b) => {
                tradeMintBalance = b;
            });
        }
    });

    // Derived playlist based on module and shuffle
    const basePlaylist = $derived.by(() => {
        if (activeModule === "minted") return minted;
        if (activeModule === "collected") return collected;
        return discography;
    });

    let displayPlaylist = $state<Smol[]>([]);

    // Handle shuffle state changes or module changes
    $effect(() => {
        if (shuffleEnabled) {
            displayPlaylist = [...basePlaylist].sort(() => Math.random() - 0.5);
        } else {
            displayPlaylist = [...basePlaylist];
        }
        // When changing module or shuffle, reset index if current song not in new list
        // For simplicity, just reset to 0 for now as requested for "new artist" feel
    });

    // Reset playback on address change
    let lastAddress = $state(address);
    $effect(() => {
        if (address !== lastAddress) {
            lastAddress = address;
            currentIndex = 0;
            activeModule = "discography";
            shuffleEnabled = false;

            // Auto-play the first song of the new artist
            if (discography.length > 0) {
                selectSong(discography[0]);
            }
        }
    });

    const API_URL = import.meta.env.PUBLIC_API_URL;

    function handleSelect(index: number) {
        currentIndex = index;
        const song = displayPlaylist[index];
        if (song) {
            selectSong(song);
        }
    }

    function handleNext() {
        const nextIndex = (currentIndex + 1) % displayPlaylist.length;
        handleSelect(nextIndex);
    }

    function handlePrev() {
        const prevIndex =
            (currentIndex - 1 + displayPlaylist.length) %
            displayPlaylist.length;
        handleSelect(prevIndex);
    }

    function handleToggleLike(index: number, liked: boolean) {
        if (displayPlaylist[index]) {
            displayPlaylist[index].Liked = liked;
        }
    }

    function toggleShuffle() {
        shuffleEnabled = !shuffleEnabled;
    }

    function triggerLogin() {
        window.dispatchEvent(new CustomEvent("smol:request-login"));
    }

    async function triggerMint() {
        if (!userState.contractId) {
            triggerLogin();
            return;
        }
        if (!currentSong?.Id || minting || isMinted) return;

        try {
            minting = true;
            await mintingHook.triggerMint(
                {
                    id: currentSong.Id,
                    contractId: userState.contractId,
                    keyId: userState.keyId!,
                    smolContractId: import.meta.env.PUBLIC_SMOL_CONTRACT_ID!,
                    rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
                    networkPassphrase: import.meta.env
                        .PUBLIC_NETWORK_PASSPHRASE!,
                    creatorAddress: currentSong.Address || "",
                    kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID!,
                },
                async () => {
                    // Update the local state to match minted status if needed
                },
            );
        } catch (e: any) {
            alert(e.message);
        } finally {
            minting = false;
        }
    }

    function share() {
        const url = currentSong?.Id
            ? `${window.location.origin}/${currentSong.Id}`
            : window.location.href;
        navigator
            .share?.({
                title: currentSong?.Title || "SMOL Artist",
                url,
            })
            .catch(() => {
                navigator.clipboard.writeText(url);
                alert("Link copied!");
            });
    }

    function copyAddress() {
        navigator.clipboard.writeText(address).then(() => {
            alert("Address copied! Send XLM or USDC to tip this artist.");
        });
    }

    const shortAddress = $derived(
        address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "",
    );
</script>

<div
    class="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono"
>
    <!-- Artist Info Header (Windowed) -->
    <div
        class="max-w-6xl mx-auto reactive-glass border border-white/5 bg-[#1d1d1d]/70 backdrop-blur-xl rounded-xl shadow-xl overflow-hidden mb-1 py-1 px-3 md:px-4 flex flex-row items-center justify-between gap-2 md:gap-4 relative group/header"
    >
        <div class="space-y-1 relative z-10">
            <h1
                class="text-[9px] font-mono text-white/40 uppercase tracking-[0.3em]"
            >
                Artist Profile
            </h1>
            <div class="flex items-center gap-3">
                <button
                    onclick={copyAddress}
                    class="text-lg md:text-3xl lg:text-4xl font-bold tracking-tighter text-white hover:text-[#d836ff] transition-colors flex items-center gap-2 md:gap-3 group/address text-left"
                    title="Click to copy address"
                >
                    {shortAddress}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="2"
                        stroke="currentColor"
                        class="w-5 h-5 opacity-0 group-hover/address:opacity-100 transition-all text-[#d836ff] -ml-2 group-hover/address:ml-0"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                        />
                    </svg>
                </button>
            </div>
            <div class="flex items-center gap-2 mt-2">
                <button
                    onclick={() => {
                        if (!userState.contractId) {
                            triggerLogin();
                            return;
                        }
                        showTipModal = true;
                    }}
                    class="px-3 py-1 bg-gradient-to-r from-green-600/20 to-green-500/10 border border-green-500/30 rounded-full text-green-400 text-[10px] font-bold uppercase tracking-widest hover:bg-green-500/20 transition-all flex items-center gap-1.5"
                >
                    <span class="text-base leading-none">🥬</span>
                    Tip Artist
                </button>
            </div>
        </div>

        <div class="hidden md:flex flex-col items-end gap-3 relative z-10">
            <div class="flex flex-wrap gap-2 justify-end">
                <span
                    class="px-3 py-1 rounded-md bg-lime-500/10 text-lime-400 text-[10px] border border-lime-500/20 uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(132,204,22,0.1)]"
                >
                    {publishedCount} Published
                </span>
                <span
                    class="px-3 py-1 rounded-md bg-purple-500/10 text-purple-400 text-[10px] border border-purple-500/20 uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(216,54,255,0.1)]"
                >
                    {mintedCount} Minted
                </span>
            </div>
            <div class="flex gap-2">
                <span
                    class="px-3 py-1 rounded-md bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20 uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                >
                    {collectedCount} Collected
                </span>
            </div>
        </div>

        <!-- Decorative Background Glow -->
        <div
            class="absolute -top-24 -right-24 w-64 h-64 bg-[#d836ff]/5 rounded-full blur-[80px] pointer-events-none"
        ></div>
        <div
            class="absolute -bottom-24 -left-24 w-64 h-64 bg-lime-500/5 rounded-full blur-[80px] pointer-events-none"
        ></div>
    </div>

    <!-- Main Player Card -->
    <div
        class="max-w-6xl mx-auto reactive-glass border border-white/5 bg-[#1d1d1d]/70 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden relative flex flex-col h-[calc(100vh-200px)] min-h-[400px]"
    >
        <!-- Control Bar -->
        <div class="flex items-center justify-between py-0.5 px-3 shrink-0">
            <div class="flex items-center gap-2 select-none">
                <div
                    class="text-lime-500 drop-shadow-[0_0_8px_rgba(132,204,22,0.4)]"
                >
                    <svg
                        viewBox="0 0 24 24"
                        class="w-5 h-5"
                        fill="currentColor"
                    >
                        <path
                            d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                        />
                    </svg>
                </div>
                <!-- Module Tabs -->
                <div class="flex gap-4 ml-4">
                    <button
                        onclick={() => (activeModule = "discography")}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'discography'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Discography
                    </button>
                    <button
                        onclick={() => (activeModule = "minted")}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'minted'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Minted
                    </button>
                    <button
                        onclick={() => (activeModule = "collected")}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'collected'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Collected
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <button
                    onclick={() => (showGridView = !showGridView)}
                    class="flex items-center gap-2 px-3 py-1 rounded border transition-all {showGridView
                        ? 'border-purple-500/50 bg-purple-500/10 text-purple-400'
                        : 'border-white/10 text-white/40 hover:text-white'}"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-3 h-3"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H18A2.25 2.25 0 0 1 13.5 18v-2.25Z"
                        />
                    </svg>
                    <span class="text-[9px] font-bold uppercase tracking-widest"
                        >Grid View</span
                    >
                </button>

                <button
                    onclick={toggleShuffle}
                    class="hidden lg:flex items-center gap-2 px-3 py-1 rounded border transition-all {shuffleEnabled
                        ? 'border-lime-500/50 bg-lime-500/10 text-lime-400'
                        : 'border-white/10 text-white/40 hover:text-white'}"
                >
                    <svg
                        class="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                        />
                    </svg>
                    <span class="text-[9px] font-bold uppercase tracking-widest"
                        >{shuffleEnabled ? "Shuffle On" : "Shuffle Off"}</span
                    >
                </button>
            </div>
        </div>

        <div class="relative flex-1 min-h-0">
            {#if showGridView}
                <div
                    class="absolute inset-0 z-50 bg-[#121212] p-6 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto dark-scrollbar"
                >
                    <div
                        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 pb-20"
                    >
                        {#each displayPlaylist as song, index}
                            <button
                                class="flex flex-col gap-2 group text-left"
                                onclick={() => {
                                    handleSelect(index);
                                    showGridView = false;
                                }}
                            >
                                <div
                                    class="aspect-square rounded-lg bg-slate-800 overflow-hidden border border-white/10 group-hover:border-lime-500/50 transition-all shadow-lg relative"
                                >
                                    <img
                                        src="{API_URL}/image/{song.Id}.png?scale=8"
                                        alt={song.Title}
                                        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                    />
                                    {#if index === currentIndex}
                                        <div
                                            class="absolute inset-0 bg-lime-500/20 flex items-center justify-center"
                                        >
                                            <div
                                                class="w-2 h-2 rounded-full bg-lime-500 shadow-[0_0_12px_#84cc16]"
                                            ></div>
                                        </div>
                                    {/if}
                                </div>
                                <span
                                    class="text-[10px] font-bold text-white/60 truncate group-hover:text-white transition-colors"
                                    >{song.Title || "Untitled"}</span
                                >
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            <div
                class="flex flex-col lg:flex-row gap-4 h-full items-stretch px-4 pt-0 pb-4"
            >
                <!-- LEFT COLUMN: PLAYER -->
                <div class="w-full lg:w-1/2 flex flex-col gap-1 min-h-0 pb-1">
                    <RadioPlayer
                        playlist={displayPlaylist}
                        onNext={handleNext}
                        onPrev={handlePrev}
                        onSelect={handleSelect}
                        onToggleLike={handleToggleLike}
                        onTrade={isMinted
                            ? () => {
                                  if (!userState.contractId) {
                                      triggerLogin();
                                      return;
                                  }
                                  showTradeModal = true;
                              }
                            : undefined}
                        onMint={!isMinted ? triggerMint : undefined}
                        isMinting={minting}
                        isAuthenticated={userState.contractId !== null}
                        {currentIndex}
                        overlayControlsOnMobile={true}
                        onShare={share}
                        onShuffle={() => (shuffleEnabled = !shuffleEnabled)}
                    />

                    <!-- Mint + Trade Buttons (hidden on mobile, controls are in art) -->
                    <div class="hidden lg:flex gap-3 mt-3">
                        {#if isMinted}
                            {#if currentSong?.Mint_Amm && currentSong?.Mint_Token}
                                <button
                                    onclick={() => {
                                        if (!userState.contractId) {
                                            triggerLogin();
                                            return;
                                        }
                                        showTradeModal = true;
                                    }}
                                    class="flex-1 py-3 bg-[#2775ca] hover:brightness-110 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                                >
                                    Trade <TokenBalancePill
                                        balance={tradeMintBalance}
                                    />
                                </button>
                            {:else}
                                <button
                                    onclick={() =>
                                        (window.location.href = `/${currentSong?.Id}`)}
                                    class="flex-1 py-3 bg-emerald-500/20 text-emerald-300 font-bold rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-emerald-500/30"
                                >
                                    ✓ Minted
                                </button>
                            {/if}
                        {:else}
                            <button
                                onclick={triggerMint}
                                disabled={minting}
                                class="flex-1 py-3 bg-[#d836ff] hover:brightness-110 disabled:opacity-50 text-white font-bold rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                            >
                                {minting ? "Minting..." : "Mint Track"}
                            </button>
                        {/if}
                        <button
                            onclick={share}
                            class="px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/5 transition-all text-xs uppercase tracking-widest"
                            >Share</button
                        >
                    </div>
                </div>

                <!-- RIGHT COLUMN: PLAYLIST -->
                <div
                    class="w-full lg:w-1/2 flex flex-col min-h-0 bg-black/20 border border-white/5 rounded-2xl overflow-hidden max-h-[40vh] lg:max-h-[calc(100vh-280px)]"
                >
                    <div
                        class="flex items-center justify-between p-3 border-b border-white/5 bg-white/5 flex-shrink-0"
                    >
                        <h3
                            class="text-white font-bold tracking-widest uppercase text-xs"
                        >
                            {activeModule} ({displayPlaylist.length})
                        </h3>
                        <div class="flex items-center gap-2">
                            <span
                                class="w-2 h-2 rounded-full bg-lime-500 shadow-[0_0_8px_#84cc16]"
                            ></span>
                            <span
                                class="text-[9px] text-white/30 font-mono uppercase"
                                >Live</span
                            >
                        </div>
                    </div>

                    <div
                        class="flex-1 min-h-0 overflow-y-auto dark-scrollbar pr-2 pb-8"
                    >
                        <ul class="divide-y divide-white/5">
                            {#each displayPlaylist as song, index}
                                <li>
                                    <div
                                        role="button"
                                        tabindex="0"
                                        class="w-full flex items-center gap-4 p-3 hover:bg-white/[0.07] active:bg-white/[0.1] transition-all duration-200 text-left cursor-pointer group {index ===
                                        currentIndex
                                            ? 'bg-lime-500/15 border-l-4 border-lime-500'
                                            : 'border-l-4 border-transparent hover:border-white/10'}"
                                        onclick={(e) => {
                                            const target =
                                                e.target as HTMLElement;
                                            if (
                                                target.closest("a") ||
                                                target.closest("button")
                                            )
                                                return;
                                            handleSelect(index);
                                        }}
                                        onkeydown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault();
                                                handleSelect(index);
                                            }
                                        }}
                                    >
                                        <span
                                            class="text-white/20 w-4 text-center text-xs font-mono"
                                            >{index + 1}</span
                                        >

                                        <div
                                            class="relative w-10 h-10 rounded-lg bg-slate-800 flex-shrink-0 overflow-hidden group/thumb border border-white/10 shadow-lg"
                                        >
                                            <img
                                                src="{API_URL}/image/{song.Id}.png?scale=8"
                                                alt="Art"
                                                class="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110 group-hover:brightness-50"
                                                onerror={(e) => {
                                                    (
                                                        e.currentTarget as HTMLImageElement
                                                    ).style.display = "none";
                                                }}
                                            />

                                            <!-- Play overlay on hover -->
                                            <div
                                                class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20"
                                            >
                                                <svg
                                                    class="w-5 h-5 text-lime-400"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            </div>

                                            {#if index === currentIndex && audioState.playingId === song.Id}
                                                <div
                                                    class="absolute inset-0 bg-black/60 flex items-center justify-center"
                                                >
                                                    <div
                                                        class="flex gap-0.5 items-end h-3"
                                                    >
                                                        <div
                                                            class="w-1 bg-lime-500 animate-bounce"
                                                            style="animation-delay: 0.1s; height: 100%;"
                                                        ></div>
                                                        <div
                                                            class="w-1 bg-lime-500 animate-bounce"
                                                            style="animation-delay: 0.2s; height: 60%;"
                                                        ></div>
                                                        <div
                                                            class="w-1 bg-lime-500 animate-bounce"
                                                            style="animation-delay: 0.3s; height: 80%;"
                                                        ></div>
                                                    </div>
                                                </div>
                                            {/if}
                                        </div>

                                        <div
                                            class="overflow-hidden text-left flex-1 min-w-0"
                                        >
                                            <div
                                                class="text-xs font-bold text-white/90 truncate {index ===
                                                currentIndex
                                                    ? 'text-lime-400'
                                                    : ''}"
                                            >
                                                {song.Title || "Untitled"}
                                            </div>
                                            <div
                                                class="flex items-center gap-3 text-[9px] text-white/30 truncate uppercase tracking-widest mt-0.5 font-light"
                                            >
                                                {new Date(
                                                    song.Created_At,
                                                ).toLocaleDateString(
                                                    undefined,
                                                    {
                                                        month: "short",
                                                        day: "numeric",
                                                    },
                                                )}

                                                {#if song.Tags && song.Tags.length > 0}
                                                    <div
                                                        class="flex gap-1.5 items-center ml-2 border-l border-white/10 pl-2"
                                                    >
                                                        {#each song.Tags.slice(0, 3) as tag}
                                                            <span
                                                                class="text-[9px] text-lime-400/50 hover:text-lime-400 transition-colors cursor-default"
                                                                >#{tag}</span
                                                            >
                                                        {/each}
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>

                                        <div class="flex items-center gap-1">
                                            <LikeButton
                                                smolId={song.Id}
                                                liked={song.Liked || false}
                                                classNames="p-1.5 text-white/20 hover:text-[#ff424c] hover:bg-white/5 rounded-full transition-colors"
                                                on:likeChanged={(e) => {
                                                    handleToggleLike(
                                                        index,
                                                        e.detail.liked,
                                                    );
                                                }}
                                            />

                                            <a
                                                href="/{song.Id}"
                                                class="p-1.5 text-white/20 hover:text-white transition-colors"
                                                title="View Details"
                                                onclick={(e) =>
                                                    e.stopPropagation()}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke-width="1.5"
                                                    stroke="currentColor"
                                                    class="w-3.5 h-3.5"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                                    />
                                                </svg>
                                            </a>
                                        </div>
                                    </div>
                                </li>
                            {/each}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

{#if showTradeModal && currentSong && currentSong.Mint_Amm && currentSong.Mint_Token}
    <MintTradeModal
        ammId={currentSong.Mint_Amm}
        mintTokenId={currentSong.Mint_Token}
        songId={currentSong.Id}
        title={currentSong.Title || "Untitled"}
        imageUrl="{API_URL}/image/{currentSong.Id}.png"
        on:close={() => (showTradeModal = false)}
        on:complete={() => {
            showTradeModal = false;
        }}
    />
{/if}

{#if showTipModal}
    <TipArtistModal
        artistAddress={address}
        onClose={() => (showTipModal = false)}
    />
{/if}
