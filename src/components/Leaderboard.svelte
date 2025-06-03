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
    }

    // Create writable stores for props to make them reactive with `derived`
    const smolsStore = writable<SmolData[]>([]);
    const usersStore = writable<UserData[]>([]);

    // Update stores when props change
    $: smolsStore.set(smols); // Svelte's reactive statement
    $: usersStore.set(users); // Svelte's reactive statement

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

            const processedEntries: LeaderboardEntry[] = $users.map((user: UserData): LeaderboardEntry => ({
                username: user.Username,
                address: user.Address,
                songCount: songCountsByAddress[user.Address] || 0,
                totalPlays: playCountsByAddress[user.Address] || 0,
                totalViews: viewCountsByAddress[user.Address] || 0, // Added total views
            }));

            // Filter out entries where username is "kalepail"
            const filteredEntries = processedEntries.filter(entry => entry.username !== "kalepail");

            filteredEntries.sort((a, b) => {
                if (b.totalPlays !== a.totalPlays) {
                    return b.totalPlays - a.totalPlays;
                }
                if (b.totalViews !== a.totalViews) { // Sort by totalViews if totalPlays are equal
                    return b.totalViews - a.totalViews;
                }
                return b.songCount - a.songCount; // Then by songCount if totalViews are also equal
            });

            return filteredEntries;
        }
    );

</script>

<div class="px-2 py-10 bg-slate-900 text-white">
    <div class="max-w-[1024px] mx-auto">
        <h2 class="text-2xl font-bold mb-6 text-center">
            Leaderboard
        </h2>

        {#if !$leaderboardData || $leaderboardData.length === 0}
            <p class="text-center text-slate-400 py-8">No leaderboard data available. Ensure 'smols' and 'users' props are provided and contain data.</p>
        {:else}
            <div class="overflow-x-auto shadow-lg rounded-lg">
                <table class="min-w-full bg-slate-800 border border-slate-700 rounded-b-lg overflow-hidden">
                    <thead class="bg-slate-700">
                        <tr>
                            <th class="text-left py-3 px-4 md:px-6 font-semibold uppercase tracking-wider text-sm">Rank</th>
                            <th class="text-left py-3 px-4 md:px-6 font-semibold uppercase tracking-wider text-sm">Username</th>
                            <th class="text-right py-3 px-4 md:px-6 font-semibold uppercase tracking-wider text-sm">Smols Created</th>
                            <th class="text-right py-3 px-4 md:px-6 font-semibold uppercase tracking-wider text-sm">Total Views</th>
                            <th class="text-right py-3 px-4 md:px-6 font-semibold uppercase tracking-wider text-sm">Total Plays</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-600">
                        {#each $leaderboardData as entry, index (entry.address)}
                            <tr class="hover:bg-slate-750 transition-colors duration-150">
                                <td class="py-3 px-4 md:px-6 text-slate-300">{index + 1}</td>
                                <td class="py-3 px-4 md:px-6 font-medium">{entry.username}</td>
                                <td class="py-3 px-4 md:px-6 text-right text-slate-300">{entry.songCount.toLocaleString()}</td>
                                <td class="py-3 px-4 md:px-6 text-right text-slate-300">{entry.totalViews.toLocaleString()}</td>
                                <td class="py-3 px-4 md:px-6 text-right font-semibold text-lime-400">{entry.totalPlays.toLocaleString()}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>

<style>
    /* Tailwind CSS is primarily used. Add specific overrides or non-Tailwind styles here if necessary. */
</style>