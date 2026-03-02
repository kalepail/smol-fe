<script lang="ts">
    import LabsPlayer from "./LabsPlayer.svelte";
    import { onMount } from "svelte";
    import { getSnapshotAsync } from "../../services/api/snapshot";
    import confetti from "canvas-confetti";

    interface Props {
        smols?: any[];
        fetchOnMount?: boolean;
    }

    let { smols = [], fetchOnMount = false }: Props = $props();

    let score = $state(0);
    let rounds = $state(0);
    let currentSmol = $state<any | null>(null);
    let options = $state<any[]>([]);
    let hasGuessed = $state(false);
    let lastResult = $state<"correct" | "incorrect" | null>(null);
    let playableSmols = $state<any[]>([]);

    // Scoring state
    let potentialPoints = $state(1000);
    let timer: number | undefined;
    const MAX_POINTS = 1000;
    const MIN_POINTS = 100;
    const DECAY_MS = 100; // Update every 100ms
    const DECAY_AMOUNT = 10; // Lose 10 points every 100ms (100 points/sec)

    import { onDestroy } from "svelte";

    onDestroy(() => {
        if (timer) clearInterval(timer);
    });

    function updatePlayableSmols() {
        playableSmols = smols.filter((s) => s.audio?.url || s.Song_1 || s.Id);

        console.log("[WaveformMatch] Playable count:", playableSmols.length);
        if (playableSmols.length >= 4) {
            startRound();
        }
    }

    $effect(() => {
        if (smols.length > 0 && playableSmols.length === 0) {
            updatePlayableSmols();
        }
    });

    function startRound() {
        if (playableSmols.length < 4) return;

        // Reset timer
        if (timer) clearInterval(timer);
        potentialPoints = MAX_POINTS;

        // Start timer
        timer = window.setInterval(() => {
            if (potentialPoints > MIN_POINTS) {
                potentialPoints = Math.max(
                    MIN_POINTS,
                    potentialPoints - DECAY_AMOUNT,
                );
            }
        }, DECAY_MS);

        // 1. Pick random target
        currentSmol =
            playableSmols[Math.floor(Math.random() * playableSmols.length)];

        // 2. Pick 3 distractors
        const distractors = new Set<any>();
        while (distractors.size < 3) {
            const s =
                playableSmols[Math.floor(Math.random() * playableSmols.length)];
            if (s.Id !== currentSmol.Id) {
                distractors.add(s);
            }
        }

        // 3. Shuffle options
        options = [...distractors, currentSmol].sort(() => Math.random() - 0.5);

        hasGuessed = false;
        lastResult = null;
    }

    function handleGuess(smol: any) {
        if (hasGuessed) return;

        if (timer) clearInterval(timer);
        hasGuessed = true;
        rounds++;

        if (smol.Id === currentSmol.Id) {
            score += potentialPoints;
            lastResult = "correct";

            // Confetti on correct match!
            const confettiAmount = Math.min(Math.floor(potentialPoints / 10), 100);
            confetti({
                particleCount: confettiAmount,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#9ae600', '#f91880', '#FDDA24', '#fff']
            });
        } else {
            lastResult = "incorrect";
        }
    }

    function getVisualizerBarHeight(
        index: number,
        total: number,
        name: string,
    ): string {
        // Deterministic pseudo-random height based on name char codes to simulate different waveforms
        const seed =
            (name || "unknown").charCodeAt(index % (name || "unknown").length) +
            index;
        const height = 20 + (seed % 80);
        return `${height}%`;
    }

    onMount(async () => {
        if (fetchOnMount) {
            try {
                smols = await getSnapshotAsync();
                updatePlayableSmols();
            } catch (e) {
                console.error("[Waveform] Fetch failed:", e);
            }
        } else if (smols.length > 0) {
            updatePlayableSmols();
        }
    });
</script>

