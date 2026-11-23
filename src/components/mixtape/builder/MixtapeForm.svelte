<script lang="ts">
  import type { MixtapeDraft } from '../../../types/domain';
  import Button from '../../ui/Button.svelte';

  interface Props {
    draft: MixtapeDraft;
    statusMessage: string | null;
    statusTone: 'info' | 'success' | 'error';
    showAuthAction?: boolean;
    onTitleChange: (title: string) => void;
    onDescriptionChange: (description: string) => void;
    onSignIn?: () => void;
  }

  let {
    draft,
    statusMessage,
    statusTone,
    showAuthAction = false,
    onTitleChange,
    onDescriptionChange,
    onSignIn,
  }: Props = $props();
</script>

<aside class="flex min-w-0 flex-col gap-3.5 rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line">
  <label class="flex min-w-0 flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-2">Title</span>
    <input
      class="input-ring min-h-11 min-w-0 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
      placeholder="Untitled mixtape"
      value={draft.title}
      oninput={(event) => onTitleChange(event.currentTarget.value)}
    />
  </label>

  <label class="flex min-w-0 flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-2">Description</span>
    <textarea
      class="input-ring min-h-[84px] min-w-0 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
      placeholder="Say something about the vibe or story."
      value={draft.description}
      oninput={(event) => onDescriptionChange(event.currentTarget.value)}
    ></textarea>
  </label>

  <p class="text-xs leading-relaxed text-ink-3">
    Autosaved on this device until you publish.
  </p>

  {#if statusMessage}
    <div
      role={statusTone === 'error' ? 'alert' : 'status'}
      class={`flex flex-col gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-sm ring-1 ring-inset ${
        statusTone === 'error'
          ? 'bg-danger/15 text-danger ring-danger/35'
          : statusTone === 'success'
            ? 'bg-success/15 text-success ring-success/35'
            : 'bg-surface-2 text-ink-1 ring-line'
      }`}
    >
      <p class="leading-relaxed">{statusMessage}</p>
      {#if showAuthAction && onSignIn}
        <div>
          <Button variant="secondary" size="sm" class="min-h-11" onclick={onSignIn}>
            Sign in again
          </Button>
        </div>
      {/if}
    </div>
  {/if}
</aside>
