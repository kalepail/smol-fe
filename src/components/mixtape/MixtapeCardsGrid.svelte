<script lang="ts">
  import type { MixtapeSummary } from '../../services/api/mixtapes';
  import MixtapeCollage from '../ui/MixtapeCollage.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';

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
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {#each mixtapes as mixtape (mixtape.id)}
      <article class="group flex flex-col min-w-0">
        <a
          href={`/mixtapes/${mixtape.id}`}
          class="focus-ring flex flex-col gap-2.5 rounded-[var(--radius-media)]"
        >
          <MixtapeCollage coverUrls={mixtape.coverUrls} alt={mixtape.title} />

          <div class="min-w-0 space-y-0.5">
            <h2 class="truncate text-[15px] font-medium leading-5 text-ink-1 group-hover:underline">
              {mixtape.title}
            </h2>
            <p class="tabular text-[13px] text-ink-2">
              {mixtape.trackCount} {mixtape.trackCount === 1 ? 'song' : 'songs'}
            </p>
            {#if mixtape.description}
              <p class="line-clamp-2 text-xs leading-relaxed text-ink-3">
                {mixtape.description}
              </p>
            {/if}
          </div>
        </a>
      </article>
    {/each}
  </div>
{/if}
