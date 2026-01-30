<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { safeFetchSmols } from "../../services/api/smols";
    import { getLatestSequence } from "../../utils/base";
    import { account, send } from "../../utils/passkey-kit";
    import { withRetry } from "../../utils/retry";
    // NOTE: Dynamic import for confetti to avoid SSR crash
    import { userState } from "../../stores/user.svelte.ts";
    import {
        balanceState,
        updateContractBalance,
    } from "../../stores/balance.svelte";
    import { getSafeRpId } from "../../utils/domains";
    import { fade, fly, scale } from "svelte/transition";
    import { spring } from "svelte/motion";
    import type { Smol } from "../../types/domain";
    import Loader from "../ui/Loader.svelte";
    import { Turnstile } from "svelte-turnstile";
    import {
        recordInteraction,
        loadStats,
        type GameStats,
        ACHIEVEMENTS,
    } from "../../services/game/stats";
    import { selectSong } from "../../stores/audio.svelte";

    // PROD FIX: If we have an OZ API key, use direct relayer regardless of hostname.
    const hasApiKey = !!import.meta.env.PUBLIC_RELAYER_API_KEY;
    const isDirectRelayer = hasApiKey;

    const DECIMALS_FACTOR = 10000000n;

    let confetti: any; // Dynamically imported

    let smols = $state<Smol[]>([]);
    let loading = $state(true);
    let currentIndex = $state(0);
    let tipQueue = $state<{ artist: string; songId: string; amount: number }[]>(
        [],
    );

    // Tip Selection
    const TIP_OPTIONS = [1, 10, 100, 1000];
    let selectedTipAmount = $state(10); // Default 10 KALE
    let customTipAmount = $state("");
    let isCustom = $state(false);

    // Audio & Visualizer
    let audio: HTMLAudioElement | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array | null = null;
    let visualizerCanvas = $state<HTMLCanvasElement>();
    let visualizerAnimationId: number;
    let isPlaying = $state(false);
    let gameStarted = $state(false); // Requires user click to start (autoplay policy)

    // Interaction
    let cardX = spring(0, { stiffness: 0.15, damping: 0.5 });
    let cardY = spring(0, { stiffness: 0.15, damping: 0.5 });
    let cardRotate = spring(0, { stiffness: 0.15, damping: 0.5 });
    let cardScale = spring(1, { stiffness: 0.2, damping: 0.5 });
    let dragging = false;
    let startX = 0;
    let startY = 0;

    // Settlement
    let isSettling = $state(false);
    let settleStatus = $state("");
    let settleStep = $state(0);
    let totalTipsAmount = $derived(
        tipQueue.reduce((acc, t) => acc + t.amount, 0),
    );
    let turnstileToken = $state("");
    let stats = $state<GameStats>(loadStats());

    // Balance derived
    let formattedBalance = $derived(
        typeof balanceState.balance === "bigint"
            ? Number(balanceState.balance / DECIMALS_FACTOR)
            : null,
    );
    let hasEnoughBalance = $derived(
        formattedBalance !== null && formattedBalance >= totalTipsAmount,
    );

    // Track timeouts for cleanup
    let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
    let swipeTimeout: ReturnType<typeof setTimeout> | null = null;
    let settleDelayTimeout: ReturnType<typeof setTimeout> | null = null;
    let redirectTimeout: ReturnType<typeof setTimeout> | null = null;

    // Floating Particles
    type Particle = { id: number; emoji: string; x: number };
    let particles = $state<Particle[]>([]);
    let particleIdCounter = 0;

    function spawnParticle(emoji: string, dir: "left" | "right") {
        const id = particleIdCounter++;
        // Center the explosion more, less lateral movement
        const xOffset = dir === "right" ? 50 : -50;
        particles.push({ id, emoji, x: xOffset });

        // Cleanup after animation
        setTimeout(() => {
            particles = particles.filter((p) => p.id !== id);
        }, 600); // Match animation duration
    }

    onMount(async () => {
        // Dynamic import to prevent SSR 500 errors
        const module = await import("canvas-confetti");
        confetti = module.default;

        // Initialize Audio Context (requires user interaction really, but setup here)
        audio = new Audio();
        audio.crossOrigin = "anonymous";
        try {
            loadingTimeout = setTimeout(() => {
                if (loading) {
                    console.warn("Fetch timed out, forcing load state.");
                    loading = false;
                }
                loadingTimeout = null;
            }, 8000);

            audio = new Audio();
            // Note: No AudioContext/visualizer - CORS blocks it and breaks playback

            audio.addEventListener("play", () => (isPlaying = true));
            audio.addEventListener("pause", () => (isPlaying = false));
            audio.addEventListener("ended", () => {
                isPlaying = false;
                swipe("right");
            });

            const data = await safeFetchSmols({ limit: 100 });
            // Filter to unique artists (one song per artist)
            const seenArtists = new Set<string>();
            smols = data
                .filter((s) => s.Song_1 && s.Address)
                .sort(() => Math.random() - 0.5)
                .filter((s) => {
                    if (seenArtists.has(s.Address!)) return false;
                    seenArtists.add(s.Address!);
                    return true;
                })
                .slice(0, 15);
            console.log(
                "[KaleOrFail] Loaded",
                smols.length,
                "unique artists (Game Size 15)",
            );
            loading = false;
            // Don't autoplay - wait for user gesture (gameStarted)

            // Fetch balance if logged in
            if (userState.contractId) {
                updateContractBalance(userState.contractId);
            }
        } catch (e) {
            console.error(e);
            loading = false;
        }
    });

    onDestroy(() => {
        if (audio) {
            audio.pause();
            audio.src = "";
            audio = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        if (visualizerAnimationId) {
            cancelAnimationFrame(visualizerAnimationId);
        }
        if (loadingTimeout) clearTimeout(loadingTimeout);
        if (swipeTimeout) clearTimeout(swipeTimeout);
        if (settleDelayTimeout) clearTimeout(settleDelayTimeout);
        if (redirectTimeout) clearTimeout(redirectTimeout);
    });

    function setupAudioContext() {
        if (audioContext || !audio) return;
        try {
            audioContext = new AudioContext();
            const source = audioContext.createMediaElementSource(audio);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            drawVisualizer();
        } catch (e) {
            console.warn("Could not setup audio visualizer:", e);
        }
    }

    function drawVisualizer() {
        if (!visualizerCanvas || !analyser || !dataArray) return;
        const ctx = visualizerCanvas.getContext("2d");
        if (!ctx) return;

        analyser.getByteFrequencyData(dataArray as Uint8Array<ArrayBuffer>);

        const width = visualizerCanvas.width;
        const height = visualizerCanvas.height;
        ctx.clearRect(0, 0, width, height);

        const barCount = 32;
        const barWidth = width / barCount;
        const step = Math.floor(dataArray.length / barCount);

        for (let i = 0; i < barCount; i++) {
            const value = dataArray[i * step];
            const barHeight = (value / 255) * height * 0.8;

            const gradient = ctx.createLinearGradient(
                0,
                height,
                0,
                height - barHeight,
            );
            gradient.addColorStop(0, "#9ae600");
            gradient.addColorStop(1, "#6aa600");

            ctx.fillStyle = gradient;
            ctx.fillRect(
                i * barWidth + 1,
                height - barHeight,
                barWidth - 2,
                barHeight,
            );
        }

        visualizerAnimationId = requestAnimationFrame(drawVisualizer);
    }

    function playCurrent() {
        if (!audio || currentIndex >= smols.length) {
            console.log("[KaleOrFail] playCurrent skipped:", {
                audio: !!audio,
                currentIndex,
                smolsLength: smols.length,
            });
            return;
        }
        const song = smols[currentIndex];
        const songId = song.Song_1 || song.Id;
        // Song_1 is a GUID, construct full URL
        const url = `${import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz"}/song/${songId}.mp3`;
        console.log("[KaleOrFail] Playing:", { title: song.Title, url });
        if (songId) {
            audio.src = url;
            audio.volume = 0.5;
            audio.play().catch((e) => {
                console.error("[KaleOrFail] Audio play failed:", e);
            });
        } else {
            console.warn("[KaleOrFail] No Song ID for:", song.Title);
        }
    }

    function handlePanStart(e: MouseEvent | TouchEvent) {
        dragging = true;
        cardScale.set(0.98);
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
        cardY.set(deltaY * 0.3);
        cardRotate.set(deltaX * 0.08);
    }

    function handlePanEnd() {
        if (!dragging) return;
        dragging = false;
        cardScale.set(1);

        // Check if swiped far enough
        const threshold = 120;
        if ($cardX > threshold) {
            swipe("right");
            return;
        } else if ($cardX < -threshold) {
            swipe("left");
            return;
        }

        // Reset if not swiped
        cardX.set(0);
        cardY.set(0);
        cardRotate.set(0);
    }

    function swipe(dir: "left" | "right") {
        const song = smols[currentIndex];

        // Visual feedback
        cardX.set(dir === "right" ? 600 : -600);
        cardRotate.set(dir === "right" ? 25 : -25);
        cardScale.set(0.9);

        // Spawn particle
        spawnParticle(dir === "right" ? "🥬" : "💨", dir);

        if (swipeTimeout) clearTimeout(swipeTimeout);
        swipeTimeout = setTimeout(() => {
            swipeTimeout = null;
            // Skip self-tips - can't tip your own songs
            const isSelfTip =
                song.Address &&
                userState.contractId &&
                song.Address.toLowerCase() ===
                    userState.contractId.toLowerCase();

            // Record stats
            if (!isSelfTip) {
                const result = recordInteraction(
                    song.Id,
                    dir === "right" ? "kale" : "fail",
                    dir === "right"
                        ? isCustom
                            ? parseFloat(customTipAmount) || 1
                            : selectedTipAmount
                        : 0,
                );
                stats = result.stats;

                // Show achievements
                if (result.newAchievements.length > 0) {
                    result.newAchievements.forEach((ach) => {
                        console.log(
                            `[Achievement] ${ach.title}: ${ach.description}`,
                        );
                        confetti({
                            particleCount: 50,
                            spread: 60,
                            origin: { y: 0.8 },
                            colors: ["#FFD700", "#FFA500"], // Gold colors
                        });
                    });
                }
            }

            if (dir === "right" && song.Address && !isSelfTip) {
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
            cardScale.set(1, { hard: true });

            if (currentIndex < smols.length) {
                playCurrent();
            } else {
                if (audio) audio.pause();
            }
        }, 250);
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
        if (!isDirectRelayer && !turnstileToken) {
            alert("Please verify you are human.");
            return;
        }
        if (!hasEnoughBalance) {
            alert(
                `Not enough KALE! You need ${totalTipsAmount} but have ${formattedBalance || 0}.`,
            );
            return;
        }

        isSettling = true;
        settleStep = 0;

        // Group tips by artist
        const amountByArtist = new Map<string, number>();
        for (const tip of tipQueue) {
            const current = amountByArtist.get(tip.artist) || 0;
            amountByArtist.set(tip.artist, current + tip.amount);
        }

        const artistList = Array.from(amountByArtist.entries());
        const artistCount = artistList.length;

        try {
            console.log("[KaleOrFail] Building batch transfers:", {
                artistCount,
                totalAmount: totalTipsAmount,
            });

            // Build transfers array - filter out invalid addresses
            const NULL_ACCOUNT =
                "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
            const allTransfers = artistList
                .filter(([artist]) => {
                    // Skip null/placeholder addresses
                    if (
                        !artist ||
                        artist === NULL_ACCOUNT ||
                        artist.length < 56
                    ) {
                        console.warn(
                            "[KaleOrFail] Skipping invalid address:",
                            artist,
                        );
                        return false;
                    }
                    return true;
                })
                .map(([artist, amount]) => ({
                    to: artist,
                    amount: BigInt(
                        Math.floor(amount * Number(DECIMALS_FACTOR)),
                    ),
                }));

            if (allTransfers.length === 0) {
                throw new Error("No valid recipients found");
            }

            // Chunk transfers into batches of 5 to avoid Relayer timeouts
            const MAX_BATCH_SIZE = 5;
            const chunks = [];
            for (let i = 0; i < allTransfers.length; i += MAX_BATCH_SIZE) {
                chunks.push(allTransfers.slice(i, i + MAX_BATCH_SIZE));
            }

            console.log(`[KaleOrFail] Processing ${chunks.length} batches...`);

            // Import batch transfer utility
            const { buildBatchKaleTransfer } = await import(
                "../../utils/batch-transfer"
            );

            // Process each chunk sequentially
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const chunkIndex = i + 1;

                settleStatus = `Processing Batch ${chunkIndex}/${chunks.length} (${chunk.length} artists)...`;
                console.log(
                    `[KaleOrFail] Starting batch ${chunkIndex}/${chunks.length}`,
                    chunk,
                );

                // Fetch sequence fresh for each batch to avoid expiration overlap
                const sequence = await withRetry(
                    () => getLatestSequence(),
                    {},
                    "GetSequence",
                );

                const batchXdr = await withRetry(
                    () => buildBatchKaleTransfer(userState.contractId!, chunk),
                    {},
                    "BuildBatch",
                );

                settleStatus = `Signing Batch ${chunkIndex}/${chunks.length}...`;
                settleStep = Math.floor((chunkIndex / chunks.length) * 50); // Progress visual

                // Sign
                const signedXdr = await account.get().sign(batchXdr, {
                    rpId: getSafeRpId(window.location.hostname),
                    keyId: userState.keyId,
                    expiration: sequence + 60,
                });

                settleStatus = `Sending Batch ${chunkIndex}/${chunks.length}...`;

                // Send
                // Send
                const RETRY_MESSAGES = [
                    "Relayer is napping. Waking it up... 😴",
                    "Blockchain traffic jam. Honking... 🚗",
                    "Polishing the kale leaves... 🥬",
                    "Convincing the nodes to agree... 🤝",
                    "Rerouting power to thrusters... 🚀",
                    "Processing a future of abundance... 🌌",
                    "Retrying... trust the process. 🙏",
                    "The chain is sleepy today... 🌙",
                    "Greasing the validator gears... ⚙️",
                    "Photosynthesizing... ☀️",
                    "Watering the transaction... 🚿",
                ];

                await withRetry(
                    () => send(signedXdr, turnstileToken),
                    {
                        maxRetries: 5,
                        baseDelayMs: 2000,
                        onRetry: (attempt, _err, _delay) => {
                            const randomMsg =
                                RETRY_MESSAGES[
                                    Math.floor(
                                        Math.random() * RETRY_MESSAGES.length,
                                    )
                                ];
                            settleStatus = `${randomMsg} (Try ${attempt}/5)`;
                        },
                    },
                    "SendBatch",
                );

                // Remove PAID tips from queue specific to this chunk
                const paidAddresses = new Set(chunk.map((t) => t.to));
                tipQueue = tipQueue.filter(
                    (tip) => !paidAddresses.has(tip.artist),
                );

                // Small delay between batches to be nice to relayer
                if (i < chunks.length - 1) {
                    settleStatus = `Cooling down for next batch...`;
                    await new Promise((r) => setTimeout(r, 1000));
                }
            }

            console.log("[KaleOrFail] All batches successful!");

            // Epic confetti!
            confetti({
                particleCount: 200,
                spread: 100,
                origin: { y: 0.6 },
                colors: ["#50FA7B", "#ffffff"], // KALE green and white
            });

            settleStatus = "All Sent! 🥬";
            setTimeout(() => {
                isSettling = false;
                settleStatus = "";
            }, 2000);
        } catch (e: any) {
            console.error("Batch settle error:", e);
            const msg = e?.message || String(e);

            if (
                msg.includes("Relayer") ||
                msg.includes("ECONNRESET") ||
                msg.includes("500")
            ) {
                alert(
                    `Relayer connection failed (${msg}). Some batches may have succeeded. Please check your balance/history.`,
                );
            } else {
                alert(`Failed to send remaining tips: ${msg}`);
            }
            isSettling = false;
        }

        // Refresh balance
        if (userState.contractId) {
            updateContractBalance(userState.contractId);
        }
    }

    // Progress indicator
    let progress = $derived(
        smols.length > 0 ? (currentIndex / smols.length) * 100 : 0,
    );
</script>

<div class="relative w-full max-w-sm mx-auto font-pixel">
    <!-- Progress bar at top -->
    {#if !loading && currentIndex < smols.length}
        <div
            class="absolute -top-6 left-0 right-0 h-1 bg-[#222] rounded-full overflow-hidden"
        >
            <div
                class="h-full bg-gradient-to-r from-[#9ae600] to-[#6aa600] transition-all duration-300"
                style="width: {progress}%"
            ></div>
        </div>
        <div class="absolute -top-10 right-0 text-[10px] text-[#555]">
            {currentIndex + 1}/{smols.length}
        </div>
    {/if}

    <!-- Balance display -->
    {#if userState.contractId && formattedBalance !== null}
        <div
            class="absolute -top-10 left-0 text-[10px] text-[#9ae600] flex items-center gap-1"
        >
            <span class="text-base">🥬</span>
            <span>{formattedBalance.toLocaleString()}</span>
        </div>
    {/if}

    {#if loading}
        <div class="flex items-center justify-center h-[550px]">
            <Loader />
        </div>
    {:else if !gameStarted}
        <!-- Start Screen - requires user click to enable audio -->
        <div
            class="flex flex-col items-center justify-center h-[550px] text-center p-4 space-y-8"
            in:fade={{ duration: 300 }}
        >
            <div class="text-8xl animate-bounce">🥬</div>
            <h2 class="text-3xl text-white">KALE OR FAIL</h2>
            <p class="text-xs text-slate-400 max-w-xs">
                Swipe through songs and tip your favorites!<br />
                <span class="text-[#9ae600]"
                    >{smols.length} unique artists loaded</span
                >
            </p>
            <button
                onclick={() => {
                    gameStarted = true;
                    // Stop Global Player to prevent conflicts
                    selectSong(null);
                    playCurrent();
                }}
                class="border-2 border-[#9ae600] bg-[#9ae600]/10 px-8 py-4 rounded-xl text-[#9ae600] text-xl font-bold hover:bg-[#9ae600] hover:text-black transition-all active:scale-95"
            >
                ▶ START
            </button>
        </div>
    {:else if currentIndex >= smols.length}
        <div
            class="flex flex-col items-center justify-center h-[550px] text-center p-4 space-y-6"
            in:fade={{ duration: 300 }}
        >
            <div class="text-6xl mb-4">🥬</div>
            <h2 class="text-2xl text-white">Thank You!</h2>
            <button
                class="text-xs text-[#9ae600] underline hover:text-white transition-colors"
                onclick={() => window.location.reload()}
            >
                Play Again?
            </button>

            <div class="space-y-3 w-full max-w-xs">
                <!-- Stats Summary -->
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="bg-[#222] p-2 rounded-lg">
                        <div class="text-slate-400">Total Kaled</div>
                        <div class="text-white font-bold">
                            {stats.totalTips}
                        </div>
                    </div>
                    <div class="bg-[#222] p-2 rounded-lg">
                        <div class="text-slate-400">Lifetime Sent</div>
                        <div class="text-[#9ae600] font-bold">
                            {stats.totalKaleSent}
                        </div>
                    </div>
                    <div class="bg-[#222] p-2 rounded-lg">
                        <div class="text-slate-400">Total Fails</div>
                        <div class="text-red-400 font-bold">
                            {stats.totalSkips}
                        </div>
                    </div>
                    <div class="bg-[#222] p-2 rounded-lg">
                        <div class="text-slate-400">Best Streak</div>
                        <div class="text-orange-400 font-bold">
                            {stats.maxKaleStreak} 🔥
                        </div>
                    </div>
                </div>

                <!-- Achievements -->
                {#if stats.unlockedAchievements.length > 0}
                    <div class="flex flex-wrap gap-2 justify-center py-2">
                        {#each ACHIEVEMENTS as ach}
                            <div
                                class="relative group cursor-help transition-all duration-300
                                {stats.unlockedAchievements.includes(
                                    ach.id || '',
                                )
                                    ? 'opacity-100 scale-100 grayscale-0'
                                    : 'opacity-30 scale-90 grayscale'}"
                            >
                                <span class="text-2xl">{ach.icon}</span>
                                <!-- Tooltip -->
                                <div
                                    class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black border border-[#333] rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-max max-w-[150px]"
                                >
                                    <div class="font-bold text-[#9ae600]">
                                        {ach.title}
                                    </div>
                                    <div class="text-slate-400 text-wrap">
                                        {ach.description}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}

                <div class="bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
                    <p class="text-[#9ae600] text-lg font-bold">
                        {tipQueue.length} Tips Queued
                    </p>
                    <p class="text-2xl text-white mt-1">
                        {totalTipsAmount.toLocaleString()} KALE
                    </p>
                    {#if formattedBalance !== null}
                        <p class="text-xs text-slate-500 mt-2">
                            Your balance: {formattedBalance.toLocaleString()} KALE
                            {#if !hasEnoughBalance}
                                <span class="text-red-500 block mt-1"
                                    >⚠️ Insufficient balance!</span
                                >
                            {/if}
                        </p>
                    {/if}
                </div>
            </div>

            {#if !userState.contractId}
                <div class="flex flex-col gap-2 items-center">
                    <p class="text-red-500 text-xs">
                        Connect Wallet to Send Tips
                    </p>
                    <a
                        href="/onboarding/passkey"
                        class="text-[#9ae600] underline text-xs"
                    >
                        Connect Wallet →
                    </a>
                </div>
            {:else if tipQueue.length === 0}
                <p class="text-slate-500 text-sm">
                    You didn't tip anyone this round.
                </p>
                <a href="/labs" class="text-[#9ae600] underline text-xs">
                    Back to Labs
                </a>
            {:else if !isSettling}
                {#if !isDirectRelayer}
                    <div class="flex justify-center my-4">
                        <Turnstile
                            siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
                            on:callback={(e) =>
                                (turnstileToken = e.detail.token)}
                            theme="dark"
                        />
                    </div>
                {/if}
                <button
                    onclick={settleTips}
                    disabled={(!isDirectRelayer && !turnstileToken) ||
                        !hasEnoughBalance}
                    class="w-full max-w-xs border-2 border-[#9ae600] bg-[#9ae600]/10 px-6 py-4 rounded-xl hover:bg-[#9ae600] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg font-bold active:scale-95"
                >
                    🚀 SEND {totalTipsAmount} KALE
                </button>
            {:else}
                <div class="w-full max-w-xs space-y-4">
                    <div class="bg-[#222] h-3 rounded-full overflow-hidden">
                        <div
                            class="bg-gradient-to-r from-[#9ae600] to-[#6aa600] h-full transition-all duration-500"
                            style="width: {(settleStep /
                                (new Set(tipQueue.map((t) => t.artist)).size ||
                                    1)) *
                                100}%"
                        ></div>
                    </div>
                    <p class="text-sm text-[#9ae600] animate-pulse text-center">
                        {settleStatus}
                    </p>
                </div>
            {/if}
        </div>
    {:else}
        <!-- Ambient Background -->
        {#if smols[currentIndex]}
            <div
                class="fixed inset-0 -z-10 pointer-events-none overflow-hidden transition-opacity duration-1000 origin-center"
                in:fade
            >
                <img
                    src="{import.meta.env.PUBLIC_API_URL}/image/{smols[
                        currentIndex
                    ].Id}.png?scale=32"
                    alt="bg"
                    class="w-full h-full object-cover opacity-30 blur-3xl scale-125 saturate-150 animate-pulse-slow"
                />
            </div>
        {/if}

        <!-- Card Stack -->
        <div class="relative h-[480px] perspective-1000">
            <!-- Background cards (next in queue) -->
            {#each smols
                .slice(currentIndex + 1, currentIndex + 2)
                .reverse() as song, i (song.Id)}
                {@const index = i}
                <!-- reverse makes i go 1, 0 but we want depth -->
                <div
                    class="absolute inset-0 bg-[#111] border border-[#333] rounded-2xl overflow-hidden glass-panel select-none touch-none pointer-events-none transition-all duration-500 ease-out"
                    style="
                        z-index: {5 - i};
                        transform: 
                            translateY({(2 - i) * 12}px) 
                            scale({0.9 - (2 - i) * 0.05});
                        opacity: 0.5;
                    "
                >
                    <img
                        src="{import.meta.env
                            .PUBLIC_API_URL}/image/{song.Id}.png?scale=32"
                        alt="next"
                        class="w-full h-full object-cover grayscale opacity-50"
                        loading="eager"
                    />
                </div>
            {/each}

            <!-- Active Card -->
            {#each [smols[currentIndex]] as song (song.Id)}
                <div
                    class="absolute inset-0 bg-black border border-[#333] rounded-2xl overflow-hidden glass-panel select-none touch-none cursor-grab active:cursor-grabbing shadow-2xl
                    {stats.currentStreak >= 5
                        ? 'ring-4 ring-orange-500 ring-opacity-50 shadow-orange-500/50 animate-pulse'
                        : ''}"
                    style="transform: translate({$cardX}px, {$cardY}px) rotate({$cardRotate}deg) scale({$cardScale}); z-index: 50;"
                    onmousedown={handlePanStart}
                    onmousemove={handlePanMove}
                    onmouseup={handlePanEnd}
                    onmouseleave={handlePanEnd}
                    ontouchstart={handlePanStart}
                    ontouchmove={handlePanMove}
                    ontouchend={handlePanEnd}
                    in:scale={{ duration: 200, start: 0.95 }}
                >
                    <img
                        src="{import.meta.env
                            .PUBLIC_API_URL}/image/{song.Id}.png?scale=32"
                        alt={song.Title}
                        class="w-full h-full object-cover pointer-events-none"
                        draggable="false"
                        oncontextmenu={(e) => e.preventDefault()}
                        loading="eager"
                    />

                    <!-- Audio Visualizer Overlay -->
                    {#if isPlaying}
                        <div
                            class="absolute top-0 left-0 right-0 h-16 pointer-events-none"
                        >
                            <canvas
                                bind:this={visualizerCanvas}
                                width="300"
                                height="64"
                                class="w-full h-full opacity-70"
                            ></canvas>
                        </div>
                    {/if}

                    <!-- Streak Fire Overlay -->
                    {#if stats.currentStreak >= 5}
                        <div
                            class="absolute inset-0 pointer-events-none border-4 border-orange-500/30 rounded-2xl animate-pulse"
                        ></div>
                        <div
                            class="absolute top-2 right-2 text-2xl animate-bounce"
                        >
                            🔥
                        </div>
                    {/if}

                    <div
                        class="p-6 bg-gradient-to-t from-black via-black/90 to-transparent absolute bottom-0 w-full"
                    >
                        <h3
                            class="text-lg text-white font-bold shadow-black drop-shadow-md mb-1 truncate"
                        >
                            {song.Title}
                        </h3>
                        <p
                            class="text-xs text-[#9ae600] uppercase tracking-wider truncate"
                        >
                            {song.artist ||
                                song.Creator ||
                                (song.Address
                                    ? `${song.Address.slice(0, 4)}...${song.Address.slice(-4)}`
                                    : "Unknown")}
                        </p>
                    </div>

                    <!-- Overlay Stamps -->
                    <div
                        class="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-[#9ae600] text-[#9ae600] px-6 py-3 rounded-xl text-3xl font-bold uppercase -rotate-12 transition-opacity pointer-events-none bg-black/50 backdrop-blur-sm"
                        style="opacity: {$cardX > 50
                            ? Math.min(($cardX - 50) / 80, 1)
                            : 0}; text-shadow: 0 0 20px rgba(154,230,0,0.5);"
                    >
                        TIP! 🥬
                    </div>
                    <div
                        class="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-red-500 text-red-500 px-6 py-3 rounded-xl text-3xl font-bold uppercase rotate-12 transition-opacity pointer-events-none bg-black/50 backdrop-blur-sm"
                        style="opacity: {$cardX < -50
                            ? Math.min((-$cardX - 50) / 80, 1)
                            : 0}; text-shadow: 0 0 20px rgba(239,68,68,0.5);"
                    >
                        PASS ✕
                    </div>
                </div>
            {/each}

            <!-- Floating Particles -->
            {#each particles as p (p.id)}
                <div
                    class="absolute top-1/2 left-1/2 text-8xl pointer-events-none select-none z-[60]"
                    style="transform: translate({p.x}px, 0);"
                >
                    <div class="animate-explode">
                        {p.emoji}
                    </div>
                </div>
            {/each}
        </div>

        <!-- Tip Selector -->
        <div class="mt-4 flex justify-center gap-2 px-4">
            {#each TIP_OPTIONS as opt}
                <button
                    onclick={() => setTipOption(opt)}
                    class="px-3 py-2 text-xs rounded-lg border-2 transition-all font-bold {selectedTipAmount ===
                        opt && !isCustom
                        ? 'bg-[#9ae600] text-black border-[#9ae600] scale-105'
                        : 'bg-black text-[#666] border-[#333] hover:border-[#9ae600] hover:text-[#9ae600]'}"
                >
                    {opt}
                </button>
            {/each}
            <div class="relative">
                <button
                    onclick={() => (isCustom = true)}
                    class="px-3 py-2 text-xs rounded-lg border-2 transition-all font-bold {isCustom
                        ? 'bg-[#9ae600] text-black border-[#9ae600] scale-105'
                        : 'bg-black text-[#666] border-[#333] hover:border-[#9ae600] hover:text-[#9ae600]'}"
                >
                    ✏️
                </button>
                {#if isCustom}
                    <input
                        type="number"
                        bind:value={customTipAmount}
                        class="absolute bottom-10 left-1/2 -translate-x-1/2 w-20 bg-black border-2 border-[#9ae600] text-[#9ae600] text-sm p-2 text-center rounded-lg outline-none shadow-lg"
                        placeholder="Amount"
                        min="1"
                    />
                {/if}
            </div>
        </div>

        <!-- Swipe Buttons -->
        <div class="mt-6 flex justify-center gap-6">
            <button
                onclick={() => swipe("left")}
                class="w-16 h-16 rounded-full border-2 border-slate-700 bg-black text-slate-500 flex items-center justify-center hover:border-red-500 hover:text-red-500 hover:scale-110 transition-all active:scale-95 shadow-lg"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="3"
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
                class="w-20 h-20 rounded-full border-2 border-[#9ae600]/50 bg-black text-[#9ae600] flex items-center justify-center hover:border-[#9ae600] hover:bg-[#9ae600]/10 hover:scale-110 transition-all active:scale-95 shadow-lg shadow-[#9ae600]/20"
            >
                <div class="flex flex-col items-center">
                    <span class="text-2xl">🥬</span>
                    <span class="text-[10px] font-bold mt-0.5">
                        {isCustom ? customTipAmount || "?" : selectedTipAmount}
                    </span>
                </div>
            </button>
        </div>

        <!-- Tip Queue Preview -->
        {#if tipQueue.length > 0}
            <div class="mt-4 text-center">
                <p class="text-xs text-slate-500">
                    Queued: <span class="text-[#9ae600]">{tipQueue.length}</span
                    >
                    tips •
                    <span class="text-[#9ae600]">{totalTipsAmount ?? "0"}</span>
                    KALE
                </p>
            </div>
        {/if}
    {/if}
</div>

<style>
    .glass-panel {
        backdrop-filter: blur(10px);
        background: rgba(20, 20, 20, 0.7);
        box-shadow: 0 15px 40px -10px rgba(0, 0, 0, 0.6);
    }
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    /* Visual Enhancements */
    @keyframes explode-pop {
        0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
        }
        20% {
            opacity: 1;
        }
        100% {
            transform: translate(-50%, -50%) scale(4);
            opacity: 0;
        }
    }
    .animate-explode {
        animation: explode-pop 0.6s cubic-bezier(0.1, 0.7, 1, 0.1) forwards;
    }
    .animate-pulse-slow {
        animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .perspective-1000 {
        perspective: 1000px;
    }
</style>
