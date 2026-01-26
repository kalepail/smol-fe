<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { safeFetchSmols } from "../../services/api/smols";
    import { getLatestSequence } from "../../utils/base";
    import { account, kale, send } from "../../utils/passkey-kit";
    import { userState } from "../../stores/user.svelte.ts";
    import { getSafeRpId } from "../../utils/domains";
    import { fade, fly, scale } from "svelte/transition";
    import { spring } from "svelte/motion";
    import type { Smol } from "../../types/domain";
    import Loader from "../ui/Loader.svelte";
    import { Turnstile } from "svelte-turnstile";

    const AMOUNT_PER_TIP_BASE = 10000000n; // 1 KALE = 10^7 units
    const DECIMALS_FACTOR = 10000000n;

    let smols = $state<Smol[]>([]);
    let loading = $state(true);
    let currentIndex = $state(0);
    // Queue stores user-selected amounts (whole KALE)
    let tipQueue = $state<{ artist: string; songId: string; amount: number }[]>(
        [],
    );

    // Tip Selection
    const TIP_OPTIONS = [1, 10, 100, 1000];
    let selectedTipAmount = $state(10); // Default 10 KALE
    let customTipAmount = $state("");
    let isCustom = $state(false);

    // Audio
    let audio: HTMLAudioElement | null = null;

    // Interaction
    let cardX = spring(0, { stiffness: 0.1, damping: 0.4 });
    let cardY = spring(0, { stiffness: 0.1, damping: 0.4 });
    let cardRotate = spring(0, { stiffness: 0.1, damping: 0.4 });
    let dragging = false;
    let startX = 0;
    let startY = 0;

    // Settlement
    let isSettling = $state(false);
    let settleStatus = $state("");
    let settleStep = $state(0);
    // Calc total
    let totalTipsAmount = $derived(
        tipQueue.reduce((acc, t) => acc + t.amount, 0),
    );
    let turnstileToken = $state("");

    onMount(async () => {
        try {
            // Timeout fallback
            setTimeout(() => {
                if (loading) {
                    console.warn("Fetch timed out, forcing load state.");
                    loading = false;
                }
            }, 8000);

            audio = new Audio();
            const data = await safeFetchSmols({ limit: 50 });
            smols = data
                .filter((s) => s.Song_1 && s.Address)
                .sort(() => Math.random() - 0.5)
                .slice(0, 10);
            loading = false;
            playCurrent();
        } catch (e) {
            console.error(e);
            loading = false;
        }
    });

    onDestroy(() => {
        if (audio) {
            audio.pause();
            audio = null;
        }
    });

    function playCurrent() {
        if (!audio || currentIndex >= smols.length) return;
        const song = smols[currentIndex];
        const url = song.Song_1;
        if (url) {
            audio.src = url;
            audio.volume = 0.5;
            audio.play().catch(() => {});
        }
    }

    function handlePanStart(e: MouseEvent | TouchEvent) {
        dragging = true;
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        startX = clientX;
        startY = clientY;
    }

    function handlePanMove(e: MouseEvent | TouchEvent) {
        if (!dragging) return;
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        cardX.set(deltaX);
        cardY.set(deltaY);
        cardRotate.set(deltaX * 0.1);
    }

    function handlePanEnd() {
        dragging = false;
        // Basic threshold logic could go here, but for now reset unless swiped via buttons
        cardX.set(0);
        cardY.set(0);
        cardRotate.set(0);
    }

    function swipe(dir: "left" | "right") {
        const song = smols[currentIndex];

        // Visual feedback
        cardX.set(dir === "right" ? 500 : -500);
        cardRotate.set(dir === "right" ? 20 : -20);

        setTimeout(() => {
            if (dir === "right" && song.Address) {
                const amount = isCustom
                    ? parseFloat(customTipAmount) || 1
                    : selectedTipAmount;
                tipQueue = [
                    ...tipQueue,
                    { artist: song.Address, songId: song.Id, amount: amount },
                ];
            }

            currentIndex++;
            cardX.set(0, { hard: true });
            cardY.set(0, { hard: true });
            cardRotate.set(0, { hard: true });

            if (currentIndex < smols.length) {
                playCurrent();
            } else {
                if (audio) audio.pause();
            }
        }, 200);
    }

    function setTipOption(val: number) {
        selectedTipAmount = val;
        isCustom = false;
    }

    async function settleTips() {
        if (!userState.contractId || !userState.keyId) {
            alert("Please connect your wallet first!");
            return;
        }
        if (!turnstileToken) {
            alert("Please verify you are human.");
            return;
        }

        isSettling = true;
        settleStep = 0;

        const amountByArtist = new Map<string, number>();
        for (const tip of tipQueue) {
            const current = amountByArtist.get(tip.artist) || 0;
            amountByArtist.set(tip.artist, current + tip.amount);
        }

        let completed = 0;

        try {
            for (const [artist, totalAmount] of amountByArtist) {
                settleStatus = `Sending ${totalAmount} KALE to ${artist.slice(0, 4)}...`;
                const amountBigInt = BigInt(
                    Math.floor(totalAmount * Number(DECIMALS_FACTOR)),
                );

                // 1. Build Tx
                let tx = await kale.get().transfer({
                    from: userState.contractId,
                    to: artist,
                    amount: amountBigInt,
                });

                // 2. Sign
                const sequence = await getLatestSequence();
                tx = await account.get().sign(tx, {
                    rpId: getSafeRpId(window.location.hostname),
                    keyId: userState.keyId,
                    expiration: sequence + 60,
                });

                // 3. Send
                await send(tx, turnstileToken);

                completed++;
                settleStep = completed;

                // Sequential safe mode
                await new Promise((r) => setTimeout(r, 1000));
            }

            settleStatus = "All tips sent!";
            setTimeout(() => {
                window.location.href = "/labs";
            }, 2000);
        } catch (e: any) {
            console.error(e);
            settleStatus = `Error: ${e.message}`;
            alert("Failed to settle all tips. Check console.");
        } finally {
            isSettling = false;
        }
    }
