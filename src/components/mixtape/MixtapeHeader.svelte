<script lang="ts">
  import type { MixtapeDetail } from '../../services/api/mixtapes';
  import { userState } from '../../stores/user.svelte';
  import { shortenAddress } from '../../utils/address';
  import MixtapeCollage from '../ui/MixtapeCollage.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import Chip from '../ui/Chip.svelte';

  interface Props {
    mixtape: MixtapeDetail;
    coverUrls: (string | null)[];
    isPlayingAll: boolean;
    canPlay: boolean;
    fullyOwned: boolean;
    isPurchasing: boolean;
    onPlayAll: () => void;
    onStopPlayAll: () => void;
    onPurchaseClick: () => void;
  }

  let {
    mixtape,
    coverUrls,
    isPlayingAll,
    canPlay,
    fullyOwned,
    isPurchasing,
    onPlayAll,
    onStopPlayAll,
    onPurchaseClick,
  }: Props = $props();
</script>

<header class="flex flex-col gap-5 md:flex-row md:items-end md:gap-7">
  <div class="mx-auto w-full max-w-[260px] md:mx-0 md:w-56 md:shrink-0">
    <MixtapeCollage {coverUrls} alt={mixtape.title} />
  </div>

  <div class="flex min-w-0 flex-1 flex-col gap-4">
    <div class="space-y-1.5">
      <h1 class="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-ink-1">
        {mixtape.title}
      </h1>
      <p class="tabular text-sm text-ink-2">
        {#if mixtape.creator}
          <a
            href={`/artists/${encodeURIComponent(mixtape.creator)}`}
            class="focus-ring rounded font-medium text-ink-1 hover:underline"
          >
            {shortenAddress(mixtape.creator)}
          </a>
          <span aria-hidden="true"> · </span>
        {/if}
        <span>{mixtape.trackCount} {mixtape.trackCount === 1 ? 'song' : 'songs'}</span>
      </p>
      {#if mixtape.description}
        <p class="max-w-[65ch] text-sm leading-relaxed text-ink-2">
          {mixtape.description}
        </p>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      {#if isPlayingAll}
        <Button variant="danger" onclick={onStopPlayAll} class="rounded-full px-5">
          <Icon name="stop" size={16} />
          <span>Stop Playing</span>
        </Button>
      {:else}
        <Button
          variant="primary"
          disabled={!canPlay}
          onclick={onPlayAll}
          class="rounded-full px-6"
        >
          <Icon name="play" size={18} />
          <span>Play All</span>
        </Button>
      {/if}

      {#if fullyOwned && userState.contractId}
        <span class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink-1 ring-1 ring-inset ring-line-strong">
          <img
            src="/owned-badge.png"
            alt=""
            class="size-6 shrink-0 rounded-full object-contain"
          />
          <span>Fully owned</span>
        </span>
      {:else}
        <Button
          variant="secondary"
          loading={isPurchasing}
          disabled={isPurchasing}
          onclick={onPurchaseClick}
        >
          <Icon name="cart" size={18} />
          <span>{isPurchasing ? 'Processing…' : 'Buy Mixtape'}</span>
        </Button>
      {/if}

      {#if mixtape.tracks.some((t) => t.Mint_Token)}
        <Chip tone="neutral">Collectible</Chip>
      {/if}
    </div>
  </div>
</header>
