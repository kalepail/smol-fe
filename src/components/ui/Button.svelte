<script lang="ts">
  import type { Snippet } from 'svelte';
  import Loader from './Loader.svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'md' | 'sm';
    type?: 'button' | 'submit' | 'reset';
    href?: string;
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    class?: string;
    title?: string;
    onclick?: (event: MouseEvent) => void;
    children: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    href,
    disabled = false,
    loading = false,
    fullWidth = false,
    class: className = '',
    title,
    onclick,
    children,
  }: Props = $props();

  const variantClasses: Record<NonNullable<Props['variant']>, string> = {
    primary: 'bg-accent text-on-accent hover:bg-accent-press font-semibold',
    secondary: 'bg-surface-2 text-ink-1 ring-1 ring-inset ring-line-strong hover:bg-surface-3 font-medium',
    ghost: 'text-ink-2 hover:text-ink-1 hover:bg-white/8 font-medium',
    danger: 'bg-danger/15 text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger/25 font-medium',
  };

  const sizeClasses: Record<NonNullable<Props['size']>, string> = {
    md: 'min-h-11 px-4 text-sm gap-2 rounded-[var(--radius-control)]',
    sm: 'min-h-9 px-3 text-sm gap-1.5 rounded-[var(--radius-control)]',
  };

  const classes = $derived(
    `focus-ring inline-flex items-center justify-center whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`
  );
</script>

{#if href}
  <a {href} {title} class={classes} {onclick}>
    {@render children()}
  </a>
{:else}
  <button
    {type}
    {title}
    class={classes}
    disabled={disabled || loading}
    {onclick}
  >
    {#if loading}
      <Loader classNames="size-4" textColor={variant === 'primary' ? 'text-on-accent' : 'text-current'} />
    {/if}
    {@render children()}
  </button>
{/if}
