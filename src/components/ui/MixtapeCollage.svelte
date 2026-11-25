<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    coverUrls: (string | null)[];
    alt?: string;
    class?: string;
  }

  let { coverUrls, alt = '', class: className = '' }: Props = $props();

  const validUrls = $derived(
    coverUrls.filter((url): url is string => Boolean(url)).map((url) =>
      url.includes('?') ? url : `${url}?scale=4`
    )
  );

  // Repeat covers cleanly when fewer than 4 tracks exist; never show grey "SMOL" boxes.
  const tiles = $derived.by(() => {
    if (validUrls.length === 0) return [];
    if (validUrls.length === 1) return [validUrls[0]];
    if (validUrls.length === 2) return [validUrls[0], validUrls[1], validUrls[1], validUrls[0]];
    if (validUrls.length === 3) return [validUrls[0], validUrls[1], validUrls[2], validUrls[0]];
    return validUrls.slice(0, 4);
  });
</script>

<div
  class={`relative aspect-square overflow-hidden rounded-[var(--radius-media)] bg-surface-1 ring-1 ring-inset ring-white/10 ${className}`}
>
  {#if tiles.length === 0}
    <div class="flex h-full w-full items-center justify-center bg-surface-2 text-ink-3">
      <Icon name="mixtapes" size={32} />
    </div>
  {:else if tiles.length === 1}
    <img src={tiles[0]} {alt} loading="lazy" decoding="async" class="h-full w-full object-cover pixelated" />
  {:else}
    <div class="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-canvas">
      {#each tiles as url, i (`${i}-${url}`)}
        <img
          src={url}
          alt={i === 0 ? alt : ''}
          loading="lazy"
          decoding="async"
          class="h-full w-full object-cover pixelated"
        />
      {/each}
    </div>
  {/if}
</div>
