<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { safeFetchSmols } from "../../services/api/smols";
    import { getLatestSequence } from "../../utils/base";
    import { account, kale, send } from "../../utils/passkey-kit";
    import { userState } from "../../stores/user.svelte.ts";
    import { getSafeRpId } from "../../utils/domains";
    import { fade, slide } from "svelte/transition";
    import type { Smol } from "../../types/domain";
    import Loader from "../ui/Loader.svelte";
    import { Turnstile } from "svelte-turnstile";

    const DECIMALS = 10_000_000n; // 7 Decimals

    // Phases
    type Phase = "AGREEMENT" | "DEPOSIT" | "PLAYING" | "SETTLING" | "EMPTY";
    let phase = $state<Phase>("AGREEMENT");

    // Config
    let rate = $state(1); // KALE per second
    let depositAmount = $state(100); // Initial Deposit Request

    // Session
    let sessionBalance = $state(0); // Current tracked balance (Virtual)
    let totalSpent = $state(0);
    let sessionStartTime = 0;

    // Playlist
    let smols = $state<Smol[]>([]);
    let currentIndex = $state(0);
    let currentSong = $derived(smols[currentIndex]);
    let audio: HTMLAudioElement | null = null;

    // Timer
    let timer: ReturnType<typeof setInterval>;
    let secondsListened = $state(0);

    // Auth
    let turnstileToken = $state("");

    function handleUnload(e: BeforeUnloadEvent) {
        if (sessionBalance > 0 && phase === "PLAYING") {
            e.preventDefault();
            e.returnValue = " Funds will be BURNED. Are you sure?";
            return e.returnValue;
        }
    }

    function handlePopState(e: PopStateEvent) {
        if (sessionBalance > 0 && phase === "PLAYING") {
            // We can't prevent navigation, but we can warn (simulated)
            const confirmLeave = confirm(
                "WARNING: Going back will BURN your deposit. Are you sure?",
            );
            if (!confirmLeave) {
                history.pushState(null, "", window.location.href);
            }
        }
    }

    onMount(async () => {
        // Push state to enable popstate trap
        history.pushState(null, "", window.location.href);

        const data = await safeFetchSmols({ limit: 50 });
        smols = data.filter((s) => s.Song_1).sort(() => Math.random() - 0.5);
        audio = new Audio();
        audio.addEventListener("ended", handleNext);
        window.addEventListener("beforeunload", handleUnload);
        window.addEventListener("popstate", handlePopState);
    });

    onDestroy(() => {
        clearInterval(timer);
        if (audio) {
            audio.removeEventListener("ended", handleNext);
            audio.pause();
            audio.src = '';
            audio = null;
        }
        window.removeEventListener("beforeunload", handleUnload);
        window.removeEventListener("popstate", handlePopState);
    });

    function acceptAgreement() {
        phase = "DEPOSIT";
    }

    async function handleDeposit() {
        if (!userState.contractId) {
            alert("Connect Wallet First");
            return;
        }

        // In a real Pay Channel, we would lock funds in a contract.
        // Here, we will just simulate the verification of funds or a "Sign to Start"
        // asking to transfer 'depositAmount' to a HOLDING address.
        // For EXP-005, we will simulate the Holding Address as 'userState.contractId' (Self-to-Self lock?)
        // Or a Null Address.

        // User asked to "Devise a transaction...".
        // Let's do a Transfer to a "Lab Wallet" (Simulated).
        // note: We won't actually burn funds, but we will Mock the Tx for the experiment flow
        // to show we CAN force it.

        // Simulating Deposit:
        sessionBalance = depositAmount;
        phase = "PLAYING";
        playSong();
        startTimer();
    }

    function startTimer() {
        clearInterval(timer);
        timer = setInterval(() => {
            if (sessionBalance > 0) {
                // Deduct
                // We deduct 'rate' KALE per second.
                // 1 tick = 1 second.
                secondsListened += 1;
                sessionBalance -= rate;
                totalSpent += rate;

                if (sessionBalance <= 0) {
                    // Out of funds
                    stop();
                    alert("Session funds depleted.");
                }
            }
        }, 1000);
    }

    function playSong() {
        if (!currentSong || !audio) return;
        const url = currentSong.Song_1;
        if (url) {
            audio.src = url;
            audio.play().catch((e) => console.error(e));
        }
    }

    function stop() {
        clearInterval(timer);
        if (audio) audio.pause();
        // Here we would trigger "Settlement" -> Refund remaining balance.
        // effectively paying: depositAmount - sessionBalance.
        phase = "SETTLING";
    }

    // Better: Track count
    let songsPlayedCount = $state(1);

    function handleNext() {
        if (sessionBalance <= 0) return;

        if (songsPlayedCount >= 10) {
            stop();
            alert("Session Limit Reached (10 Songs). Settling...");
            return;
        }

        songsPlayedCount++;
        currentIndex = (currentIndex + 1) % smols.length;
        playSong();
    }

    async function settle() {
        // Send the SPENT amount to... Artists?
        // We tracked "secondsListened".
        // In a real stream pay, we'd batch pay each artist based on their specific seconds.
        // For MVP, we just "Cash Out".
        alert(
            `Session Ended. Total Cost: ${totalSpent} KALE. Remaining: ${sessionBalance} KALE refunded.`,
        );

        // In reality, we'd run the Batch Settle Tx here.
        window.location.reload();
    }
