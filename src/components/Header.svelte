<script lang="ts">
  import { onMount } from 'svelte';
  import Navigation from './layout/Navigation.svelte';
  import UserMenu from './layout/UserMenu.svelte';
  import { useCurrentPath } from '../hooks/useCurrentPath.svelte';

  interface Props {
    _kid: string | null;
    _cid: string | null;
  }

  let { _kid, _cid }: Props = $props();

  let playlist = $state<string | null>(typeof window !== 'undefined' ? localStorage.getItem('smol:playlist') : null);
  let searchQuery = $state('');
  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);

  function syncSearchQuery() {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    searchQuery = url.pathname === '/search' ? (url.searchParams.get('q') ?? '') : '';
  }

  onMount(() => {
    syncSearchQuery();

    document.addEventListener('astro:page-load', syncSearchQuery);
    return () => {
      document.removeEventListener('astro:page-load', syncSearchQuery);
    };
  });
</script>

<header class="relative p-2 bg-slate-800 text-lime-500">
  <div class="flex items-center flex-wrap max-w-[1024px] mx-auto gap-3">
    <Navigation />
    <form action="/search" class="w-full sm:w-auto sm:flex-1 sm:max-w-md">
      <input
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-lime-400"
        type="search"
        name="q"
        bind:value={searchQuery}
        placeholder="Search songs"
      />
    </form>
    <UserMenu initialKeyId={_kid} initialContractId={_cid} />
  </div>

  {#if playlist}
    <div class="flex items-center justify-start flex-wrap max-w-[1024px] mx-auto mt-3">
      <a
        class="text-sm hover:underline {path.endsWith(playlist) ? 'underline' : ''}"
        href={`/playlist/${playlist}`}>{playlist}</a
      >
    </div>
  {/if}
</header>
