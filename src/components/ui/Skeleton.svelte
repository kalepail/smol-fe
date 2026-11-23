<script lang="ts">
  interface Props {
    variant?: 'card' | 'row' | 'hero' | 'line';
    count?: number;
    class?: string;
  }

  let { variant = 'card', count = 1, class: className = '' }: Props = $props();
</script>

{#if variant === 'card'}
  <div class={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 ${className}`} aria-hidden="true">
    {#each Array.from({ length: count }) as _, index (index)}
      <div class="flex flex-col gap-2">
        <div class="aspect-square w-full animate-pulse rounded-[var(--radius-media)] bg-surface-1"></div>
        <div class="h-4 w-4/5 animate-pulse rounded bg-surface-1"></div>
        <div class="h-3 w-1/2 animate-pulse rounded bg-surface-1"></div>
      </div>
    {/each}
  </div>
{:else if variant === 'row'}
  <div class={`flex flex-col gap-3 ${className}`} aria-hidden="true">
    {#each Array.from({ length: count }) as _, index (index)}
      <div class="flex items-center gap-3 py-2">
        <div class="size-12 shrink-0 animate-pulse rounded-[var(--radius-media)] bg-surface-1"></div>
        <div class="flex-1 space-y-2">
          <div class="h-4 w-2/3 animate-pulse rounded bg-surface-1"></div>
          <div class="h-3 w-1/3 animate-pulse rounded bg-surface-1"></div>
        </div>
      </div>
    {/each}
  </div>
{:else if variant === 'hero'}
  <div class={`grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10 ${className}`} aria-hidden="true">
    <div class="space-y-4">
      <div class="mx-auto aspect-square w-full max-w-[min(240px,30dvh)] animate-pulse rounded-[var(--radius-media)] bg-surface-1 lg:mx-0 lg:max-w-none"></div>
      <div class="hidden h-44 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1 lg:block"></div>
    </div>
    <div class="space-y-4">
      <div class="h-9 w-2/3 animate-pulse rounded bg-surface-1"></div>
      <div class="h-4 w-1/3 animate-pulse rounded bg-surface-1"></div>
      <div class="flex gap-2">
        <div class="h-11 w-32 animate-pulse rounded-full bg-surface-1"></div>
        <div class="h-11 w-24 animate-pulse rounded-full bg-surface-1"></div>
        <div class="size-11 animate-pulse rounded-full bg-surface-1"></div>
      </div>
      <div class="h-20 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1"></div>
      <div class="h-24 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1"></div>
      <div class="h-36 w-full animate-pulse rounded-[var(--radius-control)] bg-surface-1"></div>
    </div>
  </div>
{:else}
  <div class={`h-4 animate-pulse rounded bg-surface-1 ${className}`} aria-hidden="true"></div>
{/if}
