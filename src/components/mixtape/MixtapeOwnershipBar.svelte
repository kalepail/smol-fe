<script lang="ts">
  import type { TrackCollectState } from '../../utils/mixtapeOwnership';

  interface Props {
    states: TrackCollectState[];
    label: string;
  }

  let { states, label }: Props = $props();

  const segmentClass: Record<TrackCollectState, string> = {
    owned: 'bg-success',
    available: 'bg-accent/15 ring-1 ring-inset ring-accent/60',
    unminted: 'border border-dashed border-ink-3/70',
    unavailable: 'bg-surface-3',
    unknown: 'bar-hatch',
    checking: 'animate-pulse bg-surface-3 motion-reduce:animate-none',
    minting: 'animate-pulse bg-accent/70 motion-reduce:animate-none',
    buying: 'animate-pulse bg-accent/70 motion-reduce:animate-none',
  };

  // > 24 songs: collapse into runs (owned, in flight, available, unminted, unknown, unavailable).
  const ORDER: TrackCollectState[] = ['owned', 'minting', 'buying', 'available', 'checking', 'unknown', 'unminted', 'unavailable'];
  const runs = $derived(
    states.length > 24
      ? ORDER.map((state) => ({ state, count: states.filter((s) => s === state).length })).filter((r) => r.count > 0)
      : []
  );
</script>

<div role="img" aria-label={label} class="flex h-1.5 w-full gap-0.5">
  {#if states.length === 0}
    <span class="h-full flex-1 rounded-full bg-surface-3"></span>
  {:else if states.length <= 24}
    {#each states as state, index (index)}
      <span class={`h-full min-w-0 flex-1 rounded-full ${segmentClass[state]}`}></span>
    {/each}
  {:else}
    {#each runs as run (run.state)}
      <span class={`h-full min-w-1 rounded-full ${segmentClass[run.state]}`} style={`flex-grow:${run.count}`}></span>
    {/each}
  {/if}
</div>

<style>
  .bar-hatch {
    background-image: repeating-linear-gradient(
      135deg,
      rgb(252 211 77 / 0.55) 0 2px,
      rgb(252 211 77 / 0.15) 2px 4px
    );
  }
</style>
