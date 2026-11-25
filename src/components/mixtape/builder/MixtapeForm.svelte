<script lang="ts">
  import type { MixtapeDraft } from '../../../types/domain';
  import Button from '../../ui/Button.svelte';
  import Icon from '../../ui/Icon.svelte';

  interface Props {
    draft: MixtapeDraft;
    mode?: 'create' | 'edit';
    titleError?: string | null;
    sameTitleHint?: string | null;
    onDelete?: () => void;
    statusAction?: { label: string; onClick?: () => void; href?: string; disabled?: boolean } | null;
    statusMessage: string | null;
    statusTone: 'info' | 'success' | 'error';
    showAuthAction?: boolean;
    onTitleChange: (title: string) => void;
    onDescriptionChange: (description: string) => void;
    onSignIn?: () => void;
  }

  let {
    draft,
    mode = 'create',
    titleError = null,
    sameTitleHint = null,
    onDelete,
    statusAction = null,
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
      class={`input-ring min-h-11 min-w-0 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2 text-base text-ink-1 ring-1 ring-inset placeholder:text-ink-3 ${titleError ? 'ring-danger/60' : 'ring-line-strong'}`}
      placeholder="Untitled mixtape"
      value={draft.title}
      maxlength={120}
      data-mixtape-title-input
      data-mixtape-builder-title
      aria-invalid={titleError ? 'true' : undefined}
      aria-describedby={titleError ? 'mixtape-title-error' : sameTitleHint ? 'mixtape-title-hint' : undefined}
      oninput={(event) => onTitleChange(event.currentTarget.value)}
    />
    {#if titleError}
      <span id="mixtape-title-error" class="text-xs text-danger">{titleError}</span>
    {:else if sameTitleHint}
      <span id="mixtape-title-hint" class="text-xs leading-relaxed text-ink-3">{sameTitleHint}</span>
    {/if}
  </label>

  <label class="flex min-w-0 flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-2">Description <span class="font-normal text-ink-3">(optional)</span></span>
    <textarea
      class="input-ring min-h-[84px] min-w-0 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
      placeholder="Say something about the vibe or story."
      maxlength={1000}
      value={draft.description}
      oninput={(event) => onDescriptionChange(event.currentTarget.value)}
    ></textarea>
  </label>

  <p class="text-xs leading-relaxed text-ink-3">
    {mode === 'edit'
      ? 'Your changes are kept on this device until you save.'
      : 'Autosaved on this device until you publish.'}
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
      {#if statusAction}
        <div>
          <Button
            variant="secondary"
            size="sm"
            class="min-h-11"
            href={statusAction.href}
            disabled={statusAction.disabled}
            onclick={statusAction.onClick}
          >
            {statusAction.label}
          </Button>
        </div>
      {/if}
      {#if showAuthAction && onSignIn}
        <div>
          <Button variant="secondary" size="sm" class="min-h-11" onclick={onSignIn}>
            Sign in again
          </Button>
        </div>
      {/if}
    </div>
  {/if}

  {#if mode === 'edit' && onDelete}
    <div class="border-t border-line pt-3">
      <button
        type="button"
        onclick={onDelete}
        class="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm font-medium text-danger hover:bg-danger/10"
      >
        <Icon name="trash" size={16} />
        <span>Delete mixtape</span>
      </button>
      <p class="px-2 text-xs leading-relaxed text-ink-3">Removes this playlist only. Your songs stay where they are.</p>
    </div>
  {/if}
</aside>
