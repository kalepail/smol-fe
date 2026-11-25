<script lang="ts">
  import { confirmState, resolveConfirm } from '../../stores/confirm.svelte';
  import Sheet from './Sheet.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
</script>

<Sheet
  open={confirmState.open}
  title={confirmState.options?.title ?? 'Confirm'}
  maxWidth="sm"
  onClose={() => resolveConfirm(false)}
>
  <p class="text-sm leading-relaxed text-ink-2">
    {confirmState.options?.message ?? ''}
  </p>
  {#if confirmState.options?.note}
    <p class="mt-3 flex gap-2 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-ink-2 ring-1 ring-inset ring-line">
      <Icon name="info" size={18} class="mt-0.5 text-ink-2" />
      <span>{confirmState.options.note}</span>
    </p>
  {/if}

  {#snippet footer()}
    <div class="flex items-center justify-end gap-2">
      <Button variant="secondary" onclick={() => resolveConfirm(false)}>
        {confirmState.options?.cancelLabel ?? 'Cancel'}
      </Button>
      <Button
        variant={confirmState.options?.destructive ? 'danger' : 'primary'}
        onclick={() => resolveConfirm(true)}
      >
        {confirmState.options?.confirmLabel ?? 'Confirm'}
      </Button>
    </div>
  {/snippet}
</Sheet>
