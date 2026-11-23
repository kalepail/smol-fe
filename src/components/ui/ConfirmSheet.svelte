<script lang="ts">
  import { confirmState, resolveConfirm } from '../../stores/confirm.svelte';
  import Sheet from './Sheet.svelte';
  import Button from './Button.svelte';
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
