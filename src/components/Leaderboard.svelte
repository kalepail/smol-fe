<script lang="ts">
    import { onMount } from "svelte";
    import { calculateLeaderboard, type LeaderboardEntry } from "../utils/leaderboardCalculations";

    interface SmolData {
        Id: string;
        Address: string;
        Plays: number;
        Views?: number;
    }

    interface UserData {
        Username: string;
        Address: string;
    }

    interface Props {
        playlist: string;
    }

    let { playlist }: Props = $props();

    let smols = $state<SmolData[]>([]);
    let users = $state<UserData[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let searchQuery = $state("");

    async function fetchLeaderboard(playlistName: string) {
        loading = true;
        error = null;

        try {
            const API_URL =
                import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";
            const response = await fetch(
                `${API_URL}/playlist/${playlistName}?limit=100`,
            );

            if (!response.ok) {
                throw new Error("Failed to load leaderboard");
            }

            const data = await response.json();
            smols = data.smols || [];
            users = data.users || [];
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to load";
            console.error("Failed to fetch leaderboard:", err);
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        if (playlist) {
            fetchLeaderboard(playlist);
        }
    });

    // Scroll state for shadows
    let scrollContainer = $state<HTMLDivElement | undefined>();
    let showTopShadow = $state(false);
    let showBottomShadow = $state(false);

    function handleScroll() {
        if (scrollContainer) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
            showTopShadow = scrollTop > 0;
            showBottomShadow = scrollTop < scrollHeight - clientHeight - 1;
        }
    }

    // Use shared utility for leaderboard calculation
    const leaderboardData = $derived.by(() => {
        return calculateLeaderboard(smols, users, ["kalepail"]);
    });

    // Filtered data based on search
    const filteredData = $derived.by(() => {
        if (!searchQuery.trim()) return leaderboardData;
        const q = searchQuery.toLowerCase().trim();
        return leaderboardData.filter(
            (entry) => entry.username.toLowerCase().includes(q),
        );
    });

    // Summary stats
    const stats = $derived.by(() => {
        if (leaderboardData.length === 0) return null;
        const totalCreators = leaderboardData.length;
        const totalSmols = leaderboardData.reduce((sum, e) => sum + e.songCount, 0);
        const totalPlays = leaderboardData.reduce((sum, e) => sum + e.totalPlays, 0);
        const totalViews = leaderboardData.reduce((sum, e) => sum + e.totalViews, 0);
        return { totalCreators, totalSmols, totalPlays, totalViews };
    });

    // Rank medal for top 3
    function getRankDisplay(index: number): { medal: string; class: string } | null {
        if (index === 0) return { medal: "\u{1F947}", class: "text-amber-400" };
        if (index === 1) return { medal: "\u{1F948}", class: "text-slate-300" };
        if (index === 2) return { medal: "\u{1F949}", class: "text-amber-600" };
        return null;
    }

    // Find original rank when search is active
    function getOriginalRank(entry: LeaderboardEntry): number {
        return leaderboardData.indexOf(entry) + 1;
    }

    // Points bar width relative to leader
    function getBarWidth(points: number): number {
        if (leaderboardData.length === 0) return 0;
        const max = leaderboardData[0].totalPoints;
        if (max === 0) return 0;
        return Math.max(2, (points / max) * 100);
    }

    // Check scroll on mount and when data changes
    $effect(() => {
        if (scrollContainer && filteredData.length > 0) {
            setTimeout(() => {
                handleScroll();
            }, 0);
        }
    });
</script>

