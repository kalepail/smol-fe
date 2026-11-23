<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    id?: string | null;
    src?: string | null;
    alt?: string;
    scale?: number;
    loading?: 'lazy' | 'eager';
    class?: string;
  }

  let {
    id = null,
    src = null,
    alt = '',
    scale,
    loading = 'lazy',
    class: className = '',
  }: Props = $props();

  let failed = $state(false);

  const imageUrl = $derived.by(() => {
    const base = src ?? (id ? `${import.meta.env.PUBLIC_API_URL}/image/${id}.png` : null);
    if (!base) return null;
    if (scale && !base.includes('?')) return `${base}?scale=${scale}`;
    return base;
  });

  $effect(() => {
    imageUrl;
    failed = false;
  });
</script>

<div
  class={`relative aspect-square overflow-hidden rounded-[var(--radius-media)] bg-surface-1 ring-1 ring-inset ring-white/10 ${className}`}
>
  {#if imageUrl && !failed}
    <img
      src={imageUrl}
      {alt}
      {loading}
      decoding="async"
      class="h-full w-full object-cover pixelated"
      onerror={() => {
        failed = true;
      }}
    />
  {:else}
    <div class="flex h-full w-full items-center justify-center bg-surface-2 text-ink-3">
      <Icon name="music" size={24} />
    </div>
  {/if}
</div>
