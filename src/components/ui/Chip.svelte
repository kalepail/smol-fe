<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
    removable?: boolean;
    removeLabel?: string;
    onRemove?: () => void;
    onclick?: () => void;
    selected?: boolean;
    class?: string;
    children: Snippet;
  }

  let {
    tone = 'neutral',
    removable = false,
    removeLabel = 'Remove',
    onRemove,
    onclick,
    selected = false,
    class: className = '',
    children,
  }: Props = $props();

  const toneClasses: Record<NonNullable<Props['tone']>, string> = {
    neutral: 'bg-surface-2 text-ink-2 ring-1 ring-inset ring-line',
    accent: 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/30',
    success: 'bg-success/15 text-success ring-1 ring-inset ring-success/30',
    warning: 'bg-warning/15 text-warning ring-1 ring-inset ring-warning/30',
    danger: 'bg-danger/15 text-danger ring-1 ring-inset ring-danger/30',
  };
</script>

{#if onclick}
  <button
    type="button"
    {onclick}
    aria-pressed={selected}
    class={`focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap ${
      selected
        ? 'bg-ink-1 text-canvas'
        : 'bg-surface-2 text-ink-2 ring-1 ring-inset ring-line hover:text-ink-1 hover:bg-surface-3'
    } ${className}`}
  >
    {@render children()}
  </button>
{:else}
  <span
    class={`inline-flex items-center gap-1 rounded-full text-xs font-medium ${
      removable ? 'pl-3 pr-1 py-0.5' : 'px-2.5 py-1'
    } ${toneClasses[tone]} ${className}`}
  >
    <span>{@render children()}</span>
    {#if removable && onRemove}
      <button
        type="button"
        onclick={onRemove}
        aria-label={removeLabel}
        class="focus-ring relative inline-flex size-7 items-center justify-center rounded-full hover:bg-white/10 before:content-[''] before:absolute before:-inset-2"
      >
        <Icon name="x" size={14} />
      </button>
    {/if}
  </span>
{/if}
