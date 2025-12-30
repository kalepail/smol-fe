<script lang="ts">
    import type { Smol } from "../../types/domain";
    import { audioState } from "../../stores/audio.svelte";
    import RadioPlayer from "./RadioPlayer.svelte";
    import { isAuthenticated, userState } from "../../stores/user.svelte";
    import LikeButton from "../ui/LikeButton.svelte";
    import { useSmolMinting } from "../../hooks/useSmolMinting";
    import confetti from "canvas-confetti";
    import TokenBalancePill from "../ui/TokenBalancePill.svelte";
    import MintTradeModal from "../MintTradeModal.svelte";
    import { sac } from "../../utils/passkey-kit";
    import { getTokenBalance } from "../../utils/balance";

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

    const API_URL = import.meta.env.PUBLIC_API_URL;

    // Minting logic (same as SmolResults)
    const mintingHook = useSmolMinting();
    let minting = $state(false);

    const currentSong = $derived(playlist[currentIndex]);
    let showTradeModal = $state(false);
    let tradeMintBalance = $state(0n);

    // Fetch mint balance for current track
    $effect(() => {
        const mintToken = currentSong?.Mint_Token;
        const contractId = userState.contractId;
        if (mintToken && contractId) {
            const client = sac.getSACClient(mintToken);
            getTokenBalance(client, contractId).then(
                (b) => (tradeMintBalance = b),
            );
        } else {
            tradeMintBalance = 0n;
        }
    });

    // Confetti logic for Global Mode
    let lastGlobalState = $state(false);
    $effect(() => {
        if (isGlobalShuffle && !lastGlobalState) {
            const hasFired = sessionStorage.getItem(
                "smol_global_confetti_fired",
            );
            if (!hasFired) {
                // Triple burst for maximum impact!
                const count = 200;
                const defaults = {
                    origin: { y: 0.7 },
                    colors: ["#F7931A", "#872ab0", "#1b8da0", "#ffffff"],
                    zIndex: 999,
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

                sessionStorage.setItem("smol_global_confetti_fired", "true");
            }
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
                    smolContractId: import.meta.env.PUBLIC_SMOL_CONTRACT_ID!,
                    rpcUrl: import.meta.env.PUBLIC_RPC_URL!,
                    networkPassphrase: import.meta.env
                        .PUBLIC_NETWORK_PASSPHRASE!,
                    creatorAddress: currentSong.Address || "",
                    kaleSacId: import.meta.env.PUBLIC_KALE_SAC_ID!,
                },
                () => {
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
        const url = currentSong?.Id
            ? `${window.location.origin}/${currentSong.Id}`
            : window.location.href;
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
    class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono"
>
    <div
        class="reactive-glass border border-white/5 bg-[#1d1d1d] max-w-6xl mx-auto overflow-hidden rounded-xl"
        onmousemove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty(
                "--mouse-x",
                `${e.clientX - rect.left}px`,
            );
            e.currentTarget.style.setProperty(
                "--mouse-y",
                `${e.clientY - rect.top}px`,
            );
        }}
    >
        <div
            class="flex items-center justify-between px-6 py-1.5 bg-black/40 border-b border-white/5"
        >
            <div class="flex items-center gap-3 select-none flex-1">
                {#if isGlobalShuffle}
                    <!-- Global Mode Branding -->
                    <div class="flex items-center gap-2.5">
                        <img
                            src="/global_mode.png"
                            alt="Stellar Global"
                            class="w-6 h-6 object-contain drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]"
                        />
                        <span
                            class="text-xs font-black text-white uppercase tracking-[0.2em] animate-pulse"
                        >
                            GLOBAL MODE!!! 🚀
                        </span>
                    </div>
                {:else}
                    <!-- Stellar Logo (White part, Glowing) -->
                    <div
                        class="text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            class="w-5 h-5"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <title>Stellar</title>
                            <path
                                d="M12.003 1.716c-1.37 0-2.7.27-3.948.78A10.18 10.18 0 0 0 2.66 7.901a10.136 10.136 0 0 0-.797 3.954c0 .258.01.516.027.775a1.942 1.942 0 0 1-1.055 1.88L0 14.934v1.902l2.463-1.26.072-.032v.005l.77-.39.758-.385.066-.039 14.807-7.56 1.666-.847 3.392-1.732V2.694L17.792 5.86 3.744 13.025l-.104.055-.017-.115a8.286 8.286 0 0 1-.071-1.105c0-2.255.88-4.377 2.474-5.977a8.462 8.462 0 0 1 2.71-1.82 8.513 8.513 0 0 1 3.2-.654h.067a8.41 8.41 0 0 1 4.09 1.055l1.628-.83.126-.066a10.11 10.11 0 0 0-5.845-1.853zM24 7.143 5.047 16.808l-1.666.847L0 19.382v1.902l3.282-1.671 2.91-1.485 14.058-7.153.105-.055.016.115c.05.369.072.743.072 1.11 0 2.255-.88 4.383-2.475 5.978a8.461 8.461 0 0 1-2.71 1.82 8.305 8.305 0 0 1-3.2.654h-.06c-1.441 0-2.86-.369-4.102-1.061l-.066.033-1.683.857c.594.418 1.232.776 1.903 1.062a10.11 10.11 0 0 0 3.947.797 10.09 10.09 0 0 0 7.17-2.975 10.136 10.136 0 0 0 2.969-7.18c0-.259-.005-.523-.027-.781a1.942 1.942 0 0 1 1.055-1.88L24 9.044z"
                            />
                        </svg>
                    </div>
                {/if}

                <!-- Active Tags Display -->
                {#if selectedTags.length > 0}
                    <div
                        class="flex gap-2 overflow-x-auto no-scrollbar py-1 mask-fade-right"
                    >
                        {#each selectedTags as tag}
                            <button
                                type="button"
                                class="px-2 py-0.5 text-[9px] bg-[#872ab0]/20 text-[#872ab0] rounded-full border border-[#872ab0]/30 shadow-[0_0_8px_rgba(135,42,176,0.3)] whitespace-nowrap flex items-center gap-1.5 cursor-pointer hover:bg-[#872ab0]/30 transition-all group"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onRemoveTag?.(tag);
                                }}
                            >
                                {tag}
                                <span
                                    class="text-[8px] opacity-50 group-hover:opacity-100"
                                    >✕</span
                                >
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            <div class="flex items-center gap-4">
                <button
                    class="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
                    onclick={onShowBuilder}
                >
                    Tags
                </button>
                <button
                    class="text-slate-500 hover:text-white transition-colors"
                    title="Settings"
                    onclick={onShowBuilder}
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
                            d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118 1.716-.532 3.467-1.117 5.2"
                        />
                    </svg>
                </button>
            </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-8 h-auto lg:h-[560px] p-4">
            <!-- LEFT COLUMN: PLAYER -->
            <div class="w-full lg:w-1/2 flex flex-col gap-2 lg:self-start">
                <RadioPlayer
                    {playlist}
                    {onNext}
                    {onPrev}
                    {onRegenerate}
                    {onSelect}
                    {onToggleLike}
                    {currentIndex}
                />

                <!-- Mint + Trade Buttons -->
                <div class="flex gap-3 -mt-2">
                    {#if isMinted}
                        {#if currentSong?.Mint_Amm && currentSong?.Mint_Token}
                            <button
                                onclick={() => (showTradeModal = true)}
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
                class="w-full lg:w-1/2 flex flex-col min-h-0 bg-black/20 border border-white/5 rounded-2xl overflow-hidden"
            >
                <div
                    class="flex items-center justify-between p-4 border-b border-white/5 bg-white/5 flex-shrink-0"
                >
                    <h3
                        class="text-white font-bold tracking-widest uppercase text-xs"
                    >
                        Up Next
                    </h3>
                </div>

                <div
                    class="h-[380px] lg:h-full lg:flex-1 overflow-y-scroll dark-scrollbar pr-2"
                >
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
                                        class="text-slate-500 w-6 text-right text-base"
                                        >{index + 1}</span
                                    >
                                    <div
                                        class="relative w-10 h-10 rounded bg-slate-800 flex-shrink-0 overflow-hidden group"
                                    >
                                        <img
                                            src="{API_URL}/image/{song.Id}.png"
                                            alt="Art"
                                            class="w-full h-full object-cover"
                                            onerror={(e) => {
                                                e.currentTarget.style.display =
                                                    "none";
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
                                            class="text-lg font-medium text-slate-200 truncate {index ===
                                            currentIndex
                                                ? 'text-purple-300'
                                                : ''}"
                                        >
                                            {song.Title || "Untitled"}
                                        </div>
                                        <a
                                            href="/artist/{song.Address}"
                                            class="text-sm text-slate-500 truncate hover:text-[#9ae600] transition-colors hover:underline block"
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
                                                onToggleLike(
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
        imageUrl="{API_URL}/image/{currentSong.Id}.png"
        on:close={() => (showTradeModal = false)}
        on:complete={() => {
            // No simple way to trigger a full re-fetch of the single song in Radio
            // but the getTokenBalance effect will auto-update the pill.
            showTradeModal = false;
        }}
    />
{/if}
