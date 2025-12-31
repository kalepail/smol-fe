<script lang="ts">
    import type { Smol } from "../../types/domain";
    import SmolGrid from "../smol/SmolGrid.svelte";

    let { smols = [] }: { smols: Smol[] } = $props();

    let selectedTags = $state<string[]>([]);
    let searchQuery = $state("");
    let showAll = $state(false);
    const INITIAL_TAG_LIMIT = 50;

    // Aggregate tags and counts (filtered by search)
    let processedTags = $derived.by(() => {
        // 1. Calculate all counts first
        const counts: Record<string, number> = {};
        for (const smol of smols) {
            // Check both top-level Tags and nested style array for robustness
            const styles = new Set<string>();

            if (smol.Tags) {
                smol.Tags.forEach((t) => styles.add(t));
            }
            if (smol.lyrics?.style) {
                smol.lyrics.style.forEach((t) => styles.add(t));
            }

            for (const tag of styles) {
                const normalized = tag.trim();
                if (normalized) {
                    counts[normalized] = (counts[normalized] || 0) + 1;
                }
            }
        }

        // 2. Convert to array and sort by count desc
        let allTags = Object.entries(counts)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);

        // 3. Filter by search query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            allTags = allTags.filter((t) => t.tag.toLowerCase().includes(q));
        }

        return allTags;
    });

    // Display subset based on showAll
    let displayedTags = $derived.by(() => {
        if (showAll || searchQuery) return processedTags;
        return processedTags.slice(0, INITIAL_TAG_LIMIT);
    });

    // Filter smols based on selection
    let filteredSmols = $derived.by(() => {
        if (selectedTags.length === 0) return [];

        return smols.filter((smol) => {
            const styles = new Set<string>();
            if (smol.Tags) smol.Tags.forEach((t) => styles.add(t));
            if (smol.lyrics?.style)
                smol.lyrics.style.forEach((t) => styles.add(t));

            // Show song if it matches ANY selected tag
            return selectedTags.some((tag) => styles.has(tag));
        });
    });

    function selectTag(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter((t) => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
    }

    // Visual scaling logic
    function getFontSize(count: number, max: number): string {
        const minSize = 0.8;
        const maxSize = 2.0; // Reduced max size for cleaner look
        // Logarithmic scale to handle outliers like "Kpop" vs rare tags
        const normalized = Math.log(count + 1) / Math.log(max + 1);
        const size = minSize + (maxSize - minSize) * normalized;
        return `${size.toFixed(2)}rem`;
    }

    function getOpacity(count: number, max: number): number {
        const min = 0.6;
        const maxOp = 1;
        const normalized = Math.log(count + 1) / Math.log(max + 1);
        return min + (maxOp - min) * normalized;
    }

    const maxCount = $derived(
        processedTags.length > 0 ? processedTags[0].count : 1,
    );
</script>

<div class="container mx-auto px-4 py-2 relative z-10">
    <div class="mb-8">
        <!-- Header & Search Row -->
        <div
            class="flex flex-col md:flex-row justify-between items-center mb-6 gap-6"
        >
            <div class="flex items-baseline gap-2 cursor-default group">
                <span
                    class="text-[#9ae600] font-bold text-3xl tracking-tight drop-shadow-[0_0_10px_rgba(154,230,0,0.3)]"
                    >SMOL</span
                >
                <span class="font-thin text-white text-3xl">TAGS</span>
            </div>

            <!-- Search Bar (Radio Style) -->
            <div class="relative w-full md:w-80 flex gap-2">
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Search vibes..."
                    class="reactive-input flex-1 px-4 py-2 text-sm placeholder-white/20 focus:outline-none transition-all font-mono bg-black/40"
                />
                {#if searchQuery}
                    <button
                        class="text-white/40 hover:text-white transition-colors"
                        onclick={() => (searchQuery = "")}
                    >
                        ✕
                    </button>
                {/if}
            </div>
        </div>

        <!-- Tag Cloud (Radio Style) -->
        <div
            class="p-8 reactive-glass rounded-3xl transition-all duration-500 ease-in-out border border-white/5 backdrop-blur-xl"
        >
            <div class="max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                <div
                    class="flex flex-wrap gap-x-4 gap-y-3 justify-center items-center"
                >
                    {#each displayedTags as { tag, count }}
                        <button
                            class="transition-all duration-300 hover:scale-110 leading-none py-1 px-2 rounded-full {selectedTags.includes(
                                tag,
                            )
                                ? 'text-[#9ae600] drop-shadow-[0_0_8px_rgba(154,230,0,0.5)] bg-white/5'
                                : 'text-white'}"
                            style="font-size: {getFontSize(
                                count,
                                maxCount,
                            )}; opacity: {selectedTags.includes(tag)
                                ? 1
                                : getOpacity(count, maxCount)}"
                            onclick={() => selectTag(tag)}
                        >
                            {tag}
                            {#if selectedTags.includes(tag)}
                                <span
                                    class="text-[0.6em] align-top ml-0.5 text-white/40 font-mono tracking-tighter"
                                    >{count}</span
                                >
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>

            {#if processedTags.length === 0}
                <div
                    class="text-center text-white/20 italic py-10 font-mono text-sm tracking-widest"
                >
                    NO TAGS FOUND FOR "{searchQuery.toUpperCase()}"
                </div>
            {/if}

            {#if !searchQuery && processedTags.length > INITIAL_TAG_LIMIT}
                <div
                    class="mt-8 pt-6 border-t border-white/5 flex {selectedTags.length >
                    0
                        ? 'justify-between'
                        : 'justify-center'} items-center gap-4"
                >
                    <button
                        class="text-[10px] font-black tracking-[0.2em] text-white/30 hover:text-[#9ae600] transition-all uppercase px-8 py-2 rounded-full border border-white/5 hover:border-[#9ae600]/30"
                        onclick={() => (showAll = !showAll)}
                    >
                        {showAll
                            ? "Show Less"
                            : `Expand Library (${processedTags.length} Vibes)`}
                    </button>

                    {#if selectedTags.length > 0}
                        <a
                            href={`/radio?${selectedTags.map((t) => `tag=${encodeURIComponent(t)}`).join("&")}`}
                            class="reactive-button-ignite inline-block text-white font-bold px-6 py-2 rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg uppercase tracking-wider text-[11px] animate-in fade-in zoom-in-95 duration-300"
                        >
                            Send to Radio 📻
                        </a>
                    {/if}
                </div>
            {:else if selectedTags.length > 0}
                <!-- If no Expand button, still show the Send to Radio button -->
                <div
                    class="mt-8 pt-6 border-t border-white/5 flex justify-center"
                >
                    <a
                        href={`/radio?${selectedTags.map((t) => `tag=${encodeURIComponent(t)}`).join("&")}`}
                        class="reactive-button-ignite inline-block text-white font-bold px-8 py-2 rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg uppercase tracking-wider text-[11px] animate-in fade-in zoom-in-95 duration-300"
                    >
                        Send to Radio 📻
                    </a>
                </div>
            {/if}
        </div>
    </div>

    <!-- Results Section -->
    {#if selectedTags.length > 0}
        <div
            class="animate-fade-in-up mt-12 bg-black/20 rounded-3xl p-6 border border-white/5"
        >
            <div
                class="flex flex-col sm:flex-row items-center justify-between mb-8 px-2 gap-4"
            >
                <div class="flex flex-wrap items-center gap-2">
                    <h3
                        class="text-xs font-black tracking-[0.2em] text-white/40 uppercase mr-2"
                    >
                        VIBE POOL:
                    </h3>
                    {#each selectedTags as tag}
                        <span
                            class="bg-[#9ae600]/10 text-[#9ae600] px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border border-[#9ae600]/20 flex items-center gap-2 group"
                        >
                            {tag}
                            <button
                                class="text-[#9ae600]/40 group-hover:text-[#9ae600] transition-colors"
                                onclick={() => selectTag(tag)}
                            >
                                ✕
                            </button>
                        </span>
                    {/each}
                    <span class="text-[10px] font-mono text-white/20 ml-2">
                        {filteredSmols.length} RESULTS
                    </span>
                </div>

                <button
                    class="text-[10px] font-black tracking-widest text-white/30 hover:text-white transition-colors uppercase"
                    onclick={() => (selectedTags = [])}
                >
                    Clear Filter
                </button>
            </div>

            {#key selectedTags.join(",")}
                <SmolGrid initialSmols={filteredSmols} />
            {/key}
        </div>
    {:else}
        <div class="text-center py-20 animate-pulse">
            <div
                class="text-white/10 font-mono text-xs tracking-[0.4em] uppercase"
            >
                Select a vibe to explore the archive
            </div>
        </div>
    {/if}
</div>

<style>
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    .animate-fade-in-up {
        animation: fadeInUp 0.4s ease-out forwards;
    }

    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(154, 230, 0, 0.3);
    }
</style>
