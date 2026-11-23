<script lang="ts">
  import SmolGrid from './smol/SmolGrid.svelte';
  import Button from './ui/Button.svelte';
  import Icon from './ui/Icon.svelte';
  import { toast } from '../stores/toast.svelte';
  import type { ArtistSmolsResponse } from '../types/api';
  import { shortenAddress } from '../utils/address';

  interface Props {
    address: string;
    initialData?: ArtistSmolsResponse | null;
  }

  let { address, initialData = null }: Props = $props();

  const displayName = $derived(initialData?.artist?.Username || shortenAddress(address));
  const artistEndpoint = $derived(`artists/${encodeURIComponent(address)}/smols`);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Artist address copied.');
    } catch {
      toast.error('Could not copy address.');
    }
  }
</script>

<section class="border-b border-line bg-surface-1/60 py-6 sm:py-8">
  <div class="app-container">
    <p class="text-xs font-medium uppercase tracking-wider text-ink-3">Artist</p>
    <h1 class="mt-1.5 break-words text-2xl sm:text-3xl font-semibold text-ink-1">{displayName}</h1>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <code class="break-all font-mono text-xs text-ink-2">{address}</code>
      <Button variant="ghost" size="sm" onclick={copyAddress}>
        <Icon name="copy" size={14} />
        <span>Copy</span>
      </Button>
    </div>
  </div>
</section>

<SmolGrid
  endpoint={artistEndpoint}
  {initialData}
  emptyTitle={`No public songs from ${displayName} yet`}
  emptyDescription="Check back later."
/>
