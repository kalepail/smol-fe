<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import { shortenAddress } from '../../utils/address';
  import MixtapeCollage from '../ui/MixtapeCollage.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';

  /**
   * Presentational mixtape header (Report 30 §7 + Report 24 §5.3).
   * Each role owns its own slot so creator chrome (24) and collector chrome
   * (30) layer in without touching each other:
   *   ownerBanner  → 24 hidden-status callout (creator only, above everything)
   *   ownerChip    → 24 Listed / Hidden chip in the meta line (creator only)
   *   ownerActions → 24 [Edit] [⋯] in the action row, after playback
   *   collectSlot  → 30 CollectCard (everyone); never in the action row
   */
  interface Props {
    mixtape: MixtapeDetail;
    coverUrls: (string | null)[];
    playback: { isPlaying: boolean; canPlay: boolean; onToggle: () => void };
    ownerBanner?: Snippet;
    ownerChip?: Snippet;
    ownerActions?: Snippet;
    collectSlot?: Snippet;
  }

  let { mixtape, coverUrls, playback, ownerBanner, ownerChip, ownerActions, collectSlot }: Props = $props();

  let descriptionExpanded = $state(false);
</script>

<header class="flex flex-col gap-5">
  {@render ownerBanner?.()}

  <div
    class="grid grid-cols-1 gap-5 md:grid-cols-[224px_minmax(0,1fr)] md:items-end md:gap-7 lg:grid-cols-[224px_minmax(0,1fr)_340px]"
  >
    <div class="mx-auto w-full max-w-[min(260px,30dvh)] md:mx-0 md:max-w-none">
      <MixtapeCollage {coverUrls} alt={mixtape.title} />
    </div>

    <div class="flex min-w-0 flex-col gap-4">
      <div class="space-y-1.5">
        <p class="hidden text-xs font-medium uppercase tracking-wider text-ink-3 md:block">Mixtape</p>
        <h1 class="text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl lg:text-4xl">
          {mixtape.title}
        </h1>
        <p class="tabular flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-ink-2">
          {#if mixtape.creator}
            <a
              href={`/artists/${encodeURIComponent(mixtape.creator)}`}
              class="focus-ring rounded font-medium text-ink-1 hover:underline"
            >
              {shortenAddress(mixtape.creator)}
            </a>
            <span aria-hidden="true">·</span>
          {/if}
          <span>{mixtape.trackCount} {mixtape.trackCount === 1 ? 'song' : 'songs'}</span>
          {#if ownerChip}
            <span aria-hidden="true">·</span>
            {@render ownerChip()}
          {/if}
        </p>
        {#if mixtape.description}
          <p
            class={`max-w-[65ch] text-sm leading-relaxed text-ink-2 ${descriptionExpanded ? '' : 'line-clamp-2 sm:line-clamp-3'}`}
          >
            {mixtape.description}
          </p>
          {#if !descriptionExpanded && mixtape.description.length > 120}
            <button
              type="button"
              onclick={() => (descriptionExpanded = true)}
              class="focus-ring -my-1 self-start rounded text-xs font-medium text-ink-1 hover:underline"
            >
              More
            </button>
          {/if}
        {/if}
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <Button
          variant="primary"
          disabled={!playback.canPlay}
          onclick={playback.onToggle}
          class="min-w-28 rounded-full px-6"
        >
          <Icon name={playback.isPlaying ? 'pause' : 'play'} size={18} />
          <span>{playback.isPlaying ? 'Pause' : 'Play'}</span>
        </Button>
        {@render ownerActions?.()}
      </div>
    </div>

    {#if collectSlot}
      <div class="min-w-0 md:col-span-2 lg:col-span-1 lg:self-end">
        {@render collectSlot()}
      </div>
    {/if}
  </div>
</header>
