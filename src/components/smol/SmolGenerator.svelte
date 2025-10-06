<script lang="ts">
  interface Props {
    prompt: string;
    isPublic: boolean;
    isInstrumental: boolean;
    playlist: string | null;
    isGenerating: boolean;
    maxLength: number;
    onPromptChange: (value: string) => void;
    onPublicChange: (value: boolean) => void;
    onInstrumentalChange: (value: boolean) => void;
    onSubmit: () => void;
    onRemovePlaylist: () => void;
  }

  let {
    prompt = $bindable(),
    isPublic = $bindable(),
    isInstrumental = $bindable(),
    playlist,
    isGenerating,
    maxLength,
    onPromptChange,
    onPublicChange,
    onInstrumentalChange,
    onSubmit,
    onRemovePlaylist,
  }: Props = $props();
</script>

<div class="px-2 py-10 bg-slate-900">
  <div class="flex flex-col items-center max-w-[1024px] mx-auto">
    <form
      class="flex flex-col items-start max-w-[512px] w-full"
      onsubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        class="p-2 mb-3 w-full bg-slate-800 text-white outline-3 outline-offset-3 outline-slate-800 rounded focus:outline-slate-700"
        placeholder="Write an epic prompt for an even epic'er gen"
        rows="4"
        bind:value={prompt}
        oninput={(e) => {
          const target = e.currentTarget as HTMLTextAreaElement;
          onPromptChange(target.value);
        }}
      ></textarea>
      <small class="text-xs text-slate-400 self-end mb-2">
        {prompt.length} / {maxLength}
      </small>

      <div class="flex w-full mb-5">
        <div>
          <label class="flex items-center" for="public">
            <span class="text-xs mr-2">Public</span>
            <input
              type="checkbox"
              name="public"
              id="public"
              bind:checked={isPublic}
              onchange={(e) => {
                const target = e.currentTarget as HTMLInputElement;
                onPublicChange(target.checked);
              }}
            />
          </label>

          <label class="flex items-center" for="instrumental">
            <span class="text-xs mr-2">Instrumental</span>
            <input
              type="checkbox"
              name="instrumental"
              id="instrumental"
              bind:checked={isInstrumental}
              onchange={(e) => {
                const target = e.currentTarget as HTMLInputElement;
                onInstrumentalChange(target.checked);
              }}
            />
          </label>
        </div>

        <div class="flex items-center gap-2 ml-auto">
          {#if playlist}
            <span
              class="flex items-center text-xs font-mono bg-lime-500 text-black px-2 py-1 rounded-full"
            >
              {playlist}
              <button
                type="button"
                onclick={onRemovePlaylist}
                class="ml-1.5 -mr-0.5 p-0.5 rounded-full hover:bg-black/20 text-black"
                aria-label="Remove playlist"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  class="size-3"
                >
                  <path
                    d="M2.22 2.22a.75.75 0 0 1 1.06 0L8 6.94l4.72-4.72a.75.75 0 0 1 1.06 1.06L9.06 8l4.72 4.72a.75.75 0 1 1-1.06 1.06L8 9.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L6.94 8 2.22 3.28a.75.75 0 0 1 0-1.06Z"
                  />
                </svg>
              </button>
            </span>
          {/if}
          <button
            type="submit"
            class="flex items-center text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
            disabled={isGenerating || !prompt}
          >
            ⚡︎ Generate
          </button>
        </div>
      </div>

      <aside class="text-xs self-start">
        * Will take roughly 6 minutes to fully generate.
        <br /> &nbsp;&nbsp; Even longer during times of heavy load.
      </aside>
    </form>
  </div>
</div>
