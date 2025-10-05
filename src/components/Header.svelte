<script lang="ts">
  import { onMount } from 'svelte';
  import Navigation from './layout/Navigation.svelte';
  import UserMenu from './layout/UserMenu.svelte';

  interface Props {
    _kid: string | null;
    _cid: string | null;
  }

  let { _kid, _cid }: Props = $props();

  let playlist = $state<string | null>(null);

  onMount(() => {
    playlist = localStorage.getItem('smol:playlist');
  });
</script>

<header class="relative p-2 bg-slate-800 text-lime-500">
  <div class="flex items-center flex-wrap max-w-[1024px] mx-auto">
    <Navigation />
    <UserMenu initialKeyId={_kid} initialContractId={_cid} />
  </div>

  {#if playlist}
    <div class="flex items-center justify-center md:justify-start flex-wrap max-w-[1024px] mx-auto py-2">
      <a
        class="text-sm hover:underline {!import.meta.env.SSR && location.pathname.endsWith(playlist) && 'underline'}"
        href={`/playlist/${playlist}`}>{playlist}</a
      >
    </div>
  {/if}
</header>
