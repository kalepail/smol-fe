<script lang="ts">
  import SmolCard from '../smol/SmolCard.svelte';
  import type { MixtapeTrack, SearchResult } from '../../types/domain';
  import { searchSimilarSmols } from '../../services/api/search';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { addTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';

  interface Props {
    id: string;
  }

  let { id }: Props = $props();

  let refine = $state('');
  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let error = $state<string | null>(null);

  function buildTrackPayload(smol: SearchResult): MixtapeTrack {
    return {
      id: smol.Id,
      title: smol.Title ?? 'Untitled Smol',
      creator: smol.Creator ?? smol.Username ?? smol.artist ?? smol.author ?? null,
      coverUrl: `${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`,
    };
  }

  function addToMixtape(smol: SearchResult) {
    addTrack(buildTrackPayload(smol));
  }

  function handleLikeChanged(smol: SearchResult, liked: boolean) {
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
          refine: refine.trim() || undefined,
          limit: 8,
        }),
        userState.contractId ? fetchLikedSmols().catch(() => [] as string[]) : Promise.resolve([]),
      ]);

      results = (response.results ?? []).map((smol) => ({
        ...smol,
        Liked: likedIds.some((likedId) => likedId === smol.Id),
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

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void loadSimilar();
  }

  $effect(() => {
    id;
    refine = '';
    results = [];
    loading = false;
    loaded = false;
    error = null;
    void loadSimilar();
  });
</script>

<section class="px-2 py-8">
  <div class="max-w-[1024px] mx-auto">
    <div class="mb-4">
      <h2 class="text-xl font-bold text-lime-400">More Like This</h2>
    </div>

    <form class="mb-5 flex flex-col gap-3 sm:flex-row" onsubmit={handleSubmit}>
      <input
        class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-lime-400"
        type="text"
        bind:value={refine}
        placeholder="Refine"
      />
      <button
        class="rounded-lg bg-lime-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={loading}
      >
        {loading ? 'Searching...' : 'Find More Like This'}
      </button>
    </form>

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
            isVisible={true}
            onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
            onAddToMixtape={() => addToMixtape(smol)}
          />
        {/each}
      </div>
    {/if}
  </div>
</section>
