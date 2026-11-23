<script lang="ts">
  import type { MixtapeDraft } from '../../../types/domain';
  import Button from '../../ui/Button.svelte';

  interface Props {
    draft: MixtapeDraft;
    publishing: boolean;
    statusMessage: string | null;
    statusTone: 'info' | 'success' | 'error';
    onTitleChange: (title: string) => void;
    onDescriptionChange: (description: string) => void;
    onDiscard: () => void;
    onSaveDraft: () => void;
    onPublish: () => void;
  }

  let {
    draft,
    publishing,
    statusMessage,
    statusTone,
    onTitleChange,
    onDescriptionChange,
    onDiscard,
    onSaveDraft,
    onPublish,
  }: Props = $props();
</script>

<aside class="flex min-w-0 flex-col gap-4 rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line">
  <label class="flex min-w-0 flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-2">Title</span>
    <input
      class="input-ring min-h-11 min-w-0 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
      placeholder="Give your mixtape a name"
      value={draft.title}
      oninput={(event) => onTitleChange(event.currentTarget.value)}
    />
  </label>

  <label class="flex min-w-0 flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-2">Description</span>
    <textarea
      class="input-ring min-h-[96px] min-w-0 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
      placeholder="Say something about the vibe or story."
      value={draft.description}
      oninput={(event) => onDescriptionChange(event.currentTarget.value)}
    ></textarea>
  </label>

  <p class="text-xs leading-relaxed text-ink-3">
    Drafts save locally in your browser until you publish.
  </p>

  {#if statusMessage}
    <p
      role={statusTone === 'error' ? 'alert' : 'status'}
      class={`rounded-[var(--radius-control)] px-3 py-2 text-sm ring-1 ring-inset ${
        statusTone === 'error'
          ? 'bg-danger/15 text-danger ring-danger/35'
          : statusTone === 'success'
            ? 'bg-success/15 text-success ring-success/35'
            : 'bg-surface-2 text-ink-1 ring-line'
      }`}
    >
      {statusMessage}
    </p>
  {/if}

  <div class="mt-auto flex flex-col gap-2 pt-2">
    <Button
      variant="primary"
      fullWidth
      loading={publishing}
      disabled={draft.tracks.length === 0 || publishing}
      onclick={onPublish}
    >
      {publishing ? 'Publishing…' : 'Publish mixtape'}
    </Button>

    <div class="grid grid-cols-2 gap-2">
      <Button variant="secondary" fullWidth onclick={onSaveDraft}>
        Save draft
      </Button>
      <Button variant="ghost" fullWidth onclick={onDiscard}>
        Discard
      </Button>
    </div>
  </div>
</aside>
