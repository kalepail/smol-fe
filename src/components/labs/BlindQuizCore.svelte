<script lang="ts">
    import LabsPlayer from "./LabsPlayer.svelte";
    import { onMount, onDestroy } from "svelte";
    import { getSnapshotTagStats } from "../../services/tags/unifiedTags";
    import { getSnapshotAsync } from "../../services/api/snapshot";
    import confetti from "canvas-confetti";

    interface Props {
        smols?: any[];
        allTags?: string[];
        fetchOnMount?: boolean;
    }

    let { smols = [], allTags = [], fetchOnMount = false }: Props = $props();

    let score = $state(0);
    let rounds = $state(0);
    let currentSmol = $state<any | null>(null);
    let options = $state<string[]>([]);
    let correctTag = $state<string | null>(null);
    let hasGuessed = $state(false);
    let lastResult = $state<"correct" | "incorrect" | null>(null);
    let playableSmols = $state<any[]>([]);

    // Achievement tracking
    let streak = $state(0);
    let bestStreak = $state(0);
    let achievements = $state<string[]>([]);
    let showAchievement = $state<string | null>(null);
    let achievementTimeout: ReturnType<typeof setTimeout> | null = null;

    function updatePlayableSmols() {
        playableSmols = smols.filter((s) => {
            const hasAudio = s.audio?.url || s.Song_1 || s.Id;
            const hasTags = (s.Tags || s.tags || []).length > 0;
            return hasAudio && hasTags;
        });

        console.log("[BlindQuiz] Total smols:", smols.length);
        console.log("[BlindQuiz] Playable smols:", playableSmols.length);

        if (playableSmols.length > 0) {
            startRound();
        }
    }

    $effect(() => {
        if (smols.length > 0 && playableSmols.length === 0) {
            updatePlayableSmols();
        }
    });

    function startRound() {
        if (playableSmols.length === 0) return;

        // 1. Pick random smol
        currentSmol =
            playableSmols[Math.floor(Math.random() * playableSmols.length)];

        // 2. Pick a correct tag from its list
        const tags = currentSmol.Tags || currentSmol.tags || [];
        correctTag = tags[Math.floor(Math.random() * tags.length)];

        // 3. Generate 5 distinct distractors
        const distractors = new Set<string>();
        while (distractors.size < 5) {
            const t = allTags[Math.floor(Math.random() * allTags.length)];
            if (t !== correctTag && !tags.includes(t)) {
                distractors.add(t);
            }
        }

        // 4. Shuffle options
        options = [...distractors, correctTag!].sort(() => Math.random() - 0.5);

        hasGuessed = false;
        lastResult = null;
    }

    function handleGuess(tag: string) {
        if (hasGuessed) return;

        hasGuessed = true;
        rounds++;

        if (tag === correctTag) {
            score++;
            streak++;
            lastResult = "correct";

            // Update best streak
            if (streak > bestStreak) {
                bestStreak = streak;
            }

            // Confetti on correct answer!
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { y: 0.6 },
                colors: ['#9ae600', '#f91880', '#FDDA24']
            });

            // Achievement system
            checkAchievements();
        } else {
            streak = 0;
            lastResult = "incorrect";
        }
    }

    function checkAchievements() {
        const newAchievements: string[] = [];

        if (streak === 3 && !achievements.includes("🔥 Hot Streak")) {
            newAchievements.push("🔥 Hot Streak");
        }
        if (streak === 5 && !achievements.includes("⭐ Master Detective")) {
            newAchievements.push("⭐ Master Detective");
        }
        if (streak === 10 && !achievements.includes("🏆 Unstoppable")) {
            newAchievements.push("🏆 Unstoppable");
        }
        if (score === 1 && !achievements.includes("🎵 First Blood")) {
            newAchievements.push("🎵 First Blood");
        }

        if (newAchievements.length > 0) {
            achievements = [...achievements, ...newAchievements];
            showAchievement = newAchievements[0];
            // Clear any existing timeout before setting a new one
            if (achievementTimeout) clearTimeout(achievementTimeout);
            achievementTimeout = setTimeout(() => {
                showAchievement = null;
                achievementTimeout = null;
            }, 3000);

            // Extra confetti for achievements!
            confetti({
                particleCount: 100,
                spread: 100,
                origin: { y: 0.5 },
                colors: ['#9ae600', '#f91880', '#FDDA24', '#fff']
            });
        }
    }

    // Keyboard shortcuts (1-6 for options, Space/Enter for next)
    function handleKeyPress(e: KeyboardEvent) {
        if (hasGuessed && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            startRound();
        } else if (!hasGuessed) {
            const num = parseInt(e.key);
            if (num >= 1 && num <= options.length) {
                handleGuess(options[num - 1]);
            }
        }
    }

    onMount(async () => {
        window.addEventListener('keydown', handleKeyPress);

        if (fetchOnMount) {
            try {
                const tagStats = await getSnapshotTagStats();
                allTags = tagStats.tags.slice(0, 100).map((t) => t.tag);
                smols = await getSnapshotAsync();

                updatePlayableSmols();
            } catch (e) {
                console.error("[BlindQuiz] Fetch failed:", e);
            }
        } else if (smols.length > 0) {
            updatePlayableSmols();
        } else {
            // Try start anyway if props came in late
            startRound();
        }
    });

    onDestroy(() => {
        window.removeEventListener('keydown', handleKeyPress);
        if (achievementTimeout) {
            clearTimeout(achievementTimeout);
            achievementTimeout = null;
        }
    });
