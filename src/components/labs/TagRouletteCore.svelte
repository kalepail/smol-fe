<script lang="ts">
    import { onMount } from "svelte";
    import LabsPlayer from "./LabsPlayer.svelte";
    import { getSnapshotTagStats } from "../../services/tags/unifiedTags";
    import { getSnapshotAsync } from "../../services/api/snapshot";
    import confetti from "canvas-confetti";

    interface Props {
        tags: string[];
        smols: any[];
        fetchOnMount?: boolean;
    }

    let { tags = [], smols = [], fetchOnMount = false }: Props = $props();

    let selectedTag = $state<string | null>(null);
    let isSpinning = $state(false);
    let isLoading = $state(false);
    let result = $state<any | null>(null);
    let error = $state<string | null>(null);
    let spinCount = $state(0);

    // Fun loading messages
    const loadingMessages = [
        "Scanning Archives for",
        "Decrypting Metadata for",
        "Quantum Tunneling through",
        "Infiltrating Database for",
        "Hacking the Mainframe for",
        "Summoning Tracks tagged",
        "Vibing to the frequency of",
        "Channeling the energy of"
    ];

    // Client-side data fetching to bypass Astro compiler WASM crash on Node 22 Windows
    onMount(async () => {
        if (fetchOnMount) {
            try {
                isLoading = true;
                // Fetch tags
                const tagStats = await getSnapshotTagStats();
                tags = tagStats.tags.slice(0, 50).map((t) => t.tag);

                // Fetch smols
                smols = await getSnapshotAsync();
                console.log("[TagRoulette] Loaded smols:", smols.length);
                if (smols.length > 0) {
                    console.log(
                        "[TagRoulette] Sample smol tags:",
                        smols[0].Tags || smols[0].tags || smols[0].keywords,
                    );
                } else {
                    console.warn(
                        "[TagRoulette] Loaded 0 smols! Check fetch path.",
                    );
                }
                isLoading = false;
            } catch (e) {
                console.error("Failed to load lab data", e);
                error =
                    "Failed to load system data: " +
                    ((e as any).message || String(e));
                isLoading = false;
            }
        }
    });

    function spin(tag: string) {
        if (isSpinning) return;

        selectedTag = tag;
        isSpinning = true;
        result = null;
        error = null;
        spinCount++;

        // Artificial delay for "roulette" feel
        setTimeout(() => {
            const matches = smols.filter((s: any) => {
                const tags = s.Tags || s.tags || [];
                const keywords = s.Keywords || s.keywords || [];
                return tags.includes(tag) || keywords.includes(tag);
            });

            if (matches.length === 0) {
                error = `No artifacts found for [${tag}]`;
                isSpinning = false;
                return;
            }

            const randomSmol =
                matches[Math.floor(Math.random() * matches.length)];

            // Ensure audio url exists (handle PascalCase and numeric keys)
            // Snapshot has 'Song_1' which is just the UUID usually, or 'Id'
            const audioId = randomSmol.Song_1 || randomSmol.Id;
            const audioUrl =
                randomSmol.audio?.url ||
                randomSmol.Audio?.url ||
                (audioId ? `https://api.smol.xyz/song/${audioId}.mp3` : null);

            if (!audioUrl) {
                // Try another one or fail
                // For now, strict fail is safer for labs
                if (matches.length > 1) {
                    // Quick retry logic could go here, but kept simple
                }
            }

            result = randomSmol;
            isSpinning = false;

            // Confetti on successful find!
            confetti({
                particleCount: 30,
                spread: 50,
                origin: { y: 0.7 },
                colors: ['#9ae600', '#f91880', '#FDDA24']
            });
        }, 1500);
    }

    function reset() {
        selectedTag = null;
        result = null;
    }
</script>

