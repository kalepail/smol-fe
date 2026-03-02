<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { safeFetchSmols } from "../../services/api/smols";
    import { getLatestSequence } from "../../utils/base";
    import { account, kale, send } from "../../utils/passkey-kit";
    import { userState } from "../../stores/user.svelte.ts";
    import { getSafeRpId } from "../../utils/domains";
    import { fade, slide } from "svelte/transition";
    import type { Keypair as KeypairType } from "@stellar/stellar-sdk";
    import type { Smol } from "../../types/domain";
    import Loader from "../ui/Loader.svelte";
    import { Turnstile } from "svelte-turnstile";

    const DECIMALS = 10_000_000n; // 7 Decimals

    // Phases
    type Phase =
        | "AGREEMENT"
        | "DEPOSIT"
        | "PLAYING"
        | "SETTLING"
        | "SUCCESS"
        | "EMPTY";
    let phase = $state<Phase>("AGREEMENT");

    // Success state
    let txHash = $state("");

    // Config
    let rate = $state(1); // KALE per second
    let depositAmount = $state(100); // Initial Deposit Request

    // Session
    let sessionKey = $state<KeypairType | null>(null);
    let isAuthorizing = $state(false);
    let isSettling = $state(false);
    let sessionBalance = $state(0); // Current tracked balance (Virtual)
    let totalSpent = $state(0);
    let artistDebts = $state<Record<string, number>>({}); // artistAddress -> secondCount

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

    // Dynamic Imports for heavy deps
    let Keypair: any;
    let SignerStore: any;
    let buildBatchKaleTransfer: any;
    let Networks: any;

    onMount(async () => {
        // Load heavy SDKs only on the client
        const sdk = await import("@stellar/stellar-sdk/minimal");
        const pk = await import("passkey-kit");
        const bt = await import("../../utils/batch-transfer");

        Keypair = sdk.Keypair;
        Networks = sdk.Networks;
        SignerStore = pk.SignerStore;
        buildBatchKaleTransfer = bt.buildBatchKaleTransfer;

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
            audio.src = "";
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

        isAuthorizing = true;
        try {
            // 1. Generate Ephemeral Session Key
            const key = Keypair.random();
            sessionKey = key;

            // 2. Build the "add signer" transaction
            // This adds the Ed25519 key as a temporary signer to the smart wallet
            console.log(
                "[StreamPay] Authorizing Session Key:",
                key.publicKey(),
            );
            const pk = await account.get();
            const addSignerTx = await pk.addEd25519(
                key.publicKey(),
                undefined, // No specific limits for the experiment
                SignerStore.Temporary,
            );

            // 3. Sign with Passkey (biometric prompt) and submit
            // This is the ONLY passkey signature needed for the entire session
            console.log("[StreamPay] Signing session key authorization...");
            await pk.sign(addSignerTx);

            // 4. Submit to relayer
            console.log("[StreamPay] Submitting session key authorization...");
            await send(addSignerTx);
            console.log("[StreamPay] Session Key registered on-chain!");

            // 5. Start Session
            sessionBalance = depositAmount;
            phase = "PLAYING";
            playSong();
            startTimer();
            console.log(
                "[StreamPay] Session Authorized. Background signing enabled.",
            );
        } catch (e) {
            console.error("[StreamPay] Authorization Failed:", e);
            alert(
                "Authorization failed. Ensure your wallet is connected and try again.",
            );
        } finally {
            isAuthorizing = false;
        }
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

                // Track Artist Debt
                const artist =
                    currentSong?.Creator ||
                    currentSong?.Address ||
                    currentSong?.artist;
                if (artist) {
                    artistDebts[artist] = (artistDebts[artist] || 0) + rate;
                }

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
        // Song_1 is a UUID, construct full URL
        const songId = currentSong.Song_1 || currentSong.Id;
        if (songId) {
            const url = `${import.meta.env.PUBLIC_API_URL}/song/${songId}.mp3`;
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

    // Retry configuration
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 2000;
    let retryCount = $state(0);
    let settlementStatus = $state("");

    /**
     * Delay helper with exponential backoff
     */
    function delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function settle() {
        if (!userState.contractId || !sessionKey || totalSpent <= 0) {
            alert("Nothing to settle.");
            phase = "EMPTY";
            return;
        }

        isSettling = true;
        retryCount = 0;
        settlementStatus = "Preparing batch payment...";

        try {
            console.log(
                "[StreamPay] Finalizing Session. Batch Paying Artists...",
                artistDebts,
            );

            // 1. Prepare Transfers - filter out invalid addresses
            settlementStatus = "Building transfer batch...";

            // Filter out NULL_ACCOUNT and invalid addresses
            const NULL_ACCOUNT =
                "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
            const validEntries = Object.entries(artistDebts).filter(
                ([addr, amount]) => {
                    // Skip null/undefined addresses
                    if (!addr) return false;
                    // Skip NULL_ACCOUNT
                    if (addr === NULL_ACCOUNT) {
                        console.warn(
                            "[StreamPay] Skipping NULL_ACCOUNT recipient",
                        );
                        return false;
                    }
                    // Skip if amount is 0 or negative
                    if (amount <= 0) return false;
                    // Basic format validation (C-addr or G-addr)
                    if (!addr.startsWith("C") && !addr.startsWith("G")) {
                        console.warn(
                            "[StreamPay] Skipping invalid address:",
                            addr,
                        );
                        return false;
                    }
                    return true;
                },
            );

            if (validEntries.length === 0) {
                throw new Error("No valid artist addresses to pay");
            }

            console.log(
                `[StreamPay] Paying ${validEntries.length} artists (filtered from ${Object.keys(artistDebts).length})`,
            );

            const transfers = validEntries.map(([to, amount]) => ({
                to,
                amount: BigInt(amount) * 10_000_000n, // Convert to 7 Decimals
            }));

            // 1.5. BALANCE PRE-CHECK - Verify user has enough KALE before proceeding
            settlementStatus = "Verifying balance...";
            const totalTransferAmount = transfers.reduce(
                (sum, t) => sum + t.amount,
                0n,
            );

            try {
                const kaleContract = await kale.get();
                const { result: userBalance } = await kaleContract.balance({
                    id: userState.contractId,
                });

                console.log(
                    `[StreamPay] Balance check: Need ${totalTransferAmount}, Have ${userBalance}`,
                );

                if (userBalance < totalTransferAmount) {
                    const needed = Number(totalTransferAmount) / 10_000_000;
                    const have = Number(userBalance) / 10_000_000;
                    throw new Error(
                        `Insufficient KALE balance. Need ${needed.toFixed(2)}, have ${have.toFixed(2)}`,
                    );
                }
            } catch (e: any) {
                if (e.message?.includes("Insufficient KALE")) {
                    throw e; // Re-throw balance errors
                }
                console.warn(
                    "[StreamPay] Balance pre-check failed, proceeding anyway:",
                    e.message,
                );
                // Continue - simulation will catch any real issues
            }

            // 2. Build Batch Transaction
            // The batch contract takes the SENDER'S C-address.
            settlementStatus = "Simulating transaction...";
            const xdr = await buildBatchKaleTransfer(
                userState.contractId,
                transfers,
            );

            // 3. BACKGROUND SIGN using the Session Key
            // NO PASSKEY PROMPT HERE!
            settlementStatus = "Signing with session key...";
            console.log("[StreamPay] Signing Batch Tx with Session Key...");
            const signedTx = await (
                await account.get()
            ).sign(xdr, {
                keypair: sessionKey,
                networkPassphrase: Networks.PUBLIC,
            });

            // 4. Submit to Relayer with Retry
            await submitWithRetry(signedTx);
        } catch (e: any) {
            console.error("[StreamPay] Settlement Failed:", e);
            const msg = e?.message || "Unknown error";
            settlementStatus = `Failed: ${msg.substring(0, 50)}...`;
            alert(`Settlement failed: ${msg}`);
        } finally {
            isSettling = false;
        }
    }

    /**
     * Submit transaction with automatic retry and exponential backoff
     */
    async function submitWithRetry(signedTx: any) {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            retryCount = attempt;

            if (attempt > 0) {
                const waitTime = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
                settlementStatus = `Retry ${attempt}/${MAX_RETRIES} in ${(waitTime / 1000).toFixed(0)}s...`;
                console.log(
                    `[StreamPay] Retry ${attempt}/${MAX_RETRIES} after ${waitTime}ms...`,
                );
                await delay(waitTime);
            }

            settlementStatus =
                attempt > 0
                    ? `Retry ${attempt}/${MAX_RETRIES}: Submitting...`
                    : "Submitting to network...";

            try {
                const result = await send(signedTx);
                console.log("[StreamPay] Settlement Success!", result);

                // Capture transaction hash from result
                txHash =
                    result?.hash || result?.transactionHash || result?.id || "";
                settlementStatus = "✓ Settlement complete!";

                // Transition to success screen instead of reload
                isSettling = false;
                phase = "SUCCESS";
                return; // Success - exit retry loop
            } catch (e: any) {
                lastError = e;
                const msg = e?.message || "";

                // Check if it's a retryable error (503, 502, timeout)
                const isRetryable =
                    msg.includes("temporarily unavailable") ||
                    msg.includes("503") ||
                    msg.includes("502") ||
                    msg.includes("timeout");

                if (isRetryable && attempt < MAX_RETRIES) {
                    console.warn(
                        `[StreamPay] Attempt ${attempt + 1} failed (retryable):`,
                        msg,
                    );
                    settlementStatus = `Network busy... preparing retry ${attempt + 1}`;
                    continue; // Try again
                }

                // Non-retryable error or max retries reached
                throw e;
            }
        }

        // If we get here, all retries failed
        throw lastError || new Error("All retry attempts failed");
    }
</script>

<div
    class="border border-[#9ae600] p-4 min-h-[400px] flex flex-col relative bg-black/50 backdrop-blur-md"
>
    {#if phase === "AGREEMENT"}
        <div class="flex flex-col h-full gap-4 text-center justify-center p-4">
            <h2 class="text-xl animate-pulse">🎧 STREAM. PAY. VIBE.</h2>
            <div class="text-sm text-[#888] space-y-3 font-sans">
                <p>
                    Welcome to <strong class="text-[#9ae600]">StreamPay</strong>
                    — where every second counts.
                </p>
                <p>
                    Deposit KALE, hit play, and watch artists get paid <strong
                        class="text-[#9ae600]">in real-time</strong
                    >.
                </p>
                <p>
                    No subscriptions. No middlemen. Just <strong
                        class="text-red-500">per-second compensation</strong
                    >.
                </p>
                <div
                    class="text-xs text-[#888] mt-4 border border-[#333] p-3 rounded bg-[#111] text-left"
                >
                    <strong class="text-[#9ae600]">🔐 Session Keys:</strong>
                    <span class="block mt-1"
                        >One passkey = unlimited background payments.</span
                    >
                    <span class="block text-[#888] mt-1"
                        >Eject anytime → artists get paid, you keep the rest.</span
                    >
                </div>
            </div>

            <div class="mt-8">
                <label class="text-xs uppercase mb-2 block"
                    >Pick Your Burn Rate</label
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
                LET'S GO →
            </button>
        </div>
    {:else if phase === "DEPOSIT"}
        <div class="flex flex-col h-full gap-6 text-center justify-center">
            <h2 class="text-lg">💰 LOAD UP</h2>

            <div
                class="bg-[#111] p-6 border border-[#333] mx-auto w-full max-w-xs"
            >
                <label class="text-xs text-[#555] block mb-2"
                    >SESSION BUDGET</label
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
                    ≈ {Math.floor(depositAmount / rate)} seconds of music
                </p>
            </div>

            {#if isAuthorizing}
                <div class="flex flex-col items-center gap-4 py-8">
                    <Loader />
                    <p
                        class="text-xs animate-pulse text-[#9ae600] uppercase font-bold tracking-widest"
                    >
                        Generating Session Key...
                    </p>
                    <p class="text-[10px] text-[#555] font-sans">
                        One passkey prompt, then hands-free streaming.
                    </p>
                </div>
            {:else if !userState.contractId}
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
                    🔑 UNLOCK SESSION
                </button>
                <p class="text-[8px] text-[#555] mt-2 max-w-xs mx-auto">
                    One-time passkey auth enables hands-free payments.
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
                    ⏏️ EJECT
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
            <h2 class="text-lg">⏹️ SESSION COMPLETE</h2>
            {#if isSettling}
                <div class="flex flex-col items-center gap-4 py-8">
                    <Loader />
                    <p
                        class="text-xs animate-pulse text-[#9ae600] uppercase font-bold tracking-widest"
                    >
                        {settlementStatus || "Atomic Settlement In Progress..."}
                    </p>
                    {#if retryCount > 0}
                        <div
                            class="flex items-center gap-2 text-[10px] text-yellow-500"
                        >
                            <span
                                class="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse"
                            ></span>
                            Retry {retryCount}/{MAX_RETRIES}
                        </div>
                    {/if}
                    <p class="text-[10px] text-[#555] font-sans">
                        Session key doing the heavy lifting. Sit back.
                    </p>
                </div>
            {:else}
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
                    💸 PAY THE ARTISTS
                </button>
            {/if}
        </div>
    {:else if phase === "SUCCESS"}
        <div
            class="flex flex-col h-full gap-6 text-center justify-center relative overflow-hidden"
            transition:fade
        >
            <!-- Confetti -->
            <div
                class="confetti-container absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center"
            >
                {#each Array(30) as _, i}
                    <div
                        class="confetti"
                        style="--delay: {i * 0.03}s; --angle: {(i * 360) /
                            30}deg; --distance: {80 +
                            Math.random() * 120}px; --color: {[
                            '#9ae600',
                            '#ff6b6b',
                            '#4ecdc4',
                            '#ffe66d',
                            '#95e1d3',
                        ][i % 5]}"
                    ></div>
                {/each}
            </div>

            <!-- Animated Success Checkmark -->
            <div class="relative mx-auto">
                <div
                    class="w-24 h-24 rounded-full border-4 border-[#9ae600] flex items-center justify-center bg-[#9ae600]/10 animate-pulse"
                >
                    <span class="text-5xl text-[#9ae600]">✓</span>
                </div>
                <div
                    class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#9ae600] text-black text-sm font-bold flex items-center justify-center animate-bounce"
                >
                    🎵
                </div>
            </div>

            <h2 class="text-2xl text-[#9ae600] font-bold tracking-wide">
                STREAM COMPLETE
            </h2>

            <!-- Session Stats -->
            <div
                class="bg-[#111] border border-[#333] p-6 mx-auto w-full max-w-sm space-y-3"
            >
                <div class="flex justify-between text-sm">
                    <span class="text-[#555]">Duration</span>
                    <span class="text-white font-mono">{secondsListened}s</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-[#555]">Artists Paid</span>
                    <span class="text-[#9ae600] font-mono"
                        >{Object.keys(artistDebts).length}</span
                    >
                </div>
                <div
                    class="flex justify-between text-sm border-t border-[#333] pt-3"
                >
                    <span class="text-[#555]">Total Paid</span>
                    <span class="text-[#9ae600] font-bold text-lg"
                        >{totalSpent} KALE</span
                    >
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-[#555]">Unspent (returned)</span>
                    <span class="text-white font-mono"
                        >{sessionBalance} KALE</span
                    >
                </div>
            </div>

            <!-- Transaction Link -->
            {#if txHash}
                <a
                    href="https://stellar.expert/explorer/public/tx/{txHash}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="group mx-auto flex items-center gap-2 px-4 py-2 border border-[#333] hover:border-[#9ae600] transition-all rounded-full text-xs"
                >
                    <span
                        class="text-[#555] group-hover:text-[#9ae600] transition-colors"
                        >View on Stellar Expert</span
                    >
                    <span
                        class="text-[#9ae600] font-mono truncate max-w-[120px]"
                        >{txHash.substring(0, 8)}...{txHash.substring(
                            txHash.length - 4,
                        )}</span
                    >
                    <span
                        class="text-[#555] group-hover:translate-x-1 transition-transform"
                        >→</span
                    >
                </a>
            {/if}

            <!-- Play Again -->
            <button
                onclick={() => window.location.reload()}
                class="mt-4 mx-auto bg-[#9ae600] text-black px-8 py-4 uppercase font-bold text-sm hover:scale-105 transition-transform tracking-widest"
            >
                🔄 PLAY AGAIN
            </button>

            <p class="text-[8px] text-[#555] mt-2">
                Thanks for using StreamPay! Artists have been compensated
                directly.
            </p>
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

    /* Confetti Explosion Animation */
    .confetti {
        position: absolute;
        width: 10px;
        height: 10px;
        background: var(--color, #9ae600);
        opacity: 0;
        animation: confetti-explode 1.5s ease-out var(--delay, 0s) forwards;
    }

    .confetti:nth-child(odd) {
        width: 6px;
        height: 12px;
        border-radius: 2px;
    }

    .confetti:nth-child(even) {
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }

    @keyframes confetti-explode {
        0% {
            transform: rotate(var(--angle)) translateY(0) scale(0);
            opacity: 0;
        }
        20% {
            opacity: 1;
            transform: rotate(var(--angle))
                translateY(calc(var(--distance) * 0.3)) scale(1.2);
        }
        100% {
            transform: rotate(var(--angle)) translateY(var(--distance))
                rotate(720deg) scale(0);
            opacity: 0;
        }
    }
</style>
