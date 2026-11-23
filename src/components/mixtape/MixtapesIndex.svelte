<script lang="ts">
  import { onMount } from 'svelte';
  import MixtapeCardsGrid from './MixtapeCardsGrid.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import { userState } from '../../stores/user.svelte';
  import { openMixtapeSheet, mixtapeDraftState } from '../../stores/mixtape.svelte';
  import { listMixtapes, type MixtapeSummary } from '../../services/api/mixtapes';

  let mixtapes = $state<MixtapeSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const draftCount = $derived(mixtapeDraftState.tracks.length);

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
    void loadMixtapes();
  });
</script>

<section class="app-container py-5 sm:py-6 space-y-6">
  <header class="flex items-center justify-between gap-4">
    <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">Mixtapes</h1>
    {#if userState.contractId}
      <div class="lg:hidden">
        <Button variant="secondary" size="sm" class="min-h-11" onclick={openMixtapeSheet}>
          <Icon name="plus" size={16} />
          <span>{draftCount > 0 ? `Open draft (${draftCount})` : 'New mixtape'}</span>
        </Button>
      </div>
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
