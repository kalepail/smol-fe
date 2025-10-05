<script lang="ts">
  import { onMount } from 'svelte';
  import { userState } from '../../stores/user.svelte';

  const isAuthenticated = $derived(userState.contractId !== null);

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

<div class="flex items-center mr-auto">
  <h1 class="flex flex-col text-xl py-1">
    <a href="/"><strong>SMOL</strong></a>
  </h1>

  <a
    class="ml-4 hover:underline {currentPath === '/mixtapes' || currentPath.startsWith('/mixtapes/') ? 'underline' : ''}"
    href="/mixtapes"
  >Mixtapes</a>

  {#if isAuthenticated}
    <a
      class="ml-5 hover:underline {currentPath === '/created' ? 'underline' : ''}"
      href="/created">Created</a
    >

    <a
      class="mx-5 hover:underline {currentPath === '/liked' ? 'underline' : ''}"
      href="/liked">Liked</a
    >
  {/if}
</div>
