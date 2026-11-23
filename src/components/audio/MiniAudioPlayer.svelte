<script lang="ts">
  import { player } from '../../stores/audio.svelte';
  import Loader from '../ui/Loader.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    trackKey: string;
    onToggle: () => void;
    label?: string;
    variant?: 'overlay' | 'inline';
  }

  let { trackKey, onToggle, label, variant = 'inline' }: Props = $props();

  const current = $derived(player.track?.key === trackKey);
  const loading = $derived(current && (player.status === 'loading' || player.buffering));
  const playing = $derived(current && player.status === 'playing');
  const failed = $derived(current && player.status === 'error');
  const action = $derived(failed ? 'Retry' : playing || loading ? 'Pause' : 'Play');
</script>

<button
  type="button"
  onclick={(event) => {
    event.stopPropagation();
    onToggle();
  }}
  class={`focus-ring relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${
    variant === 'overlay'
      ? current
        ? 'bg-accent text-on-accent hover:bg-accent-press'
        : 'bg-surface-2/85 text-ink-1 ring-1 ring-inset ring-white/15 backdrop-blur-md hover:bg-surface-2'
      : current
        ? 'bg-accent/15 text-accent hover:bg-accent/25'
        : 'text-ink-1 hover:bg-white/10'
  }`}
  aria-label={label ? `${action} ${label}` : action}
  disabled={!player.ready}
>
  {#if failed}
    <Icon name="refresh" size={18} />
  {:else if loading}
    <Loader classNames="size-5" />
  {:else if playing}
    <Icon name="pause" size={18} />
  {:else}
    <Icon name="play" size={18} class="translate-x-0.5" />
  {/if}
</button>
