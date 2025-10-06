<script lang="ts">
  import { onMount } from 'svelte';
  import Navigation from './layout/Navigation.svelte';
  import UserMenu from './layout/UserMenu.svelte';

  interface Props {
    _kid: string | null;
    _cid: string | null;
    _balance: string | null;
  }

  let { _kid, _cid, _balance }: Props = $props();

  let playlist = $state<string | null>(typeof window !== 'undefined' ? localStorage.getItem('smol:playlist') : null);
  let currentPath = $state(typeof window !== 'undefined' ? location.pathname : '');

  onMount(() => {
    const updatePath = () => {
      currentPath = location.pathname;
    };

    document.addEventListener('astro:page-load', updatePath);

    return () => {
      document.removeEventListener('astro:page-load', updatePath);
    };
  });
</script>

<header class="relative p-2 bg-slate-800 text-lime-500">
  <div class="flex items-center flex-wrap max-w-[1024px] mx-auto gap-3">
    <Navigation />
    <UserMenu initialKeyId={_kid} initialContractId={_cid} initialBalance={_balance} />
  </div>

  {#if playlist}
    <div class="flex items-center justify-start flex-wrap max-w-[1024px] mx-auto mt-3">
      <a
        class="text-sm hover:underline {currentPath.endsWith(playlist) ? 'underline' : ''}"
        href={`/playlist/${playlist}`}>{playlist}</a
      >
    </div>
  {/if}
</header>
