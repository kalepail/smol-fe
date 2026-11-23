<script lang="ts">
  import type {
    CardAction,
    CardCopy,
    CollectSummary,
    PageState,
    TrackCollectState,
  } from '../../utils/mixtapeOwnership';
  import MixtapeOwnershipBar from './MixtapeOwnershipBar.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    card: CardCopy;
    page: PageState;
    summary: CollectSummary;
    states: TrackCollectState[];
    onAction: (action: CardAction) => void;
    onExplain: () => void;
  }

  let { card, page, summary, states, onAction, onExplain }: Props = $props();

  const busy = $derived(page.state === 'S6');
  const barLabel = $derived.by(() => {
    if (page.phase === 'S0') {
      const minted = summary.collectible - summary.unminted;
      return `${minted} of ${summary.total} songs minted. ${summary.unminted} not minted.`;
    }
    const parts = [`You own ${summary.owned} of ${summary.total}.`];
    if (summary.available) parts.push(`${summary.available} ready to buy.`);
    if (summary.unminted) parts.push(`${summary.unminted} not minted.`);
    if (summary.unknown) parts.push(`${summary.unknown} couldn't be checked.`);
    return parts.join(' ');
  });

  const titleTone = {
    default: 'text-ink-1',
    success: 'text-success',
    warning: 'text-ink-1',
    paused: 'text-ink-1',
  } as const;
</script>

<!--
  Fixed slot layout (C-17): title · bar · subline (2 lines reserved) · CTA (48px)
  · footer (44px: secondary action, note, or skeleton). Every state fills the
  same slots, so S6 → S1–S5/S8/S9 never moves the card height or the CTA.
-->
<section
  aria-labelledby="collect-title"
  aria-busy={busy}
  data-collect-state={page.state}
  class="flex w-full flex-col gap-3 rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line"
>
  <!-- Two heading lines reserved below 360px, where long titles wrap (C-17). -->
  <div class="flex min-h-10 items-start justify-between gap-2 min-[360px]:min-h-6">
    <h2
      id="collect-title"
      aria-live="polite"
      class={`flex min-w-0 items-center gap-1.5 text-sm font-semibold ${titleTone[card.tone]}`}
    >
      {#if card.tone === 'success'}
        <Icon name="check" size={16} class="shrink-0" />
      {:else if card.tone === 'warning'}
        <Icon name="warning" size={16} class="shrink-0 text-warning" />
      {:else if card.tone === 'paused'}
        <Icon name="pause" size={16} class="shrink-0 text-warning" />
      {/if}
      <span class="min-w-0">{card.title}</span>
    </h2>
    {#if card.showExplainer}
      <button
        type="button"
        onclick={onExplain}
        aria-label="How collecting works"
        class="focus-ring relative -my-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-white/8 hover:text-ink-1 before:absolute before:-inset-1.5 before:content-['']"
      >
        <Icon name="info" size={16} />
      </button>
    {/if}
  </div>

  {#if busy}
    <div class="h-1.5 w-full animate-pulse rounded-full bg-surface-3 motion-reduce:animate-none" aria-hidden="true"></div>
  {:else}
    <MixtapeOwnershipBar {states} label={barLabel} />
  {/if}

  <p class={`min-h-[39px] text-xs leading-relaxed ${page.overlay === 'S8' ? 'text-warning' : 'text-ink-2'}`}>
    {card.subline}
  </p>

  <div class="mt-auto flex flex-col gap-1.5">
    <div class="flex h-12 items-center" data-collect-cta>
      {#if card.primary.kind === 'owned'}
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-sm font-medium text-success ring-1 ring-inset ring-success/30">
            <Icon name="check" size={14} />
            {card.primary.label}
          </span>
          {#if card.secondary}
            <button
              type="button"
              onclick={() => onAction(card.secondary!.action)}
              class="focus-ring inline-flex min-h-11 items-center gap-0.5 rounded px-1 text-sm font-medium text-ink-1 hover:underline"
            >
              {card.secondary.label}
              <Icon name="chevron-right" size={16} />
            </button>
          {/if}
        </div>
      {:else if card.primary.kind === 'skeleton'}
        <Button variant="secondary" fullWidth disabled class="h-12 animate-pulse motion-reduce:animate-none">
          {card.primary.label}
        </Button>
      {:else}
        <Button
          variant={card.primary.kind === 'primary' ? 'primary' : 'secondary'}
          fullWidth
          disabled={card.primary.action === 'none'}
          onclick={() => onAction(card.primary.action)}
          class="h-12"
        >
          {#if card.primary.action === 'retryCheck'}
            <Icon name="refresh" size={16} />
          {/if}
          <span class="tabular truncate">{card.primary.label}</span>
          {#if card.primary.action === 'openSheet' || card.primary.action === 'getKale'}
            <Icon name="chevron-right" size={16} />
          {/if}
        </Button>
      {/if}
    </div>

    <div class="flex min-h-11 items-center justify-center">
      {#if card.primary.kind === 'owned'}
        <!-- secondary rendered inline with the Owned pill -->
      {:else if card.primary.kind === 'skeleton'}
        <div class="flex w-full flex-col items-center gap-2" aria-hidden="true">
          <span class="h-2.5 w-3/4 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none"></span>
          <span class="h-2.5 w-1/3 animate-pulse rounded-full bg-surface-2 motion-reduce:animate-none"></span>
        </div>
      {:else if card.secondary}
        <button
          type="button"
          onclick={() => onAction(card.secondary!.action)}
          class="focus-ring inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-ink-1 underline-offset-4 hover:underline"
        >
          {card.secondary.label}
        </button>
      {:else if card.note}
        <p class="text-center text-xs leading-relaxed text-ink-3">{card.note}</p>
      {/if}
    </div>
  </div>
</section>
