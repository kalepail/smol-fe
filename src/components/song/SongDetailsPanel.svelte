<script lang="ts">
  import Icon from '../ui/Icon.svelte';

  interface Props {
    id: string | null;
    description?: string | null;
    providerLabel: string;
    wasFallback?: boolean;
    isPrivate: boolean;
    plays?: number | null;
    nsfw?: { safe: boolean; categories: string[]; unknown?: boolean } | null;
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

  let mobileOpen = $state(false);
  let descExpanded = $state(false);
  let descClamped = $state(false);
  let descEl = $state<HTMLParagraphElement | null>(null);

  $effect(() => {
    id;
    description;
    mobileOpen = false;
    descExpanded = false;
  });

  $effect(() => {
    const el = descEl;
    if (!el || !description || descExpanded) return;

    const measure = () => {
      if (el.clientHeight === 0) return;
      descClamped = el.scrollHeight > el.clientHeight + 2;
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const isSafetyUnknown = $derived(Boolean(nsfw?.unknown));
  const isUnsafe = $derived(Boolean(nsfw && nsfw.safe === false && !nsfw.unknown));
  const showPlays = $derived(typeof plays === 'number' && plays > 0);
  const formattedPlays = $derived(showPlays ? plays!.toLocaleString() : null);

  const summaryParts = $derived.by(() => {
    const parts = [providerLabel, isPrivate ? 'Private' : 'Public'];
    if (formattedPlays) parts.push(`${formattedPlays} ${plays === 1 ? 'play' : 'plays'}`);
    if (isUnsafe) parts.push('Flagged');
    else if (isSafetyUnknown) parts.push('Unverified');
    return parts.join(' · ');
  });
</script>

<aside
  aria-labelledby="song-details-heading"
  class={`rounded-[var(--radius-control)] bg-surface-1/75 ring-1 ring-inset ring-line ${className}`}
>
  <!-- Mobile (< lg): compact 44px disclosure keeps "More like this" prominent; Desktop (lg+): always expanded -->
  <div class="flex items-center justify-between gap-2 px-4 py-1 lg:px-4 lg:pt-4 lg:pb-0">
    <h2 id="song-details-heading" class="hidden text-sm font-semibold text-ink-1 lg:block">
      Details
    </h2>

    <button
      type="button"
      aria-expanded={mobileOpen}
      aria-controls="song-details-body"
      onclick={() => (mobileOpen = !mobileOpen)}
      class="focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded text-left lg:hidden"
    >
      <span class="flex min-w-0 items-baseline gap-2">
        <span class="shrink-0 text-sm font-semibold text-ink-1">Details</span>
        <span class="tabular truncate text-xs text-ink-2">{summaryParts}</span>
      </span>
      <Icon
        name="chevron-down"
        size={18}
        class={`shrink-0 text-ink-3 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
      />
    </button>
  </div>

  <div
    id="song-details-body"
    class={`${mobileOpen ? 'block border-t border-line pt-3.5' : 'hidden'} space-y-4 px-4 pb-4 lg:block lg:border-0 lg:pt-3.5`}
  >
    {#if description}
      <div class="space-y-1">
        <p
          bind:this={descEl}
          class={`[overflow-wrap:anywhere] text-sm leading-relaxed text-ink-2 ${descExpanded ? '' : 'line-clamp-3'}`}
        >
          {description}
        </p>
        {#if descClamped || descExpanded}
          <button
            type="button"
            aria-expanded={descExpanded}
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
          <dd
            class={`mt-0.5 ${
              isUnsafe
                ? 'font-medium text-danger'
                : isSafetyUnknown
                  ? 'font-medium text-warning'
                  : 'text-ink-1'
            }`}
          >
            {isUnsafe ? 'Flagged' : isSafetyUnknown ? 'Unverified' : 'Safe'}
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
  </div>
</aside>
