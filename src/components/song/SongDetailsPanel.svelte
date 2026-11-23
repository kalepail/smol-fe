<script lang="ts">
  import Icon from '../ui/Icon.svelte';

  interface Props {
    id: string | null;
    description?: string | null;
    providerLabel: string;
    wasFallback?: boolean;
    isPrivate: boolean;
    plays?: number | null;
    nsfw?: { safe: boolean; categories: string[] } | null;
    playlistTag?: string | null;
    onCopyId: () => void;
    class?: string;
  }

  let {
    id,
    description = null,
    providerLabel,
    wasFallback = false,
    isPrivate,
    plays = null,
    nsfw = null,
    playlistTag = null,
    onCopyId,
    class: className = '',
  }: Props = $props();

  let descExpanded = $state(false);
  let descClamped = $state(false);
  let descEl = $state<HTMLParagraphElement | null>(null);

  $effect(() => {
    id;
    description;
    descExpanded = false;
  });

  $effect(() => {
    const el = descEl;
    if (!el || !description || descExpanded) return;

    const measure = () => {
      descClamped = el.scrollHeight > el.clientHeight + 2;
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const isUnsafe = $derived(nsfw?.safe === false);
  const showPlays = $derived(typeof plays === 'number' && plays > 0);
  const formattedPlays = $derived(showPlays ? plays!.toLocaleString() : null);
</script>

<aside
  aria-labelledby="song-details-heading"
  class={`space-y-4 rounded-[var(--radius-control)] bg-surface-1/75 p-4 ring-1 ring-inset ring-line ${className}`}
>
  <h2 id="song-details-heading" class="text-sm font-semibold text-ink-1">
    Details
  </h2>

  {#if description}
    <div class="space-y-1">
      <p
        bind:this={descEl}
        class={`text-sm leading-relaxed text-ink-2 ${descExpanded ? '' : 'line-clamp-3'}`}
      >
        {description}
      </p>
      {#if descClamped || descExpanded}
        <button
          type="button"
          onclick={() => (descExpanded = !descExpanded)}
          class="focus-ring -ml-1 inline-flex min-h-11 items-center rounded px-1 text-xs font-medium text-ink-1 hover:underline"
        >
          {descExpanded ? 'Show less' : 'More'}
        </button>
      {/if}
    </div>
  {/if}

  <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
    <div>
      <dt class="text-xs text-ink-3">Model</dt>
      <dd class="mt-0.5 text-ink-1">
        {providerLabel}
        {#if wasFallback}
          <span class="text-xs text-ink-3">(fallback)</span>
        {/if}
      </dd>
    </div>

    <div>
      <dt class="text-xs text-ink-3">Visibility</dt>
      <dd class="mt-0.5 text-ink-1">{isPrivate ? 'Private' : 'Public'}</dd>
    </div>

    {#if formattedPlays}
      <div>
        <dt class="text-xs text-ink-3">Plays</dt>
        <dd class="tabular mt-0.5 text-ink-1">{formattedPlays}</dd>
      </div>
    {/if}

    {#if nsfw}
      <div>
        <dt class="text-xs text-ink-3">Safety</dt>
        <dd class={`mt-0.5 ${isUnsafe ? 'font-medium text-danger' : 'text-ink-1'}`}>
          {isUnsafe ? 'Flagged' : 'Safe'}
        </dd>
      </div>
    {/if}

    {#if playlistTag}
      <div class="col-span-2">
        <dt class="text-xs text-ink-3">Playlist</dt>
        <dd class="mt-0.5">
          <a
            href={`/playlist/${encodeURIComponent(playlistTag)}`}
            class="focus-ring inline-block max-w-full truncate rounded text-ink-1 hover:underline"
          >
            {playlistTag}
          </a>
        </dd>
      </div>
    {/if}

    {#if id}
      <div class="col-span-2 border-t border-line pt-3">
        <dt class="text-xs text-ink-3">Song ID</dt>
        <dd class="mt-1 flex items-center justify-between gap-2">
          <code class="min-w-0 truncate font-mono text-xs text-ink-2">{id}</code>
          <button
            type="button"
            onclick={onCopyId}
            class="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-2.5 text-xs font-medium text-ink-2 hover:bg-white/10 hover:text-ink-1"
          >
            <Icon name="copy" size={14} />
            <span>Copy</span>
          </button>
        </dd>
      </div>
    {/if}
  </dl>
</aside>