<div class="flex flex-col gap-8 w-full max-w-4xl mx-auto">
    <!-- Scoreboard -->
    <div class="flex justify-between items-center border-b border-[#333] pb-4">
        <div class="flex flex-col">
            <span class="text-[10px] text-[#555] uppercase tracking-widest"
                >Score</span
            >
            <div class="flex items-baseline gap-2">
                <span class="text-2xl font-bold text-[#9ae600]">{score}</span>
                {#if !hasGuessed}
                    <span
                        class="text-xs font-mono text-[#f91880] animate-pulse"
                    >
                        Potential: +{potentialPoints}
                    </span>
                {/if}
            </div>
        </div>
        <button
            onclick={startRound}
            disabled={!hasGuessed}
            class="px-4 py-2 bg-[#222] border border-[#333] rounded text-xs uppercase font-mono hover:bg-[#9ae600] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
            Next Pattern &rarr;
        </button>
    </div>

    {#if currentSmol}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <!-- Left: The Mystery Audio -->
            <div
                class="bg-[#111] p-8 rounded-xl border border-[#333] flex flex-col items-center gap-6 text-center"
            >
                <div
                    class="w-16 h-16 bg-[#222] rounded-full flex items-center justify-center animate-pulse"
                >
                    <svg
                        class="w-8 h-8 text-[#555]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M12,3V15.5A3.5,3.5 0 0,1 8.5,19A3.5,3.5 0 0,1 5,15.5A3.5,3.5 0 0,1 8.5,12C9.28,12 10,12.25 10.59,12.68V5H17V8H12Z"
                        />
                    </svg>
                </div>
                <div class="text-xs font-mono text-[#555] space-y-1">
                    <p>INCOMING TRANSMISSION</p>
                    <p class="text-[#f91880] animate-pulse">
                        UNIDENTIFIED SIGNAL
                    </p>
                </div>
                <LabsPlayer
                    src={(currentSmol.audio || currentSmol.Audio)?.url ||
                        (currentSmol.Song_1 || currentSmol.Id
                            ? `https://api.smol.xyz/song/${currentSmol.Song_1 || currentSmol.Id}.mp3`
                            : "")}
                    autoplay={true}
                />
            </div>

            <!-- Right: The Visual Candidates -->
            <div class="grid grid-cols-1 gap-3">
                {#each options as smol}
                    <button
                        onclick={() => handleGuess(smol)}
                        disabled={hasGuessed}
                        class="group relative flex items-center gap-4 p-4 border border-[#333] rounded hover:border-[#9ae600] bg-[#151515] hover:bg-[#222] transition-all
                        {hasGuessed && smol.Id === currentSmol.Id
                            ? '!border-[#9ae600] !bg-[#9ae600]/10'
                            : ''}
                        {hasGuessed &&
                        smol.Id !== currentSmol.Id &&
                        lastResult === 'incorrect'
                            ? 'opacity-30'
                            : ''}"
                    >
                        <!-- Fake Waveform Visual for this candidate -->
                        <div
                            class="flex items-end justify-center gap-[2px] h-8 w-24 opacity-50 group-hover:opacity-100 transition-opacity"
                        >
                            {#each Array(15) as _, i}
                                <div
                                    class="w-1 bg-[#9ae600] rounded-t-sm transition-all duration-300 group-hover:bg-white"
                                    style="height: {getVisualizerBarHeight(
                                        i,
                                        15,
                                        smol.Title || smol.name || 'Unknown',
                                    )}"
                                ></div>
                            {/each}
                        </div>

                        <div class="flex flex-col items-start min-w-0 flex-1">
                            <span
                                class="text-xs font-bold text-white truncate w-full text-left"
                                >{smol.Title ||
                                    smol.name ||
                                    "Unknown Artifact"}</span
                            >
                            <span class="text-[10px] text-[#555] font-mono"
                                >{smol.family || "Unknown Family"}</span
                            >
                        </div>

                        <!-- Reveal Status -->
                        {#if hasGuessed && smol.Id === currentSmol.Id}
                            <div class="absolute right-4 text-[#9ae600]">
                                <svg
                                    class="w-6 h-6"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    ><path
                                        d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"
                                    /></svg
                                >
                            </div>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    {:else}
        <div class="text-center py-20 animate-pulse text-[#555]">
            Calibrating Sensors...
        </div>
    {/if}
</div>
