<script lang="ts">
  import { playSmolQueue, setTrackLiked } from '../../stores/audio.svelte';
  import SmolCard from '../smol/SmolCard.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import type { SearchResult } from '../../types/domain';
  import { searchSimilarSmols } from '../../services/api/search';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { ApiError } from '../../services/api/fetch';
  import { toggleDraftTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';

  interface Props {
    id: string;
  }

  let { id }: Props = $props();

  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let indexing = $state(false);
  let error = $state<string | null>(null);

  function addToMixtape(smol: SearchResult) {
    toggleDraftTrack({ ...smol, Public: smol.Public === 0 ? 0 : 1 });
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
    indexing = false;
    error = null;

    try {
      const [response, likedIds] = await Promise.all([
        searchSimilarSmols({ id, limit: 6 }),
        userState.contractId ? fetchLikedSmols().catch(() => [] as string[]) : Promise.resolve([]),
      ]);

      const likedIdSet = new Set(likedIds);
      results = (response.results ?? []).map((smol) => ({
        ...smol,
        Liked: likedIdSet.has(smol.Id),
      }));
      loaded = true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        indexing = true;
      } else {
        error = err instanceof Error ? err.message : 'Could not load similar songs.';
      }
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
    indexing = false;
    error = null;
    void loadSimilar();
  });
</script>

<section class="app-container border-t border-line py-8">
  <h2 class="mb-4 text-xl font-semibold text-ink-1">More like this</h2>

  {#if loading}
    <Skeleton variant="card" count={6} />
  {:else if indexing}
    <p class="rounded-[var(--radius-control)] bg-surface-1 px-4 py-3 text-sm text-ink-2 ring-1 ring-inset ring-line">
      Indexing similar songs. Check back in a moment.
    </p>
  {:else if error}
    <p class="rounded-[var(--radius-control)] bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/30">
      {error}
    </p>
  {:else if loaded && results.length === 0}
    <p class="text-sm text-ink-2">No similar songs found yet.</p>
  {:else if results.length > 0}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
      {#each results as smol (smol.Id)}
        <SmolCard
          {smol}
          onPlay={() => playSmolQueue(results, smol)}
          onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
          onAddToMixtape={() => addToMixtape(smol)}
        />
      {/each}
    </div>
  {/if}
</section>
