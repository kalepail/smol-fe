<script lang="ts">
  import { onMount } from 'svelte';
  import type { ArtistProfile, SmolListResponse } from '../types/api';
  import type { Smol } from '../types/domain';
  import { shortenAddress } from '../utils/address';
  import { fetchWithTimeout, throwIfNotOk } from '../services/api/fetch';
  import { logger } from '../utils/logger';
  import Skeleton from './ui/Skeleton.svelte';
  import StateFeedback from './ui/StateFeedback.svelte';

  interface LeaderboardEntry {
    username: string;
    address: string;
    songCount: number;
    totalPlays: number;
    totalViews: number;
    totalPoints: number;
  }

  interface Props {
    playlist: string;
    initialData?: SmolListResponse | null;
  }

  let { playlist, initialData = null }: Props = $props();

  let smols = $state<Smol[]>([]);
  let users = $state<ArtistProfile[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function applyData(data: SmolListResponse) {
    smols = data.smols || [];
    users = data.users || [];
    loading = false;
    error = null;
  }

  async function fetchLeaderboard(playlistName: string) {
    loading = true;
    error = null;

    try {
      const url = `${import.meta.env.PUBLIC_API_URL}/playlist/${encodeURIComponent(playlistName)}?limit=100`;
      const response = await fetchWithTimeout(url);
      await throwIfNotOk(response, url);
      applyData(await response.json());
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load leaderboard.';
      logger.error('leaderboard', 'Failed to fetch leaderboard:', err);
      loading = false;
    }
  }

  onMount(() => {
    if (initialData) {
      applyData(initialData);
    } else if (playlist) {
      void fetchLeaderboard(playlist);
    } else {
      loading = false;
    }
  });

  const leaderboardData = $derived.by(() => {
    if (!smols.length || !users.length) return [] as LeaderboardEntry[];

    const songCounts: Record<string, number> = {};
    const playCounts: Record<string, number> = {};
    const viewCounts: Record<string, number> = {};

    for (const smol of smols) {
      if (!smol.Address) continue;
      songCounts[smol.Address] = (songCounts[smol.Address] || 0) + 1;
      if (typeof smol.Plays === 'number') {
        playCounts[smol.Address] = (playCounts[smol.Address] || 0) + smol.Plays;
      }
      if (typeof smol.Views === 'number') {
        viewCounts[smol.Address] = (viewCounts[smol.Address] || 0) + smol.Views;
      }
    }

    return users
      .map((user): LeaderboardEntry => {
        const songCount = songCounts[user.Address] || 0;
        const totalPlays = playCounts[user.Address] || 0;
        const totalViews = viewCounts[user.Address] || 0;
        const totalPoints = songCount * 5 + totalViews + totalPlays * 2;
        return {
          username: user.Username,
          address: user.Address,
          songCount,
          totalPlays,
          totalViews,
          totalPoints,
        };
      })
      .filter((entry) => entry.username !== 'kalepail')
      .sort((a, b) =>
        b.totalPoints - a.totalPoints ||
        b.totalPlays - a.totalPlays ||
        b.totalViews - a.totalViews ||
        b.songCount - a.songCount
      );
  });
</script>

<section class="border-b border-line bg-surface-1/50 py-6 sm:py-8">
  <div class="app-container space-y-4">
    <header>
      <p class="text-xs font-medium uppercase tracking-wider text-ink-3">Playlist leaderboard</p>
      <h1 class="mt-1 text-2xl sm:text-3xl font-semibold text-ink-1">{playlist}</h1>
    </header>

    {#if loading}
      <Skeleton variant="row" count={5} />
    {:else if error}
      <StateFeedback
        kind="error"
        title="Could not load leaderboard"
        message={error}
        actionLabel="Try again"
        onAction={() => void fetchLeaderboard(playlist)}
      />
    {:else if leaderboardData.length === 0}
      <p class="text-sm text-ink-2">No leaderboard entries yet.</p>
    {:else}
      <div class="overflow-x-auto rounded-[var(--radius-control)] ring-1 ring-inset ring-line">
        <table class="w-full min-w-[560px] border-collapse bg-surface-1 text-left text-sm">
          <thead>
            <tr class="border-b border-line bg-surface-2 text-xs uppercase tracking-wider text-ink-2">
              <th class="px-4 py-3 font-medium">Rank</th>
              <th class="px-4 py-3 font-medium">Artist</th>
              <th class="px-4 py-3 text-right font-medium">Songs</th>
              <th class="px-4 py-3 text-right font-medium">Views</th>
              <th class="px-4 py-3 text-right font-medium">Plays</th>
              <th class="px-4 py-3 text-right font-semibold text-warning">Points</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line tabular">
            {#each leaderboardData as entry, index (entry.address)}
              <tr class="hover:bg-surface-2/70">
                <td class="px-4 py-3 text-ink-2">{index + 1}</td>
                <td class="px-4 py-3 font-medium">
                  <a
                    class="focus-ring rounded text-ink-1 hover:underline"
                    href={`/artists/${encodeURIComponent(entry.address)}`}
                  >
                    {entry.username || shortenAddress(entry.address)}
                  </a>
                </td>
                <td class="px-4 py-3 text-right text-ink-2">{entry.songCount.toLocaleString()}</td>
                <td class="px-4 py-3 text-right text-ink-2">{entry.totalViews.toLocaleString()}</td>
                <td class="px-4 py-3 text-right text-ink-2">{entry.totalPlays.toLocaleString()}</td>
                <td class="px-4 py-3 text-right font-semibold text-warning">{entry.totalPoints.toLocaleString()}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</section>
