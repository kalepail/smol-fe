<script lang="ts">
    import type { Smol } from "../../types/domain";
    import { audioState, selectSong } from "../../stores/audio.svelte.ts";
    import RadioPlayer from "./RadioPlayer.svelte";
    import { isAuthenticated, userState } from "../../stores/user.svelte.ts";
    import LikeButton from "../ui/LikeButton.svelte";
    import { useSmolMinting } from "../../hooks/useSmolMinting";
    import confetti from "canvas-confetti";
    import TokenBalancePill from "../ui/TokenBalancePill.svelte";
    import MintTradeModal from "../MintTradeModal.svelte";
    import { sac } from "../../utils/passkey-kit";
    import { getTokenBalance } from "../../utils/balance";
    import { RPC_URL } from "../../utils/rpc";

    let {
        generatedPlaylist: playlist = [],
        selectedTags = [],
        isPlaying,
        currentSongIndex: currentIndex,
        stationName,
        stationDescription,
        isSavingMixtape,
        onNext,
        onPrev,
        onPlaySong: onSelect,
        onTogglePlay,
        onSaveMixtape,
        onRegenerate,
        onToggleLike,
        onRemoveTag,
        isGlobalShuffle = false,
        onShowBuilder,
    }: {
        generatedPlaylist: Smol[];
        selectedTags: string[];
        isPlaying: boolean;
        currentSongIndex: number;
        stationName: string;
        stationDescription: string;
        isSavingMixtape: boolean;
        onNext?: () => void;
        onPrev?: () => void;
        onPlaySong: (index: number) => void;
        onTogglePlay?: () => void;
        onSaveMixtape?: () => void;
        onRegenerate?: () => void;
        onToggleLike?: (index: number, liked: boolean) => void;
        onRemoveTag?: (tag: string) => void;
        isGlobalShuffle?: boolean;
        onShowBuilder?: () => void;
    } = $props();

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

    // Minting logic (same as SmolResults)
    const mintingHook = useSmolMinting();
    let minting = $state(false);

    const currentSong = $derived(playlist[currentIndex]);
    let showTradeModal = $state(false);
    let tradeMintBalance = $state(0n);
    let selectedVersionId = $state<string | null>(null);

    // Fetch mint balance for current track
    $effect(() => {
        const mintToken = currentSong?.Mint_Token;
        const contractId = userState.contractId;
        if (mintToken && contractId) {
            const client = sac.get().getSACClient(mintToken);
            getTokenBalance(client, contractId).then(
                (b) => (tradeMintBalance = b),
            );
        } else {
            tradeMintBalance = 0n;
        }
    });

    // V1/V2 version toggle
    const versions = $derived.by(() => {
        if (!currentSong?.kv_do?.songs) return [];
        return currentSong.kv_do.songs.map((s: any, i: number) => ({
            id: s.music_id,
            label: `V${i + 1}`,
            isBest: s.music_id === currentSong.Song_1,
        }));
    });

    // Reset version when song changes
    $effect(() => {
        if (currentSong?.Id) {
            selectedVersionId = currentSong.Song_1 || null;
        }
    });

    // Confetti logic for Global Mode
    let lastGlobalState = $state(false);
    $effect(() => {
        if (isGlobalShuffle && !lastGlobalState) {
            // Triple burst for maximum impact!
            const count = 200;
            const defaults = {
                origin: { y: 0.7 },
                colors: ["#F7931A", "#872ab0", "#1b8da0", "#ffffff"],
                zIndex: 2000,
            };

            function fire(particleRatio: number, opts: any) {
                confetti({
                    ...defaults,
                    ...opts,
                    particleCount: Math.floor(count * particleRatio),
                });
            }

            fire(0.25, { spread: 26, startVelocity: 55 });
            fire(0.2, { spread: 60 });
            fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
            fire(0.1, {
                spread: 120,
                startVelocity: 25,
                decay: 0.92,
                scalar: 1.2,
            });
            fire(0.1, { spread: 120, startVelocity: 45 });
        }
        lastGlobalState = isGlobalShuffle;
    });

    const isMinted = $derived(
        Boolean(currentSong?.Mint_Token && currentSong?.Mint_Amm),
    );

    async function triggerMint() {
        if (!currentSong?.Id || minting || isMinted) return;
        if (!userState.contractId) return alert("Connect wallet to mint");

        try {
            minting = true;
            await mintingHook.triggerMint(
                {
                    id: currentSong.Id,
                    contractId: userState.contractId,
                    keyId: userState.keyId!,
                    smolContractId:
                        import.meta.env.PUBLIC_SMOL_CONTRACT_ID ||
                        "CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA",
                    rpcUrl: RPC_URL,
                    networkPassphrase: import.meta.env
                        .PUBLIC_NETWORK_PASSPHRASE!,
                    creatorAddress: currentSong.Address || "",
                    kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID!,
                },
                async () => {
                    // Refresh would go here if needed
                },
            );
        } catch (e: any) {
            alert(e.message);
        } finally {
            minting = false;
        }
    }

    function share() {
        let url = window.location.href;

        if (currentSong?.Id) {
            if (currentSong.Address) {
                // Prefer Artist Page Deep Link (Rich Context)
                url = `${window.location.origin}/artist/${currentSong.Address}?play=${currentSong.Id}`;
            } else {
                // Fallback to generic song ID route
                url = `${window.location.origin}/${currentSong.Id}`;
            }
        }

        navigator
            .share?.({
                title: currentSong?.Title || "SMOL Radio",
                url,
            })
            .catch(() => {
                navigator.clipboard.writeText(url);
                alert("Link copied!");
            });
    }
