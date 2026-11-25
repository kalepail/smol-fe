<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { playSmolQueue, setTrackLiked } from '../../stores/audio.svelte';
  import SmolCard from '../smol/SmolCard.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import Icon from '../ui/Icon.svelte';
  import Button from '../ui/Button.svelte';
  import type { SearchResult } from '../../types/domain';
  import { searchSmols } from '../../services/api/search';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { userState } from '../../stores/user.svelte';
  import { toggleDraftTrack } from '../../stores/mixtape.svelte';

  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let query = $state('');
  let inputQuery = $state('');

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

  function readQueryFromLocation(): string {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    return (url.searchParams.get('q') ?? '').trim();
  }

  async function loadResults() {
    query = readQueryFromLocation();
    inputQuery = query;

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
        searchSmols({ query, limit: 24 }),
        userState.contractId ? fetchLikedSmols().catch(() => [] as string[]) : Promise.resolve([]),
      ]);

      const likedIdSet = new Set(likedIds);
      results = (searchResponse.results ?? []).map((smol) => ({
        ...smol,
        Liked: likedIdSet.has(smol.Id),
      }));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load search results.';
      results = [];
    } finally {
      loading = false;
    }
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = inputQuery.trim();
    const nextUrl = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search';
    void navigate(nextUrl);
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

<section class="app-container py-5 sm:py-6 space-y-6">
  <header class="space-y-4">
    <div>
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">Search</h1>
      {#if query}
        <p class="mt-1 text-sm text-ink-2">Results for “{query}”</p>
      {/if}
    </div>

    <form onsubmit={handleSubmit} class="flex max-w-xl gap-2">
      <label class="relative min-w-0 flex-1">
        <span class="sr-only">Search songs</span>
        <span class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">
          <Icon name="search" size={18} />
        </span>
        <input
          type="search"
          name="q"
          bind:value={inputQuery}
          placeholder="Search by mood, genre, title, or lyrics"
          class="input-ring min-h-11 w-full rounded-[var(--radius-control)] bg-surface-1 pl-10 pr-3.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
        />
      </label>
      <Button type="submit" variant="primary">Search</Button>
    </form>
  </header>

  {#if loading}
    <Skeleton variant="card" count={8} />
  {:else if error}
    <StateFeedback
      kind="error"
      title="Search failed"
      message={error}
      actionLabel="Try again"
      onAction={() => void loadResults()}
    />
  {:else if !query}
    <StateFeedback
      kind="empty"
      icon="search"
      title="Find a song"
      message="Search across titles, genres, moods, and lyrics."
    />
  {:else if results.length === 0}
    <StateFeedback
      kind="empty"
      icon="search"
      title="No matching songs"
      message={`Nothing matched "${query}". Try a broader genre or mood.`}
      actionLabel="Clear search"
      onAction={() => {
        inputQuery = '';
        void navigate('/search');
      }}
    />
  {:else}
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {#each results as smol (smol.Id)}
        <SmolCard
          {smol}
          onPlay={() => playSmolQueue(results, smol, { wrap: true })}
          onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
          onAddToMixtape={() => addToMixtape(smol)}
        />
      {/each}
    </div>
  {/if}
</section>