<div class="px-2 py-10 bg-slate-900 overflow-hidden text-white">
    <div class="max-w-[1024px] overflow-hidden mx-auto">
        {#if loading}
            <div class="flex flex-col items-center gap-3 py-12">
                <div class="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-sm text-lime-500 font-mono">Loading leaderboard...</p>
            </div>
        {:else if error}
            <div class="text-center py-8">
                <p class="text-red-400 font-mono text-sm">{error}</p>
                <button
                    onclick={() => fetchLeaderboard(playlist)}
                    class="mt-3 px-4 py-2 text-xs font-mono uppercase tracking-wider bg-slate-800 border border-slate-600 rounded hover:bg-slate-700 hover:border-slate-500 transition-colors"
                >
                    Retry
                </button>
            </div>
        {:else if !leaderboardData || leaderboardData.length === 0}
            <p class="text-center text-slate-400 py-8">
                No leaderboard data available yet.
            </p>
        {:else}
            <!-- Stats Summary -->
            {#if stats}
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
                        <div class="text-lg md:text-xl font-bold text-white">{stats.totalCreators.toLocaleString()}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Creators</div>
                    </div>
                    <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
                        <div class="text-lg md:text-xl font-bold text-lime-400">{stats.totalSmols.toLocaleString()}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Smols</div>
                    </div>
                    <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
                        <div class="text-lg md:text-xl font-bold text-sky-400">{stats.totalViews.toLocaleString()}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Views</div>
                    </div>
                    <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
                        <div class="text-lg md:text-xl font-bold text-pink-400">{stats.totalPlays.toLocaleString()}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-widest font-mono">Plays</div>
                    </div>
                </div>
            {/if}

            <!-- Search -->
            <div class="mb-4">
                <div class="relative">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                        type="text"
                        placeholder="Search creators..."
                        bind:value={searchQuery}
                        class="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 transition-colors"
                    />
                    {#if searchQuery}
                        <button
                            onclick={() => searchQuery = ""}
                            class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6 6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    {/if}
                </div>
                {#if searchQuery && filteredData.length !== leaderboardData.length}
                    <p class="text-xs text-slate-500 mt-1.5 font-mono">
                        {filteredData.length} of {leaderboardData.length} creators
                    </p>
                {/if}
            </div>

            <div class="relative overflow-hidden shadow-lg rounded-lg">
                <!-- Bottom shadow -->
                <div
                    class="absolute left-0 bottom-0 right-0 h-10 bg-gradient-to-t from-slate-900 to-transparent z-30 pointer-events-none transition-opacity duration-300"
                    class:opacity-100={showBottomShadow}
                    class:opacity-0={!showBottomShadow}
                ></div>

                <!-- Horizontal scroll wrapper -->
                <div class="overflow-x-auto">
                    <!-- Scrollable container -->
                    <div
                        bind:this={scrollContainer}
                        onscroll={handleScroll}
                        class="overflow-y-auto overflow-x-hidden max-h-[450px] relative min-w-[640px]"
                        style="scrollbar-gutter: stable;"
                    >
                        <!-- Sticky header wrapper -->
                        <div class="sticky top-0 z-20">
                            <table
                                class="w-full bg-slate-800 border-t border-x border-slate-700"
                            >
                                <thead class="bg-slate-700">
                                    <tr>
                                        <th
                                            class="text-left py-3 px-3 md:px-4 font-semibold uppercase tracking-wider text-xs md:text-sm"
                                            style="width: 80px;">Rank</th
                                        >
                                        <th
                                            class="text-left py-3 px-3 md:px-4 font-semibold uppercase tracking-wider text-xs md:text-sm"
                                            style="width: 140px;">Creator</th
                                        >
                                        <th
                                            class="text-right py-3 px-3 md:px-4 font-semibold uppercase tracking-wider text-xs md:text-sm"
                                            style="width: 120px;"
                                        >
                                            <div>Smols</div>
                                            <div
                                                class="text-[10px] font-normal text-slate-400"
                                            >
                                                5 pts each
                                            </div>
                                        </th>
                                        <th
                                            class="text-right py-3 px-3 md:px-4 font-semibold uppercase tracking-wider text-xs md:text-sm"
                                            style="width: 120px;"
                                        >
                                            <div>Views</div>
                                            <div
                                                class="text-[10px] font-normal text-slate-400"
                                            >
                                                1 pt each
                                            </div>
                                        </th>
                                        <th
                                            class="text-right py-3 px-3 md:px-4 font-semibold uppercase tracking-wider text-xs md:text-sm"
                                            style="width: 120px;"
                                        >
                                            <div>Plays</div>
                                            <div
                                                class="text-[10px] font-normal text-slate-400"
                                            >
                                                2 pts each
                                            </div>
                                        </th>
                                        <th
                                            class="text-right py-3 px-3 md:px-4 font-bold uppercase tracking-wider text-xs md:text-sm text-amber-400"
                                            style="width: 140px;">Points</th
                                        >
                                    </tr>
                                </thead>
                            </table>

                            <!-- Top shadow attached to sticky wrapper -->
                            <div
                                class="absolute left-0 right-0 h-10 bg-gradient-to-b from-slate-900 to-transparent pointer-events-none transition-opacity duration-300"
                                class:opacity-100={showTopShadow}
                                class:opacity-0={!showTopShadow}
                            ></div>
                        </div>

                        <!-- Table body -->
                        <table
                            class="w-full bg-slate-800 border-slate-700 -mt-[1px]"
                        >
                            <tbody class="divide-y divide-slate-700/50">
                                {#each filteredData as entry, index (entry.address)}
                                    {@const rank = searchQuery ? getOriginalRank(entry) : index + 1}
                                    {@const rankInfo = getRankDisplay(rank - 1)}
                                    <tr
                                        class="transition-colors duration-150 {rank <= 3 ? 'bg-slate-800/80' : ''} hover:bg-slate-700/40"
                                    >
                                        <td
                                            class="py-3 px-3 md:px-4 whitespace-nowrap"
                                            style="width: 80px;"
                                        >
                                            {#if rankInfo}
                                                <span class="text-lg" title="Rank {rank}">{rankInfo.medal}</span>
                                            {:else}
                                                <span class="text-slate-500 font-mono text-sm">{rank}</span>
                                            {/if}
                                        </td>
                                        <td
                                            class="py-3 px-3 md:px-4 font-medium whitespace-nowrap"
                                            style="width: 140px;"
                                        >
                                            <span class="{rank <= 3 ? 'text-white' : 'text-slate-200'}">{entry.username}</span>
                                        </td>
                                        <td
                                            class="py-3 px-3 md:px-4 text-right text-slate-300 whitespace-nowrap font-mono text-sm"
                                            style="width: 120px;"
                                            >{entry.songCount.toLocaleString()}</td
                                        >
                                        <td
                                            class="py-3 px-3 md:px-4 text-right text-slate-300 whitespace-nowrap font-mono text-sm"
                                            style="width: 120px;"
                                            >{entry.totalViews.toLocaleString()}</td
                                        >
                                        <td
                                            class="py-3 px-3 md:px-4 text-right text-slate-300 whitespace-nowrap font-mono text-sm"
                                            style="width: 120px;"
                                            >{entry.totalPlays.toLocaleString()}</td
                                        >
                                        <td
                                            class="py-3 px-3 md:px-4 text-right whitespace-nowrap"
                                            style="width: 140px;"
                                        >
                                            <div class="flex flex-col items-end gap-1">
                                                <span class="font-bold text-amber-400 font-mono text-sm">{entry.totalPoints.toLocaleString()}</span>
                                                <div class="w-full h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                                    <div
                                                        class="h-full rounded-full transition-all duration-500 {rank === 1 ? 'bg-amber-400' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-amber-600' : 'bg-slate-500'}"
                                                        style="width: {getBarWidth(entry.totalPoints)}%"
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>

                        {#if filteredData.length === 0 && searchQuery}
                            <div class="py-8 text-center text-slate-500 text-sm font-mono">
                                No creators matching "{searchQuery}"
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
