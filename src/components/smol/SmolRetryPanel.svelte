<script lang="ts">
  import type { SmolDetailResponse } from '../../types/domain';

  interface Props {
    isPolling: boolean;
    failure?: NonNullable<SmolDetailResponse['kv_do']>['failure'];
    playlist: string | null;
    onRetry: () => void;
    onRemovePlaylist: () => void;
  }

  let {
    isPolling,
    failure,
    playlist,
    onRetry,
    onRemovePlaylist,
  }: Props = $props();
</script>

<div class="px-2 py-10">
  <div class="flex flex-col items-center max-w-[1024px] mx-auto">
    <ul class="max-w-[512px] w-full [&>li]:mb-5">
      {#if failure}
        <li class="rounded border border-amber-400 bg-amber-400/10 p-3 text-amber-100">
          <h1 class="font-bold text-amber-300">{failure.title}</h1>
          <p class="mt-1 text-sm">{failure.message}</p>
        </li>
      {/if}

      <li>
        <div class="flex items-center gap-2">
          <button
            class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
            onclick={onRetry}
            disabled={isPolling}
          >
            ⚡︎ Retry
          </button>
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
        </div>
      </li>
    </ul>
  </div>
</div>
