<script lang="ts">
  import { dismissToast, toastState } from '../../stores/toast.svelte';
  import Icon from './Icon.svelte';

  const toneBorder = {
    info: 'ring-line-strong',
    success: 'ring-success/40',
    error: 'ring-danger/50',
  } as const;

  const toneIcon = {
    info: 'info',
    success: 'check',
    error: 'warning',
  } as const;

  const toneIconColor = {
    info: 'text-ink-2',
    success: 'text-success',
    error: 'text-danger',
  } as const;
</script>

{#if toastState.items.length > 0}
  <div
    class="toast-stack pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
    aria-live="polite"
    aria-atomic="false"
  >
    {#each toastState.items as item (item.id)}
      <div
        role="status"
        class={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[var(--radius-control)] bg-surface-2/95 px-3.5 py-2.5 text-sm text-ink-1 ring-1 backdrop-blur-lg ${toneBorder[item.tone]}`}
      >
        <Icon name={toneIcon[item.tone]} size={18} class={toneIconColor[item.tone]} />
        <span class="min-w-0 flex-1 leading-snug">{item.message}</span>
        {#if item.actionLabel && item.onAction}
          <button
            type="button"
            class="focus-ring shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15"
            onclick={() => {
              item.onAction?.();
              dismissToast(item.id);
            }}
          >
            {item.actionLabel}
          </button>
        {/if}
        <button
          type="button"
          class="focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-white/10 hover:text-ink-1"
          aria-label="Dismiss notification"
          onclick={() => dismissToast(item.id)}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    {/each}
  </div>
{/if}
