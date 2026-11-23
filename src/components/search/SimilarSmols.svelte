<script lang="ts">
  import { playSmolQueue, setTrackLiked } from '../../stores/audio.svelte';
  import { toMixtapeTrack } from '../../utils/track';
  import SmolCard from '../smol/SmolCard.svelte';
  import type { SearchResult } from '../../types/domain';
  import { searchSimilarSmols } from '../../services/api/search';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { addTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';

  interface Props {
    id: string;
  }

  let { id }: Props = $props();

  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let error = $state<string | null>(null);

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

  async function loadSimilar() {
    if (!id) return;

    loading = true;
    error = null;

    try {
      const [response, likedIds] = await Promise.all([
        searchSimilarSmols({
          id,
          limit: 8,
        }),
        userState.contractId ? fetchLikedSmols().catch(() => [] as string[]) : Promise.resolve([]),
      ]);

      const likedIdSet = new Set(likedIds);
      results = (response.results ?? []).map((smol) => ({
        ...smol,
        Liked: likedIdSet.has(smol.Id),
      }));
      loaded = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load similar smols';
      results = [];
      loaded = true;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    id;
    results = [];
    loading = false;
    loaded = false;
    error = null;
    void loadSimilar();
  });
</script>

<section class="px-2 py-8 pb-24">
  <div class="max-w-[1024px] mx-auto">
    <div class="mb-4">
      <h2 class="text-xl font-bold text-lime-400">More Like This</h2>
    </div>

    {#if error}
      <div class="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-rose-200">
        {error}
      </div>
    {/if}

    {#if loaded && !error && results.length === 0}
      <div class="rounded-lg border border-slate-700 bg-slate-900 px-4 py-6 text-slate-300">
        No similar smols found.
      </div>
    {:else if results.length > 0}
      <div class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
        {#each results as smol (smol.Id)}
          <SmolCard
            smol={smol}
            onPlay={() => playSmolQueue(results, smol)}
            isVisible={true}
            onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
            onAddToMixtape={() => addToMixtape(smol)}
          />
        {/each}
      </div>
    {/if}
  </div>
</section>
