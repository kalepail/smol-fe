<script lang="ts">
    import type { Smol } from "../../types/domain";
    import SmolGrid from "../smol/SmolGrid.svelte";

    let { smols = [] }: { smols: Smol[] } = $props();

    let selectedTag = $state<string | null>(null);
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
        if (!selectedTag) return [];

        return smols.filter((smol) => {
            const styles = new Set<string>();
            if (smol.Tags) smol.Tags.forEach((t) => styles.add(t));
            if (smol.lyrics?.style)
                smol.lyrics.style.forEach((t) => styles.add(t));
            return styles.has(selectedTag!);
        });
    });

    function selectTag(tag: string) {
        if (selectedTag === tag) {
            selectedTag = null;
        } else {
            selectedTag = tag;
            // Optionally scroll to grid here
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

<div class="container mx-auto px-4 py-8">
    <div class="mb-8">
        <div
            class="flex flex-col md:flex-row justify-between items-end mb-4 gap-4"
        >
            <h2 class="text-2xl font-bold text-lime-400">EXPLORE TAGS</h2>

            <!-- Search Bar -->
            <div class="relative w-full md:w-64">
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Search tags..."
                    class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-lime-500 transition-colors"
                />
            </div>
        </div>

        <!-- Tag Cloud/Map -->
        <div
            class="flex flex-col items-center p-8 bg-slate-900/50 rounded-3xl border border-slate-800 transition-all duration-500 ease-in-out"
        >
            <div class="flex flex-wrap gap-x-4 gap-y-2 justify-center">
                {#each displayedTags as { tag, count }}
                    <button
                        class="transition-all duration-200 hover:text-lime-400 hover:scale-105 leading-none py-1"
                        class:text-lime-400={selectedTag === tag}
                        class:text-white={selectedTag !== tag}
                        class:font-bold={count > 5}
                        style="font-size: {getFontSize(
                            count,
                            maxCount,
                        )}; opacity: {selectedTag === tag
                            ? 1
                            : getOpacity(count, maxCount)}"
                        onclick={() => selectTag(tag)}
                    >
                        {tag}
                        {#if selectedTag === tag}
                            <span class="text-xs align-top ml-0.5 opacity-60"
                                >({count})</span
                            >
                        {/if}
                    </button>
                {/each}
            </div>

            {#if processedTags.length === 0}
                <div class="text-slate-500 italic mt-4">No tags found.</div>
            {/if}

            {#if !searchQuery && processedTags.length > INITIAL_TAG_LIMIT}
                <button
                    class="mt-8 text-xs font-bold tracking-widest text-slate-500 hover:text-lime-400 transition-colors uppercase border-t border-slate-800 pt-4 w-full"
                    onclick={() => (showAll = !showAll)}
                >
                    {showAll
                        ? "Show Less"
                        : `Show All (${processedTags.length} Tags)`}
                </button>
            {/if}
        </div>
    </div>

    {#if selectedTag}
        <div class="animate-fade-in-up">
            <h3 class="text-xl font-semibold mb-4 px-2">
                Songs tagged with <span class="text-lime-400"
                    >"{selectedTag}"</span
                >
                <span class="text-sm text-slate-500 font-normal ml-2"
                    >({filteredSmols.length})</span
                >
            </h3>
            <!-- KEY ADDED HERE -->
            {#key selectedTag}
                <SmolGrid initialSmols={filteredSmols} />
            {/key}
        </div>
    {:else}
        <div class="text-center text-slate-500 mt-12">
            Select a tag above to view songs.
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
</style>
