<script lang="ts">
  import Button from './Button.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    kind: 'error' | 'empty';
    title: string;
    message?: string;
    icon?: IconName;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
    class?: string;
  }

  let {
    kind,
    title,
    message,
    icon,
    actionLabel,
    actionHref,
    onAction,
    class: className = '',
  }: Props = $props();

  const resolvedIcon = $derived<IconName>(icon ?? (kind === 'error' ? 'warning' : 'music'));
</script>

<div
  role={kind === 'error' ? 'alert' : undefined}
  class={`mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-control)] bg-surface-1 px-6 py-10 text-center ring-1 ring-inset ${
    kind === 'error' ? 'ring-danger/35' : 'ring-line'
  } ${className}`}
>
  <div
    class={`mb-3 flex size-11 items-center justify-center rounded-full ${
      kind === 'error' ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-ink-2'
    }`}
  >
    <Icon name={resolvedIcon} size={22} />
  </div>
  <h2 class="max-w-full text-base font-semibold text-ink-1 [overflow-wrap:anywhere]">{title}</h2>
  {#if message}
    <p class="mt-1.5 max-w-full text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{message}</p>
  {/if}
  {#if actionLabel && (onAction || actionHref)}
    <div class="mt-5">
      <Button
        variant="secondary"
        href={actionHref}
        onclick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  {/if}
</div>
