<script lang="ts">
  import SmolGrid from './smol/SmolGrid.svelte';
  import Button from './ui/Button.svelte';
  import IconButton from './ui/IconButton.svelte';
  import Icon from './ui/Icon.svelte';
  import { toast } from '../stores/toast.svelte';
  import type { ArtistSmolsResponse } from '../types/api';
  import { shortenAddress } from '../utils/address';

  interface Props {
    address: string;
    initialData?: ArtistSmolsResponse | null;
  }

  let { address, initialData = null }: Props = $props();

  const hasUsername = $derived(Boolean(initialData?.artist?.Username));
  const displayName = $derived(initialData?.artist?.Username || shortenAddress(address));
  const shortAddr = $derived(shortenAddress(address));
  const artistEndpoint = $derived(`artists/${encodeURIComponent(address)}/smols`);
  const songCount = $derived(initialData?.smols?.length ?? null);
  const hasMore = $derived(Boolean(initialData?.pagination?.hasMore));
  const songCountLabel = $derived.by(() => {
    if (songCount === null) return null;
    if (hasMore) return `${songCount}+ songs`;
    return `${songCount} ${songCount === 1 ? 'song' : 'songs'}`;
  });

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Artist address copied.');
    } catch {
      toast.error('Could not copy address.');
    }
  }

  async function shareArtist() {
    const url = `${window.location.origin}/artists/${encodeURIComponent(address)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: displayName, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Artist link copied.');
      }
    } catch {
      // User cancelled native share.
    }
  }
</script>

<section class="border-b border-line bg-surface-1/60 py-6 sm:py-8">
  <div class="app-container flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0 space-y-2">
      <h1 class="[overflow-wrap:anywhere] text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl lg:text-4xl">
        {displayName}
      </h1>
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-2">
        {#if songCountLabel}
          <span class="tabular">{songCountLabel}</span>
          <span aria-hidden="true">·</span>
        {/if}
        {#if hasUsername}
          <code class="font-mono text-xs text-ink-2" title={address}>{shortAddr}</code>
        {/if}
        <Button variant="ghost" size="sm" class="min-h-11" title={address} onclick={copyAddress}>
          <Icon name="copy" size={14} />
          <span>{hasUsername ? 'Copy' : 'Copy address'}</span>
        </Button>
      </div>
    </div>

    <IconButton label="Share artist" variant="surface" onclick={shareArtist}>
      <Icon name="share" size={20} />
    </IconButton>
  </div>
</section>

<SmolGrid
  endpoint={artistEndpoint}
  {initialData}
  emptyTitle={`No public songs from ${displayName} yet`}
  emptyDescription="Check back later."
/>
