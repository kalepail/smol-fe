<script lang="ts">
  import SmolGrid from './smol/SmolGrid.svelte';
  import type { ArtistProfile } from '../types/api';
  import { shortenAddress } from '../utils/address';

  interface Props {
    address: string;
    artist?: ArtistProfile | null;
  }

  let { address, artist = null }: Props = $props();

  const displayName = $derived(artist?.Username || shortenAddress(address));
  const artistEndpoint = $derived(`artists/${encodeURIComponent(address)}/smols`);
</script>

<section class="border-b border-slate-800 bg-slate-900 px-2 py-8">
  <div class="mx-auto max-w-[1024px]">
    <p class="text-xs font-semibold uppercase tracking-wider text-lime-400">Artist</p>
    <h1 class="mt-2 break-words text-3xl font-bold text-white">{displayName}</h1>
    <p class="mt-2 break-all font-mono text-xs text-slate-400">{address}</p>
  </div>
</section>

<SmolGrid
  endpoint={artistEndpoint}
  emptyTitle={`No public smols from ${displayName} yet`}
  emptyDescription="Check back later."
/>