</script>

<div class="relative w-full max-w-sm mx-auto h-[550px] font-pixel">
    {#if loading}
        <div class="flex items-center justify-center h-full">
            <Loader />
        </div>
    {:else if currentIndex >= smols.length}
        <div
            class="flex flex-col items-center justify-center h-full text-center p-4 space-y-6"
        >
            <h2 class="text-2xl text-white">Game Over</h2>
            <div class="space-y-2">
                <p class="text-[#9ae600]">You queued {tipQueue.length} tips!</p>
                <p class="text-xs text-slate-500">
                    Total: {totalTipsAmount} KALE
                </p>
            </div>

            {#if !userState.contractId}
                <div class="flex flex-col gap-2 items-center">
                    <p class="text-red-500 text-xs">Connect Wallet to Tip</p>
                </div>
            {:else if !isSettling}
                <div class="flex justify-center my-4">
                    <Turnstile
                        siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
                        on:callback={(e) => (turnstileToken = e.detail.token)}
                        theme="dark"
                    />
                </div>
                <button
                    onclick={settleTips}
                    disabled={!turnstileToken}
                    class="w-full border border-[#9ae600] bg-[#9ae600]/10 px-6 py-3 rounded-lg hover:bg-[#9ae600] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    SEND TIPS
                </button>
            {:else}
                <div class="w-full bg-[#333] h-2 rounded-full overflow-hidden">
                    <div
                        class="bg-[#9ae600] h-full transition-all duration-300"
                        style="width: {(settleStep /
                            (new Set(tipQueue.map((t) => t.artist)).size ||
                                1)) *
                            100}%"
                    ></div>
                </div>
                <p class="text-xs text-[#9ae600] animate-pulse">
                    {settleStatus}
                </p>
            {/if}
        </div>
    {:else}
        {#each [smols[currentIndex]] as song (song.Id)}
            <div
                class="absolute inset-0 bg-black border border-[#333] rounded-2xl overflow-hidden glass-panel select-none touch-none"
                style="transform: translate({$cardX}px, {$cardY}px) rotate({$cardRotate}deg);"
                onmousedown={handlePanStart}
                onmousemove={handlePanMove}
                onmouseup={handlePanEnd}
                onmouseleave={handlePanEnd}
                ontouchstart={handlePanStart}
                ontouchmove={handlePanMove}
                ontouchend={handlePanEnd}
            >
                <img
                    src="{import.meta.env.PUBLIC_API_URL}/image/{song.Id}.png"
                    class="w-full h-3/4 object-cover pointer-events-none"
                    draggable="false"
                    oncontextmenu={(e) => e.preventDefault()}
                />
                <div
                    class="p-6 bg-gradient-to-t from-black via-black/80 to-transparent absolute bottom-0 w-full"
                >
                    <h3
                        class="text-lg text-white font-bold shadow-black drop-shadow-md mb-1"
                    >
                        {song.Title}
                    </h3>
                    <p class="text-xs text-[#9ae600] uppercase tracking-wider">
                        {song.artist || song.Creator || "Unknown"}
                    </p>
                </div>

                <!-- Overlay Stamps -->
                <div
                    class="absolute top-8 left-8 border-4 border-[#9ae600] text-[#9ae600] px-4 py-2 rounded-lg text-2xl font-bold uppercase -rotate-12 opacity-0 transition-opacity"
                    style="opacity: {$cardX > 50 ? ($cardX - 50) / 100 : 0}"
                >
                    TIP!
                </div>
                <div
                    class="absolute top-8 right-8 border-4 border-red-500 text-red-500 px-4 py-2 rounded-lg text-2xl font-bold uppercase rotate-12 opacity-0 transition-opacity"
                    style="opacity: {$cardX < -50 ? (-$cardX - 50) / 100 : 0}"
                >
                    PASS
                </div>
            </div>
        {/each}

        <!-- Tip Selector -->
        <div
            class="absolute -bottom-16 w-full flex justify-center gap-2 px-4 z-20"
        >
            {#each TIP_OPTIONS as opt}
                <button
                    onclick={() => setTipOption(opt)}
                    class="px-2 py-1 text-[8px] rounded border transition-all {selectedTipAmount ===
                        opt && !isCustom
                        ? 'bg-[#9ae600] text-black border-[#9ae600]'
                        : 'bg-black text-[#555] border-[#333] hover:border-[#9ae600]'}"
                >
                    {opt}
                </button>
            {/each}
            <div class="relative">
                <button
                    onclick={() => (isCustom = true)}
                    class="px-2 py-1 text-[8px] rounded border transition-all {isCustom
                        ? 'bg-[#9ae600] text-black border-[#9ae600]'
                        : 'bg-black text-[#555] border-[#333] hover:border-[#9ae600]'}"
                >
                    CUSTOM
                </button>
                {#if isCustom}
                    <input
                        type="number"
                        bind:value={customTipAmount}
                        class="absolute bottom-8 left-0 w-16 bg-black border border-[#9ae600] text-[#9ae600] text-xs p-1 text-center rounded outline-none"
                        placeholder="?"
                    />
                {/if}
            </div>
        </div>

        <div class="absolute -bottom-40 w-full flex justify-center gap-8 px-8">
            <button
                onclick={() => swipe("left")}
                class="w-16 h-16 rounded-full border-2 border-slate-700 bg-black text-slate-500 flex items-center justify-center hover:border-red-500 hover:text-red-500 hover:scale-110 transition-all active:scale-95 shadow-lg"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2.5"
                    stroke="currentColor"
                    class="w-8 h-8"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
            <button
                onclick={() => swipe("right")}
                class="w-16 h-16 rounded-full border-2 border-slate-700 bg-black text-slate-500 flex items-center justify-center hover:border-[#9ae600] hover:text-[#9ae600] hover:scale-110 transition-all active:scale-95 shadow-lg"
            >
                <div class="flex flex-col items-center">
                    <span class="text-[10px] font-bold">TIP</span>
                    <span class="text-[8px] tracking-tighter"
                        >{isCustom
                            ? customTipAmount
                                ? `${customTipAmount}`
                                : "?"
                            : selectedTipAmount}</span
                    >
                </div>
            </button>
        </div>
    {/if}
</div>

<style>
    .glass-panel {
        backdrop-filter: blur(10px);
        background: rgba(20, 20, 20, 0.6);
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
    }
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
</style>