<div class="flex flex-col gap-6 w-full">
    {#if isLoading}
        <!-- Loading Data State -->
        <div class="flex flex-col items-center justify-center py-12 gap-4">
            <div
                class="w-8 h-8 border-2 border-[#333] border-t-[#9ae600] rounded-full animate-spin"
            ></div>
            <p class="text-xs font-mono text-[#555] animate-pulse">
                Initializing System...
            </p>
        </div>
    {:else if !selectedTag}
        <!-- Tag Selection State -->
        <div
            class="flex flex-wrap gap-2 justify-center max-h-[300px] overflow-y-auto pr-2 scrollbar-thin"
        >
            {#each tags as tag}
                <button
                    onclick={() => spin(tag)}
                    class="px-3 py-1.5 bg-[#222] border border-[#444] text-[#9ae600] text-xs font-mono uppercase rounded hover:bg-[#9ae600] hover:text-black hover:border-transparent transition-all"
                >
                    #{tag}
                </button>
            {/each}
        </div>
    {:else if isSpinning}
        <!-- Spinning State -->
        <div class="flex flex-col items-center justify-center py-12 gap-4">
            <div
                class="w-12 h-12 border-4 border-[#333] border-t-[#f91880] rounded-full animate-spin"
            ></div>
            <p class="text-xs font-mono text-[#f91880] animate-pulse">
                {loadingMessages[Math.floor(Math.random() * loadingMessages.length)]} #{selectedTag}...
            </p>
            <div class="flex gap-1">
                {#each Array(3) as _, i}
                    <div class="w-2 h-2 bg-[#f91880] rounded-full animate-bounce" style="animation-delay: {i * 0.2}s"></div>
                {/each}
            </div>
        </div>
    {:else if result}
        <!-- Result State -->
        <div
            class="flex flex-col gap-4 animate-in fade-in zoom-in duration-300"
        >
            <div class="text-center mb-2">
                <p class="text-[10px] text-[#9ae600] font-mono uppercase tracking-widest">
                    ✓ Track Retrieved • Spin #{spinCount}
                </p>
            </div>
            <div
                class="bg-[#222] p-4 rounded-lg flex gap-4 border border-[#9ae600]/30 shadow-[0_0_20px_rgba(154,230,0,0.1)]"
            >
                <img
                    src={result.thumbnail ||
                        `https://api.smol.xyz/image/${result.Id}.png?scale=4`}
                    alt={result.Title || result.name}
                    class="w-24 h-24 object-cover rounded bg-black"
                />
                <div class="flex flex-col gap-1 text-left flex-1 min-w-0">
                    <h3 class="text-lg font-bold text-white truncate">
                        {result.Title || result.name || "Unknown Artifact"}
                    </h3>
                    <p class="text-xs text-[#555] font-mono mb-2">
                        ID: {result.Id?.substring(0, 8)}...
                    </p>
                    <div class="flex gap-1 flex-wrap">
                        {#each (result.Tags || result.tags || []).slice(0, 3) as t}
                            <span
                                class="text-[9px] bg-[#111] px-1 rounded text-[#777]"
                                >#{t}</span
                            >
                        {/each}
                    </div>
                </div>
            </div>

            <!-- Labs Player -->
            <LabsPlayer
                src={(result.audio || result.Audio)?.url ||
                    (result.Song_1 || result.Id
                        ? `https://api.smol.xyz/song/${result.Song_1 || result.Id}.mp3`
                        : "")}
                autoplay={true}
            />

            <button
                onclick={reset}
                class="mt-4 text-xs font-mono text-[#555] hover:text-white underline decoration-dashed underline-offset-4"
            >
                Start Over
            </button>
        </div>
    {:else if error}
        <!-- Error State -->
        <div class="text-center py-8 space-y-4">
            <p class="text-red-500 font-mono text-sm">{error}</p>
            <button
                onclick={reset}
                class="px-4 py-2 bg-[#222] border border-red-500/50 text-white rounded text-xs font-mono uppercase"
            >
                Try Again
            </button>
        </div>
    {/if}
</div>

<style>
    /* Custom Scrollbar for the tag list since we globally hid them */
    .scrollbar-thin::-webkit-scrollbar {
        display: block !important;
        width: 4px;
    }
    .scrollbar-thin::-webkit-scrollbar-track {
        background: #111;
    }
    .scrollbar-thin::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 2px;
    }
    .scrollbar-thin {
        scrollbar-width: thin;
        scrollbar-color: #333 #111;
    }
</style>
