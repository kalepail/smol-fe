<script lang="ts">
  import { player } from '../../stores/audio.svelte';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    trackKey: string;
    onToggle: () => void;
    label?: string;
  }

  let { trackKey, onToggle, label }: Props = $props();

  const current = $derived(player.track?.key === trackKey);
  const loading = $derived(current && (player.status === 'loading' || player.buffering));
  const playing = $derived(current && player.status === 'playing');
  const failed = $derived(current && player.status === 'error');
  const action = $derived(failed ? 'Retry' : playing || loading ? 'Pause' : 'Play');
  const progress = $derived(current && player.duration > 0 ? Math.min(1, player.currentTime / player.duration) : 0);
</script>

<button
  type="button"
  onclick={(event) => {
    event.stopPropagation();
    onToggle();
  }}
  class="relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 text-white hover:bg-white/10 disabled:opacity-50"
  aria-label={label ? `${action} ${label}` : action}
  disabled={!player.ready}
>
  {#if current && !failed && player.duration > 0}
    <svg aria-hidden="true" viewBox="0 0 40 40" class="pointer-events-none absolute size-10 -rotate-90">
      <circle cx="20" cy="20" r="18" pathLength="1" fill="none" stroke="currentColor"
        stroke-width="2" stroke-dasharray={`${progress} 1`} class="text-lime-400" />
    </svg>
  {/if}
  {#if failed}
    <span class="text-sm text-lime-300">Retry</span>
  {:else if loading}
    <Loader classNames="size-5" />
  {:else if playing}
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" class="size-4">
      <path d="M4.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-1ZM10.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-1Z" />
    </svg>
  {:else}
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" class="size-8">
      <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd" />
    </svg>
  {/if}
</button>
