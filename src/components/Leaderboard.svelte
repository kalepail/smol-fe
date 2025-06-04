<script lang="ts">
    import { derived, writable } from 'svelte/store'; // Using derived for reactive calculations
    import type { Readable } from 'svelte/store';
    // Loader can be removed if no longer needed, or keep if there's a scenario for it.
    // import Loader from "./Loader.svelte";

    // Props: smols and users are now passed directly
    export let smols: SmolData[] = [];
    export let users: UserData[] = [];

    // Interface for individual song data expected via props
    interface SmolData {
        Id: string;
        Address: string; // Creator's address, crucial for grouping
        Plays: number;   // Play count for the song
        Views?: number;  // Optional: View count for the song
        // Title and Song_1 are not strictly needed for this component's logic
    }

    // Interface for user data expected via props
    interface UserData {
        Username: string;
        Address: string;
    }

    // Interface for the processed data to be displayed in the leaderboard
    interface LeaderboardEntry {
        username: string;
        address: string;
        songCount: number;
        totalPlays: number;
        totalViews: number; // Added total views
        totalPoints: number; // Added total points with weighted calculation
    }

    // Create writable stores for props to make them reactive with `derived`
    const smolsStore = writable<SmolData[]>([]);
    const usersStore = writable<UserData[]>([]);

    // Update stores when props change
    $: smolsStore.set(smols); // Svelte's reactive statement
    $: usersStore.set(users); // Svelte's reactive statement

    // Scroll state for shadows
    let scrollContainer: HTMLDivElement | undefined;
    let showTopShadow = false;
    let showBottomShadow = false;

    function handleScroll() {
        if (scrollContainer) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
            showTopShadow = scrollTop > 0;
            showBottomShadow = scrollTop < scrollHeight - clientHeight - 1;
        }
    }

    // Check scroll on mount and when data changes
    $: if (scrollContainer && $leaderboardData.length > 0) {
        // Use setTimeout to ensure DOM is updated
        setTimeout(() => {
            handleScroll();
        }, 0);
    }

    const leaderboardData: Readable<LeaderboardEntry[]> = derived(
        [smolsStore, usersStore],
        ([$smols, $users]) => {
            if (!$smols || !$users || $smols.length === 0 || $users.length === 0) {
                return [];
            }

            const songCountsByAddress: Record<string, number> = {};
            const playCountsByAddress: Record<string, number> = {};
            const viewCountsByAddress: Record<string, number> = {}; // Added for views

            for (const smol of $smols) {
                if (smol.Address) {
                    songCountsByAddress[smol.Address] = (songCountsByAddress[smol.Address] || 0) + 1;
                    if (typeof smol.Plays === 'number') {
                        playCountsByAddress[smol.Address] = (playCountsByAddress[smol.Address] || 0) + smol.Plays;
                    }
                    if (typeof smol.Views === 'number') { // Check if Views is a number
                        viewCountsByAddress[smol.Address] = (viewCountsByAddress[smol.Address] || 0) + smol.Views;
                    }
                } else {
                    console.warn("Smol object missing Address:", smol);
                }
            }

            const processedEntries: LeaderboardEntry[] = $users.map((user: UserData): LeaderboardEntry => {
                const songCount = songCountsByAddress[user.Address] || 0;
                const totalPlays = playCountsByAddress[user.Address] || 0;
                const totalViews = viewCountsByAddress[user.Address] || 0;
                
                // Calculate weighted total points
                const totalPoints = (songCount * 5) + (totalViews * 1) + (totalPlays * 2);
                
                return {
                    username: user.Username,
                    address: user.Address,
                    songCount,
                    totalPlays,
                    totalViews,
                    totalPoints
                };
            });

            // Filter out entries where username is "kalepail"
            const filteredEntries = processedEntries.filter(entry => entry.username !== "kalepail");

            filteredEntries.sort((a, b) => {
                // Sort by total points first
                if (b.totalPoints !== a.totalPoints) {
                    return b.totalPoints - a.totalPoints;
                }
                // Then by plays if points are equal
                if (b.totalPlays !== a.totalPlays) {
                    return b.totalPlays - a.totalPlays;
                }
                // Then by views
                if (b.totalViews !== a.totalViews) {
                    return b.totalViews - a.totalViews;
                }
                // Finally by song count
                return b.songCount - a.songCount;
            });

            return filteredEntries;
        }
    );

</script>

<div class="px-2 py-10 bg-slate-900 overflow-hidden text-white">
    <div class="max-w-[1024px] overflow-hidden mx-auto">
        <!-- <h2 class="text-2xl font-bold mb-6 text-center">
            Leaderboard
        </h2> -->

        {#if !$leaderboardData || $leaderboardData.length === 0}
            <p class="text-center text-slate-400 py-8">No leaderboard data available yet.</p>
        {:else}
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
                        on:scroll={handleScroll}
                        class="overflow-y-auto overflow-x-hidden max-h-[450px] relative min-w-[800px]" 
                        style="scrollbar-gutter: stable;"
                    >
                        <!-- Sticky header wrapper -->
                        <div class="sticky top-0 z-20">
                            <table class="w-full bg-slate-800 border-t border-x border-slate-700">
                                <thead class="bg-slate-700">
                                    <tr>
                                        <th class="text-left py-3 px-4 font-semibold uppercase tracking-wider text-sm" style="width: 100px;">Rank</th>
                                        <th class="text-left py-3 px-4 font-semibold uppercase tracking-wider text-sm" style="width: 140px;">Username</th>
                                        <th class="text-right py-3 px-4 font-semibold uppercase tracking-wider text-sm" style="width: 180px;">
                                            <div>Smols Created</div>
                                            <div class="text-xs font-normal text-slate-400">(5 pts each)</div>
                                        </th>
                                        <th class="text-right py-3 px-4 font-semibold uppercase tracking-wider text-sm" style="width: 160px;">
                                            <div>Total Views</div>
                                            <div class="text-xs font-normal text-slate-400">(1 pt each)</div>
                                        </th>
                                        <th class="text-right py-3 px-4 font-semibold uppercase tracking-wider text-sm" style="width: 160px;">
                                            <div>Total Plays</div>
                                            <div class="text-xs font-normal text-slate-400">(2 pts each)</div>
                                        </th>
                                        <th class="text-right py-3 px-4 font-bold uppercase tracking-wider text-sm text-amber-400" style="width: 110px;">Total</th>
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
                        
                        <!-- Table body (separate table for proper alignment) -->
                        <table class="w-full bg-slate-800 border-slate-700 -mt-[1px]">
                            <tbody class="divide-y divide-slate-600">
                                {#each $leaderboardData as entry, index (entry.address)}
                                    <tr class="hover:bg-slate-750 transition-colors duration-150">
                                        <td class="py-3 px-4 text-slate-300 whitespace-nowrap" style="width: 100px;">{index + 1}</td>
                                        <td class="py-3 px-4 font-medium whitespace-nowrap" style="width: 140px;">{entry.username}</td>
                                        <td class="py-3 px-4 text-right text-slate-300 whitespace-nowrap" style="width: 180px;">{entry.songCount.toLocaleString()}</td>
                                        <td class="py-3 px-4 text-right text-slate-300 whitespace-nowrap" style="width: 160px;">{entry.totalViews.toLocaleString()}</td>
                                        <td class="py-3 px-4 text-right text-slate-300 whitespace-nowrap" style="width: 160px;">{entry.totalPlays.toLocaleString()}</td>
                                        <td class="py-3 px-4 text-right font-bold text-amber-400 whitespace-nowrap" style="width: 110px;">{entry.totalPoints.toLocaleString()}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>