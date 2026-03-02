<script lang="ts">
  import type { MixtapeDraft } from "../../../types/domain";

  interface Props {
    draft: MixtapeDraft;
    publishing: boolean;
    isEditing?: boolean;
    statusMessage: string | null;
    statusTone: "info" | "success" | "error";
    onTitleChange: (title: string) => void;
    onDescriptionChange: (description: string) => void;
    onDiscard: () => void;
    onSaveDraft: () => void;
    onPublish: () => void;
  }

  let {
    draft,
    publishing,
    isEditing = false,
    statusMessage,
    statusTone,
    onTitleChange,
    onDescriptionChange,
    onDiscard,
    onSaveDraft,
    onPublish,
  }: Props = $props();
</script>

<aside
  class="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/60 p-4"
>
  <label class="flex flex-col gap-2">
    <span class="text-sm font-medium text-slate-200">Title</span>
    <input
      class="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-lime-400 focus:outline-none"
      placeholder="Give your mixtape a name"
      value={draft.title}
      oninput={(event) => onTitleChange(event.currentTarget.value)}
    />
  </label>

  <label class="flex flex-col gap-2">
    <span class="text-sm font-medium text-slate-200">Description</span>
    <textarea
      class="min-h-[96px] w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-lime-400 focus:outline-none"
      placeholder="Say something about the vibe, inspiration, or story."
      value={draft.description}
      oninput={(event) => onDescriptionChange(event.currentTarget.value)}
    ></textarea>
  </label>

  <div class="flex flex-col gap-2">
    <span class="text-sm font-semibold text-slate-200">Draft status</span>
    <p class="text-xs text-slate-400">
      Drafts are saved locally. Publish to mint a shareable mixtape when the
      backend is ready.
    </p>
    {#if statusMessage}
      <div
        class={`rounded px-3 py-2 text-sm ${
          statusTone === "error"
            ? "bg-red-900/60 text-red-200"
            : statusTone === "success"
              ? "bg-lime-900/50 text-lime-200"
              : "bg-slate-800 text-slate-200"
        }`}
      >
        {statusMessage}
      </div>
    {/if}
  </div>

  <div class="mt-auto flex flex-col gap-2">
    <button
      class="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
      onclick={onDiscard}>Discard Draft</button
    >

    <button
      class="rounded border border-lime-400/60 px-3 py-2 text-sm text-lime-200 hover:bg-lime-500/10"
      onclick={onSaveDraft}>Save Draft & Exit</button
    >

    <button
      class="rounded bg-lime-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-300 disabled:opacity-60"
      onclick={onPublish}
      disabled={draft.tracks.length === 0 || publishing}
    >
      {#if isEditing}
        {publishing ? "Saving…" : "Save Changes"}
      {:else}
        {publishing ? "Publishing…" : "Publish Mixtape"}
      {/if}
    </button>
  </div>
</aside>
