<script lang="ts">
  import { userState } from '../../stores/user.svelte';

  const isAuthenticated = $derived(userState.contractId !== null);
</script>

<div class="flex items-center mr-auto">
  <h1 class="flex flex-col text-xl py-1">
    <a href="/"><strong>SMOL</strong></a>
  </h1>

  <a
    class="ml-4 hover:underline {!import.meta.env.SSR && location.pathname.includes('mixtapes') && 'underline'}"
    href="/mixtapes"
  >Mixtapes</a>

  {#if isAuthenticated}
    <a
      class="ml-5 hover:underline {!import.meta.env.SSR && location.pathname.endsWith('created') && 'underline'}"
      href="/created">Created</a
    >

    <a
      class="mx-5 hover:underline {!import.meta.env.SSR && location.pathname.endsWith('liked') && 'underline'}"
      href="/liked">Liked</a
    >
  {/if}
</div>
