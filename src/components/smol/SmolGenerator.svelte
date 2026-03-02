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
      <div class="relative w-full mb-3">
        <textarea
          class="p-2 w-full bg-slate-800 text-white border-2 border-slate-700 rounded-none focus:border-lime-500 outline-none font-pixel tracking-widest text-xs leading-relaxed pr-8"
          placeholder={`Write an epic prompt\nfor an even epic'er gen!`}
          rows="4"
          bind:value={prompt}
          oninput={(e) => {
            const target = e.currentTarget as HTMLTextAreaElement;
            onPromptChange(target.value);
          }}
        ></textarea>
        <!-- Tappable Paste Button -->
        <button
          type="button"
          onclick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text) onPromptChange(text);
            } catch (e) {
              console.error("Paste failed", e);
            }
          }}
          class="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 border border-transparent hover:border-slate-500 rounded transition-all active:scale-95"
          title="Paste from Clipboard"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="w-3.5 h-3.5"
          >
            <path
              fill-rule="evenodd"
              d="M11.986 3H12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h.014A2.25 2.25 0 0 1 7.5 1h1a2.25 2.25 0 0 1 3.486 2ZM12 4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h.75a.75.75 0 0 0 .75-.75V2.25h4v1a.75.75 0 0 0 .75.75H12Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
      <small
        class="text-[10px] font-pixel text-slate-400 self-end mb-2 tracking-wider"
      >
        {prompt.length} / {maxLength}
      </small>

      <div class="flex w-full mb-5">
        <div>
          <label
            class="flex items-center cursor-pointer hover:text-lime-400 transition-colors gap-2"
            for="public"
          >
            <span
              class="text-xs font-pixel tracking-wider {isPublic
                ? 'text-lime-500'
                : 'text-slate-300'}">Public</span
            >
            <input
              type="checkbox"
              class="hidden"
              name="public"
              id="public"
              bind:checked={isPublic}
              onchange={(e) => {
                const target = e.currentTarget as HTMLInputElement;
                onPublicChange(target.checked);
              }}
            />
            <div
              class="w-3 h-3 flex items-center justify-center relative -top-[2.5px]"
            >
              {#if isPublic}
                <svg
                  class="w-3 h-3 text-lime-500"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                >
                  <rect x="0" y="5" width="3" height="3" />
                  <rect x="2" y="7" width="3" height="3" />
                  <rect x="4" y="5" width="3" height="3" />
                  <rect x="6" y="3" width="3" height="3" />
                  <rect x="8" y="1" width="3" height="3" />
                </svg>
              {:else}
                <div class="w-1 h-1 bg-slate-600"></div>
              {/if}
            </div>
          </label>

          <label
            class="flex items-center cursor-pointer hover:text-lime-400 transition-colors gap-2"
            for="instrumental"
          >
            <span
              class="text-xs font-pixel tracking-wider {isInstrumental
                ? 'text-lime-500'
                : 'text-slate-300'}">Instrumental</span
            >
            <input
              type="checkbox"
              class="hidden"
              name="instrumental"
              id="instrumental"
              bind:checked={isInstrumental}
              onchange={(e) => {
                const target = e.currentTarget as HTMLInputElement;
                onInstrumentalChange(target.checked);
              }}
            />
            <div
              class="w-3 h-3 flex items-center justify-center relative -top-[2.5px]"
            >
              {#if isInstrumental}
                <svg
                  class="w-3 h-3 text-lime-500"
                  viewBox="0 0 10 10"
                  fill="currentColor"
                >
                  <rect x="0" y="5" width="3" height="3" />
                  <rect x="2" y="7" width="3" height="3" />
                  <rect x="4" y="5" width="3" height="3" />
                  <rect x="6" y="3" width="3" height="3" />
                  <rect x="8" y="1" width="3" height="3" />
                </svg>
              {:else}
                <div class="w-1 h-1 bg-slate-600"></div>
              {/if}
            </div>
          </label>
        </div>

        <div class="flex items-center gap-2 ml-auto">
          {#if playlist}
            <span
              class="flex items-center text-[10px] font-pixel tracking-wider bg-lime-500 text-black px-2 py-1 rounded-none border border-lime-400"
            >
              {playlist}
              <button
                type="button"
                onclick={onRemovePlaylist}
                class="ml-1.5 -mr-0.5 p-0.5 hover:bg-black/20 text-black rounded-none"
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
            class="flex items-center gap-2 text-lime-500 bg-lime-500/20 border-2 border-lime-500 hover:bg-lime-500/30 rounded-none px-3 py-1.5 disabled:opacity-50 font-pixel tracking-wider text-[10px]"
            disabled={isGenerating || !prompt}
          >
            <svg
              class="w-3.5 h-3.5 flex-shrink-0"
              viewBox="0 0 12 12"
              fill="currentColor"
            >
              <!-- Sharper Jagged Pixel Bolt -->
              <rect x="6" y="0" width="4" height="2" />
              <rect x="4" y="2" width="4" height="2" />
              <rect x="1" y="4" width="10" height="3" />
              <rect x="5" y="7" width="4" height="2" />
              <rect x="3" y="9" width="4" height="3" />
            </svg>
            Generate
          </button>
        </div>
      </div>

      <aside
        class="text-[10px] font-pixel tracking-wider self-start text-slate-400 mt-2 leading-relaxed opacity-80 max-w-[450px] text-justify"
      >
        * Will take roughly 6 minutes to fully generate. Even longer during
        times of heavy load.
      </aside>
    </form>
  </div>
</div>
