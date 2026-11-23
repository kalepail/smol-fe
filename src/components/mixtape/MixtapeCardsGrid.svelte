<script lang="ts">
  import type { MixtapeSummary } from '../../services/api/mixtapes';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import MixtapeCard from './MixtapeCard.svelte';

  interface Props {
    mixtapes?: MixtapeSummary[];
  }

  let { mixtapes = [] }: Props = $props();
</script>

{#if mixtapes.length === 0}
  <StateFeedback
    kind="empty"
    icon="mixtapes"
    title="No mixtapes yet"
    message="Published mixtapes from the community will show up here."
    actionLabel="Browse songs"
    actionHref="/"
  />
{:else}
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
    {#each mixtapes as mixtape (mixtape.id)}
      <MixtapeCard {mixtape} />
    {/each}
  </div>
{/if}