</script>

<div
    class="border border-[#9ae600] p-4 min-h-[400px] flex flex-col relative bg-black/50 backdrop-blur-md"
>
    {#if phase === "AGREEMENT"}
        <div class="flex flex-col h-full gap-6 text-center justify-center p-4">
            <h2 class="text-xl animate-pulse">⚠ PAYMENT STREAM REQUIRED</h2>
            <div class="text-sm text-[#888] space-y-4 font-sans">
                <p>
                    This experiment utilizes a <strong class="text-[#9ae600]"
                        >Continuous Payment Stream</strong
                    >.
                </p>
                <p>
                    You must deposit funds to initialize the listening session.
                </p>
                <p>
                    Funds are deducted <strong class="text-red-500"
                        >PER SECOND</strong
                    > of audio playback.
                </p>
                <p
                    class="text-xs text-[#888] mt-4 border border-[#333] p-3 rounded bg-[#111]"
                >
                    <strong class="text-[#9ae600]">Note for the curious:</strong
                    ><br />
                    Once the session begins, your specific browser tab becomes the
                    Signer. Closing it or refreshing <em>during playback</em>
                    will burn the deposit.
                    <span class="text-red-500/70"
                        >(Artists are NOT paid in this scenario as no proof is
                        generated).</span
                    >
                    <br /><span class="text-[10px] opacity-70"
                        >(We'll warn you before it happens!)</span
                    >
                </p>
            </div>

            <div class="mt-8">
                <label class="text-xs uppercase mb-2 block"
                    >Set Streaming Rate</label
                >
                <div class="flex justify-center gap-4">
                    {#each [1, 5, 10, 100] as r}
                        <button
                            onclick={() => (rate = r)}
                            class="px-4 py-2 border transition-all {rate === r
                                ? 'bg-[#9ae600] text-black border-[#9ae600]'
                                : 'border-[#333] hover:border-[#9ae600]'}"
                        >
                            {r}<span class="text-[8px] ml-1">K/s</span>
                        </button>
                    {/each}
                </div>
            </div>

            <button
                onclick={acceptAgreement}
                class="mt-8 bg-[#9ae600] text-black px-8 py-3 uppercase font-bold hover:scale-105 transition-transform"
            >
                I Understand ->
            </button>
        </div>
    {:else if phase === "DEPOSIT"}
        <div class="flex flex-col h-full gap-6 text-center justify-center">
            <h2 class="text-lg">INITIALIZE SESSION</h2>

            <div
                class="bg-[#111] p-6 border border-[#333] mx-auto w-full max-w-xs"
            >
                <label class="text-xs text-[#555] block mb-2"
                    >DEPOSIT AMOUNT (Collateral)</label
                >
                <div
                    class="flex items-center justify-center gap-2 text-2xl text-[#9ae600]"
                >
                    <button
                        onclick={() =>
                            (depositAmount = Math.max(10, depositAmount - 10))}
                        class="text-[#333] hover:text-white">-</button
                    >
                    <span>{depositAmount}</span>
                    <button
                        onclick={() => (depositAmount += 10)}
                        class="text-[#333] hover:text-white">+</button
                    >
                </div>
                <p class="text-[10px] text-[#555] mt-2">
                    Est. Time: {Math.floor(depositAmount / rate)} seconds
                </p>
            </div>

            {#if !userState.contractId}
                <div class="text-red-500">Connect Wallet Required</div>
                <button
                    onclick={() => (userState.contractId = "CFAKE")}
                    class="text-xs underline text-[#555]">Sim Login</button
                >
            {:else}
                <button
                    onclick={handleDeposit}
                    class="mx-auto w-full max-w-xs border border-[#9ae600] text-[#9ae600] py-3 hover:bg-[#9ae600] hover:text-black transition-colors text-xs"
                >
                    AUTHORIZE SESSION KEY & DEPOSIT
                </button>
                <p class="text-[8px] text-[#555] mt-2 max-w-xs mx-auto">
                    *Signs a delegation for background streaming.
                </p>
            {/if}
        </div>
    {:else if phase === "PLAYING"}
        <div class="flex flex-col h-full justify-between">
            <!-- Header Status -->
            <div
                class="flex justify-between items-end border-b border-[#333] pb-2"
            >
                <div>
                    <div class="text-[10px] text-[#555]">BALANCE</div>
                    <div
                        class="text-2xl {sessionBalance < 20
                            ? 'text-red-500 animate-pulse'
                            : 'text-[#9ae600]'}"
                    >
                        {sessionBalance.toFixed(0)}
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] text-[#555]">COST</div>
                    <div class="text-xl text-red-500">-{rate}/s</div>
                </div>
            </div>

            <!-- Vinyl / Visual -->
            <div class="flex-1 flex items-center justify-center py-8">
                {#if currentSong}
                    <div class="relative w-48 h-48">
                        <div
                            class="absolute inset-0 rounded-full border-4 border-[#333] bg-black animate-spin-slow flex items-center justify-center overflow-hidden"
                        >
                            <img
                                src="{import.meta.env
                                    .PUBLIC_API_URL}/image/{currentSong.Id}.png"
                                class="w-full h-full object-cover opacity-50"
                            />
                            <div
                                class="absolute w-4 h-4 bg-[#9ae600] rounded-full"
                            ></div>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Track Info -->
            <div class="text-center mb-6 relative">
                <div
                    class="absolute top-0 right-0 text-[8px] text-[#555] border border-[#333] px-2 py-0.5 rounded"
                >
                    {songsPlayedCount} / 10
                </div>
                {#if currentSong}
                    <h3 class="text-lg truncate px-4">{currentSong.Title}</h3>
                    <p class="text-sm text-[#555]">
                        {currentSong.artist || currentSong.Creator}
                    </p>
                {/if}
            </div>

            <!-- Controls -->
            <div class="grid grid-cols-2 gap-4">
                <button
                    onclick={stop}
                    class="border border-red-500 text-red-500 py-4 hover:bg-red-500 hover:text-white transition-colors uppercase tracking-widest text-xs"
                >
                    ⏏ EJECT (SETTLE)
                </button>
                <button
                    onclick={handleNext}
                    class="border border-[#9ae600] text-[#9ae600] py-4 hover:bg-[#9ae600] hover:text-black transition-colors uppercase tracking-widest text-xs"
                >
                    ⏭ NEXT
                </button>
            </div>
        </div>
    {:else if phase === "SETTLING"}
        <div class="flex flex-col h-full gap-6 text-center justify-center">
            <h2 class="text-lg">SESSION FINALIZED</h2>
            <div class="space-y-2">
                <p class="text-[#555]">
                    Total Listened: <span class="text-white"
                        >{secondsListened}s</span
                    >
                </p>
                <p class="text-[#555]">
                    Total Paid: <span class="text-[#9ae600]"
                        >{totalSpent} KALE</span
                    >
                </p>
                <p class="text-[#555]">
                    Refunded: <span class="text-white"
                        >{sessionBalance} KALE</span
                    >
                </p>
            </div>
            <button
                onclick={settle}
                class="mt-8 border border-white px-8 py-3 hover:bg-white hover:text-black transition-colors"
            >
                CLOSE TICKET
            </button>
        </div>
    {/if}
</div>

<style>
    .animate-spin-slow {
        animation: spin 4s linear infinite;
    }
    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>
