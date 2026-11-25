<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    variant?: 'ghost' | 'surface' | 'accent' | 'danger';
    size?: 'md' | 'lg';
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    pressed?: boolean;
    class?: string;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  }

  let {
    label,
    variant = 'ghost',
    size = 'md',
    href,
    type = 'button',
    disabled = false,
    pressed,
    class: className = '',
    onclick,
    children,
  }: Props = $props();

  const variantClasses: Record<NonNullable<Props['variant']>, string> = {
    ghost: 'text-ink-2 hover:text-ink-1 hover:bg-white/10',
    surface: 'bg-surface-2/90 text-ink-1 ring-1 ring-inset ring-line-strong hover:bg-surface-3',
    accent: 'bg-accent text-on-accent hover:bg-accent-press',
    danger: 'text-danger hover:bg-danger/15',
  };

  const sizeClasses: Record<NonNullable<Props['size']>, string> = {
    md: 'min-h-11 min-w-11',
    lg: 'h-14 w-14',
  };

  const classes = $derived(
    `focus-ring relative inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-45 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`
  );
</script>

{#if href}
  <a {href} aria-label={label} title={label} class={classes} {onclick}>
    {@render children()}
  </a>
{:else}
  <button
    {type}
    aria-label={label}
    aria-pressed={pressed}
    title={label}
    class={classes}
    {disabled}
    {onclick}
  >
    {@render children()}
  </button>
{/if}