</script>

<div class="flex flex-col gap-8 w-full max-w-lg mx-auto relative">
    <!-- Achievement Notification -->
    {#if showAchievement}
        <div class="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in">
            <div class="bg-gradient-to-r from-[#9ae600] to-[#f91880] p-0.5 rounded-lg">
                <div class="bg-black px-6 py-3 rounded-lg flex items-center gap-3">
                    <span class="text-2xl">🏆</span>
                    <div class="flex flex-col">
                        <span class="text-[8px] text-[#555] uppercase tracking-widest">Achievement Unlocked!</span>
                        <span class="text-sm font-bold text-white">{showAchievement}</span>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- Scoreboard -->
    <div class="flex justify-between items-center border-b border-[#333] pb-4">
        <div class="flex gap-4">
            <div class="flex flex-col">
                <span class="text-[10px] text-[#555] uppercase tracking-widest">Score</span>
                <span class="text-2xl font-bold text-[#9ae600]">
                    {score}
                    <span class="text-[#333] text-sm">/ {rounds}</span>
                </span>
            </div>
            {#if streak > 0}
                <div class="flex flex-col animate-in fade-in">
                    <span class="text-[10px] text-[#f91880] uppercase tracking-widest">Streak</span>
                    <span class="text-2xl font-bold text-[#f91880] animate-pulse">
                        🔥 {streak}
                    </span>
                </div>
            {/if}
        </div>
        <div class="flex flex-col items-end gap-2">
            <button
                onclick={startRound}
                disabled={!hasGuessed}
                class="px-4 py-2 bg-[#222] border border-[#333] rounded text-xs uppercase font-mono hover:bg-[#9ae600] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                Next Round &rarr;
            </button>
            {#if !hasGuessed}
                <span class="text-[8px] text-[#333] font-mono">Press 1-6 or Space</span>
            {/if}
        </div>
    </div>

    {#if currentSmol}
        <!-- Player (Masked) -->
        <div
            class="bg-[#111] p-6 rounded-xl border border-[#333] flex flex-col items-center gap-4 relative overflow-hidden group"
        >
            <div
                class="absolute inset-0 bg-[radial-gradient(circle_at_center,#f91880_0%,transparent_50%)] opacity-5 pointer-events-none"
            ></div>

            <div
                class="w-24 h-24 bg-[#222] rounded-full flex items-center justify-center animate-pulse border-2 border-[#333]"
            >
                <span class="text-4xl">?</span>
            </div>

            <p class="text-xs text-[#555] font-mono text-center max-w-[200px]">
                Listen to the snippet. Which tag belongs to this track?
            </p>

            <LabsPlayer
                src={(currentSmol.audio || currentSmol.Audio)?.url ||
                    (currentSmol.Song_1 || currentSmol.Id
                        ? `https://api.smol.xyz/song/${currentSmol.Song_1 || currentSmol.Id}.mp3`
                        : "")}
                autoplay={true}
            />
        </div>

        <!-- Options Grid -->
        <div class="grid grid-cols-2 gap-3">
            {#each options as tag, i}
                <button
                    onclick={() => handleGuess(tag)}
                    disabled={hasGuessed}
                    class="p-4 border border-[#333] rounded bg-[#151515] hover:bg-[#222] disabled:opacity-100 disabled:cursor-default transition-all relative overflow-hidden text-sm uppercase font-bold tracking-wider
                    {hasGuessed && tag === correctTag
                        ? '!bg-[#9ae600] !text-black !border-[#9ae600]'
                        : ''}
                    {hasGuessed &&
                    tag !== correctTag &&
                    lastResult === 'incorrect'
                        ? 'opacity-30'
                        : ''}"
                >
                    {#if !hasGuessed}
                        <span class="absolute top-1 left-2 text-[8px] text-[#555] font-mono">{i + 1}</span>
                    {/if}
                    #{tag}
                    {#if hasGuessed && tag === correctTag}
                        <span class="absolute top-1 right-2 text-lg">✓</span>
                    {/if}
                </button>
            {/each}
        </div>

        <!-- Reveal Info -->
        {#if hasGuessed}
            <div
                class="mt-4 p-4 bg-[#111] border border-[#333] rounded flex items-center gap-4 animate-in slide-in-from-bottom-2 fade-in"
            >
                <img
                    src={currentSmol.thumbnail ||
                        `https://api.smol.xyz/image/${currentSmol.Id}.png?scale=4`}
                    alt="reveal"
                    class="w-16 h-16 rounded object-cover"
                />
                <div class="flex flex-col gap-1">
                    <p class="text-[10px] text-[#555] uppercase">
                        Track Revealed
                    </p>
                    <h3 class="font-bold text-white">
                        {currentSmol.Title || currentSmol.name}
                    </h3>
                    <p class="text-xs text-[#9ae600]">
                        Correct Answer: #{correctTag}
                    </p>
                </div>
            </div>
        {/if}
    {:else}
        <div class="text-center text-[#555] py-12 animate-pulse">
            Loading Archives...
        </div>
    {/if}
</div>
