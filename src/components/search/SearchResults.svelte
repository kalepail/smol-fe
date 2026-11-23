<script lang="ts">
  import { playSmolQueue, setTrackLiked } from '../../stores/audio.svelte';
  import { toMixtapeTrack } from '../../utils/track';
  import { onMount } from 'svelte';
  import SmolCard from '../smol/SmolCard.svelte';
  import type { SearchResult } from '../../types/domain';
  import { searchSmols } from '../../services/api/search';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { userState } from '../../stores/user.svelte';
  import { addTrack } from '../../stores/mixtape.svelte';

  let results = $state<SearchResult[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');
  let likes = $state<string[]>([]);


  function addToMixtape(smol: SearchResult) {
    addTrack(toMixtapeTrack(smol));
  }

  function handleLikeChanged(smol: SearchResult, liked: boolean) {
    setTrackLiked(smol.Id, liked);
    const foundSmol = results.find((item) => item.Id === smol.Id);
    if (foundSmol) {
      foundSmol.Liked = liked;
    }
  }

  function readQueryFromLocation(): string {
    if (typeof window === 'undefined') return '';

    const url = new URL(window.location.href);
    return (url.searchParams.get('q') ?? '').trim();
  }

  async function loadResults() {
    query = readQueryFromLocation();

    if (!query) {
      results = [];
      error = null;
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const [searchResponse, likedIds] = await Promise.all([
        searchSmols({ query, limit: 20 }),
        userState.contractId ? fetchLikedSmols().catch(() => [] as string[]) : Promise.resolve([]),
      ]);

      likes = likedIds;
      const likedIdSet = new Set(likedIds);
      results = (searchResponse.results ?? []).map((smol) => ({
        ...smol,
        Liked: likedIdSet.has(smol.Id),
      }));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load search results';
      results = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadResults();
    const handlePageLoad = () => {
      void loadResults();
    };

    document.addEventListener('astro:page-load', handlePageLoad);

    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  });
</script>

<section class="px-2 py-6">
  <div class="max-w-[1024px] mx-auto">
    <div class="mb-4">
      <h1 class="text-2xl font-bold text-lime-400">Search</h1>
      {#if query}
        <p class="mt-1 text-sm text-slate-400">Results for “{query}”</p>
      {/if}
    </div>

    {#if loading}
      <div class="flex justify-center items-center py-20">
        <div class="text-lime-500">Searching...</div>
      </div>
    {:else if error}
      <div class="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-rose-200">
        {error}
      </div>
    {:else if !query}
      <div class="rounded-lg border border-slate-700 bg-slate-900 px-4 py-6 text-slate-300">
        Enter a search in the header to find smols.
      </div>
    {:else if results.length === 0}
      <div class="rounded-lg border border-slate-700 bg-slate-900 px-4 py-6 text-slate-300">
        No results found.
      </div>
    {:else}
      <div
        class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 pb-10"
      >
        {#each results as smol (smol.Id)}
          <SmolCard
            smol={smol}
            onPlay={() => playSmolQueue(results, smol, { wrap: true })}
            isVisible={true}
            onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
            onAddToMixtape={() => addToMixtape(smol)}
          />
        {/each}
      </div>
    {/if}
  </div>
</section>