</script>

<div
    class="h-full flex flex-col gap-2 p-2 lg:p-4 lg:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono overflow-hidden pb-[env(safe-area-inset-bottom)]"
>
    <div
        class="reactive-glass flex flex-col flex-1 min-h-0 border border-white/5 bg-[#1d1d1d] max-w-6xl mx-auto overflow-hidden rounded-[32px] lg:rounded-xl w-full"
        onmousemove={(e) => {
            const el = e.currentTarget as HTMLElement;
            const rect = el.getBoundingClientRect();
            el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
            el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
        }}
    >
        <div
            class="flex items-center justify-between px-6 py-1.5 bg-black/40 border-b border-white/5"
        >
            <div
                class="flex items-center gap-3 select-none flex-1 min-w-0 mr-4"
            >
                {#if isGlobalShuffle}
                    <!-- Global Mode Branding -->
                    <div class="flex items-center gap-2.5">
                        <img
                            src="/global_mode.png"
                            alt="Stellar Global"
                            class="w-6 h-6 object-contain drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]"
                        />
                        <span
                            class="text-[10px] font-pixel font-black text-white uppercase tracking-[0.2em] animate-pulse"
                        >
                            GLOBAL MODE!!!
                        </span>
                    </div>
                {:else}
                    <div class="flex items-center gap-2">
                        <h1
                            class="text-lg md:text-xl font-black tracking-tighter font-pixel"
                            style="text-shadow: 2px 2px 0px rgba(0,0,0,0.5);"
                        >
                            <span class="text-[#9ae600]">SMOL</span><span
                                class="relative text-white"
                                >RADIO<span
                                    class="absolute -top-1 right-0 text-[5px] text-[#FDDA24] font-pixel uppercase tracking-widest"
                                    >PRE-ALPHA</span
                                ></span
                            >
                        </h1>
                    </div>
                {/if}
                <!-- Active Tags Display -->
                {#if selectedTags.length > 0}
                    <div
                        class="flex gap-2 overflow-x-auto no-scrollbar py-1 pr-4 mask-fade-right"
                    >
                        {#each selectedTags as tag}
                            <button
                                type="button"
                                class="px-2 py-0.5 text-[9px] bg-[#872ab0]/20 text-white rounded-md border border-[#872ab0]/30 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] flex items-center gap-1.5 cursor-pointer hover:bg-[#872ab0]/40 transition-all group shrink-0 font-pixel uppercase tracking-tighter"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onRemoveTag?.(tag);
                                }}
                            >
                                <span class="whitespace-nowrap">
                                    {tag.length > 12
                                        ? tag.slice(0, 10) + "..."
                                        : tag}
                                </span>
                                <span
                                    class="text-[8px] opacity-50 group-hover:opacity-100 shrink-0"
                                    >✕</span
                                >
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            <div class="flex items-center gap-4 shrink-0">
                <button
                    class="text-[10px] font-pixel font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors underline"
                    onclick={onShowBuilder}
                >
                    Tags
                </button>
            </div>
        </div>

        <div
            class="flex flex-col lg:flex-row gap-2 lg:gap-4 flex-1 min-h-0 overflow-hidden p-2 lg:p-4 w-full"
        >
            <!-- LEFT COLUMN: PLAYER -->
            <div
                class="w-full lg:w-1/2 flex flex-col gap-2 lg:self-start min-h-0 max-w-full"
            >
                <RadioPlayer
                    {playlist}
                    overlayControls={true}
                    variant="arcade"
                    {onNext}
                    {onPrev}
                    {onRegenerate}
                    {onSelect}
                    {onToggleLike}
                    {currentIndex}
                    onTrade={isMinted
                        ? () => (showTradeModal = true)
                        : undefined}
                    onMint={!isMinted ? triggerMint : undefined}
                    onShare={share}
                    isMinting={minting}
                    isAuthenticated={isAuthenticated()}
                    showMiniActions={false}
                    {versions}
                    currentVersionId={selectedVersionId || ""}
                    onVersionSelect={(id) => {
                        selectedVersionId = id;
                        // Update the audio source by re-selecting the song with new version
                        if (currentSong) {
                            const updatedSong = { ...currentSong, Song_1: id };
                            selectSong(updatedSong);
                        }
                    }}
                />
            </div>

            <!-- RIGHT COLUMN: PLAYLIST -->
            <div
                class="w-full lg:w-1/2 flex flex-col bg-black/20 border border-white/5 rounded-[28px] lg:rounded-2xl overflow-hidden max-h-[40vh] lg:max-h-[calc(100vh-280px)]"
            >
                <div
                    class="flex items-center justify-between p-4 border-b border-white/5 bg-white/5 flex-shrink-0"
                >
                    <h3
                        class="text-white font-pixel font-black tracking-widest uppercase text-[10px]"
                    >
                        Up Next
                    </h3>
                </div>

                <div class="flex-1 overflow-y-auto dark-scrollbar px-2 pb-16">
                    <ul class="divide-y divide-white/5">
                        {#each playlist as song, index}
                            <li>
                                <div
                                    role="button"
                                    tabindex="0"
                                    class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left cursor-pointer {index ===
                                    currentIndex
                                        ? 'bg-purple-500/10'
                                        : ''}"
                                    onclick={(e) => {
                                        // Ignore clicks on links or inner buttons
                                        const target = e.target as HTMLElement;
                                        if (
                                            target.closest("a") ||
                                            target.closest("button")
                                        )
                                            return;
                                        onSelect(index);
                                    }}
                                    onkeydown={(e) => {
                                        if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                        ) {
                                            e.preventDefault();
                                            onSelect(index);
                                        }
                                    }}
                                >
                                    <span
                                        class="text-slate-500 w-6 text-right text-[10px] font-pixel"
                                        >{index + 1}</span
                                    >
                                    <div
                                        class="relative w-10 h-10 rounded bg-slate-800 flex-shrink-0 overflow-hidden group border border-white/10"
                                    >
                                        <img
                                            src="{API_URL}/image/{song.Id}.png?scale=8"
                                            alt="Art"
                                            class="w-full h-full object-cover"
                                            onerror={(e) => {
                                                (
                                                    e.currentTarget as HTMLElement
                                                ).style.display = "none";
                                            }}
                                        />
                                        {#if index === currentIndex && audioState.playingId === song.Id}
                                            <div
                                                class="absolute inset-0 bg-black/50 flex items-center justify-center"
                                            >
                                                <span
                                                    class="text-purple-400 text-xs animate-pulse"
                                                    >▶</span
                                                >
                                            </div>
                                        {/if}
                                    </div>
                                    <div
                                        class="overflow-hidden text-left flex-1 min-w-0"
                                    >
                                        <div
                                            class="text-xs font-pixel font-black text-slate-200 truncate uppercase {index ===
                                            currentIndex
                                                ? 'text-[#9ae600]'
                                                : ''}"
                                        >
                                            {song.Title || "Untitled"}
                                        </div>
                                        <a
                                            href="/artist/{song.Address}"
                                            class="text-[8px] text-slate-500 truncate hover:text-white transition-colors hover:underline block font-pixel uppercase"
                                            onclick={(e) => e.stopPropagation()}
                                        >
                                            {song.Address || "Unknown Artist"}
                                        </a>
                                    </div>

                                    <div>
                                        <LikeButton
                                            smolId={song.Id}
                                            liked={song.Liked || false}
                                            classNames="p-2 text-slate-500 hover:text-[#ff424c] hover:bg-white/5 rounded-full transition-colors"
                                            on:likeChanged={(e) => {
                                                onToggleLike?.(
                                                    index,
                                                    e.detail.liked,
                                                );
                                            }}
                                        />
                                    </div>

                                    <!-- Song Page Link -->
                                    <a
                                        href="/{song.Id}"
                                        class="p-2 text-slate-500 hover:text-white transition-colors"
                                        title="View Song Details"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke-width="1.5"
                                            stroke="currentColor"
                                            class="w-5 h-5"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                            />
                                        </svg>
                                    </a>
                                </div>
                            </li>
                        {/each}
                    </ul>
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
        imageUrl="{API_URL}/image/{currentSong.Id}.png?scale=8"
        on:close={() => (showTradeModal = false)}
        on:complete={() => {
            // No simple way to trigger a full re-fetch of the single song in Radio
            // but the getTokenBalance effect will auto-update the pill.
            showTradeModal = false;
        }}
    />
{/if}
