<script lang="ts">
  import { describeTrackPill, type TrackCollectState } from '../../utils/mixtapeOwnership';
  import Icon from '../ui/Icon.svelte';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    state: TrackCollectState;
    balance?: bigint;
    signedIn: boolean;
  }

  let { state, balance, signedIn }: Props = $props();

  const pill = $derived(describeTrackPill(state, { balance, signedIn }));

  const toneClasses = {
    success: 'bg-success/15 text-success ring-1 ring-inset ring-success/30',
    neutral: 'bg-surface-2 text-ink-2 ring-1 ring-inset ring-line',
    accent: 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/30',
    warning: 'bg-warning/15 text-warning ring-1 ring-inset ring-warning/30',
    muted: 'bg-surface-2 text-ink-3 ring-1 ring-inset ring-line',
  } as const;
</script>

{#if pill.icon === 'shimmer'}
  <span
    role="status"
    aria-label="Checking"
    class="inline-block h-5 w-16 animate-pulse rounded-full bg-surface-3 motion-reduce:animate-none"
  ></span>
{:else}
  <span
    class={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none ${
      pill.dashed ? 'border border-dashed border-line-strong bg-transparent text-ink-2' : toneClasses[pill.tone]
    }`}
  >
    {#if pill.icon === 'check'}
      <Icon name="check" size={12} />
    {:else if pill.icon === 'spinner'}
      <Loader classNames="size-3" />
    {:else if pill.icon === 'diamond'}
      <Icon name="diamond" size={10} />
    {:else if pill.icon === 'ring'}
      <span class="size-2 rounded-full ring-1 ring-current" aria-hidden="true"></span>
    {:else if pill.icon === 'question'}
      <Icon name="question" size={12} />
    {/if}
    <span>{pill.label}</span>
    {#if pill.suffix && state === 'owned'}
      <span class="hidden tabular min-[360px]:inline" aria-hidden="true">· {pill.suffix}</span>
    {:else if pill.suffix && state === 'unminted'}
      <span class="hidden tabular sm:inline">· {pill.suffix}</span>
    {/if}
  </span>
{/if}
