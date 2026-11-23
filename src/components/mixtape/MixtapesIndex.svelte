<script lang="ts">
  import { onMount } from 'svelte';
  import MixtapeCardsGrid from './MixtapeCardsGrid.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import { userState } from '../../stores/user.svelte';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import {
    openMixtapeSheet,
    mixtapeDraftState,
    mixtapeDraftHasContent,
  } from '../../stores/mixtape.svelte';
  import { listMixtapes, type MixtapeSummary } from '../../services/api/mixtapes';

  interface Props {
    initialMixtapes?: MixtapeSummary[] | null;
  }

  let { initialMixtapes = null }: Props = $props();

  let mixtapes = $state<MixtapeSummary[]>(initialMixtapes ?? []);
  let loading = $state(initialMixtapes === null);
  let error = $state<string | null>(null);

  const draftCount = $derived(mixtapeDraftState.tracks.length);
  const hasDraft = $derived(mixtapeDraftHasContent.current);

  async function loadMixtapes() {
    loading = true;
    error = null;
    try {
      mixtapes = await listMixtapes();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not load mixtapes.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (initialMixtapes === null) {
      void loadMixtapes();
    }
  });
</script>

<section class="app-container py-5 sm:py-6 space-y-6">
  <header class="flex items-center justify-between gap-4">
    <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">Mixtapes</h1>
    {#if userState.contractId}
      <div class="lg:hidden">
        <Button variant="secondary" size="sm" class="min-h-11" onclick={() => openMixtapeSheet('builder')}>
          <Icon name="plus" size={16} />
          <span>
            {#if draftCount > 0}
              Open draft ({draftCount})
            {:else if hasDraft}
              Open draft
            {:else}
              New mixtape
            {/if}
          </span>
        </Button>
      </div>
    {:else}
      <Button
        variant="secondary"
        size="sm"
        class="min-h-11"
        onclick={() => openAuthSheet('signin', 'Sign in to create and publish mixtapes.')}
      >
        <Icon name="plus" size={16} />
        <span>Make a mixtape</span>
      </Button>
    {/if}
  </header>

  {#if loading}
    <Skeleton variant="card" count={8} />
  {:else if error}
    <StateFeedback
      kind="error"
      title="Could not load mixtapes"
      message={error}
      actionLabel="Try again"
      onAction={() => void loadMixtapes()}
    />
  {:else}
    <MixtapeCardsGrid {mixtapes} />
  {/if}
</section>
