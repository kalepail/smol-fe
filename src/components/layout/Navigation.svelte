<script lang="ts">
  import { userState } from '../../stores/user.svelte';
  import { useCurrentPath, currentPathState } from '../../hooks/useCurrentPath.svelte.ts';

  const isAuthenticated = $derived(userState.contractId !== null);
  useCurrentPath();
</script>

<div class="flex items-center mr-auto">
  <h1 class="flex flex-col text-xl py-1">
    <a href="/"><strong>SMOL</strong></a>
  </h1>

  <a
    class="ml-4 hover:underline {currentPathState.path === '/mixtapes' || currentPathState.path.startsWith('/mixtapes/') ? 'underline' : ''}"
    href="/mixtapes"
  >Mixtapes</a>

  {#if isAuthenticated}
    <a
      class="ml-5 hover:underline {currentPathState.path === '/created' ? 'underline' : ''}"
      href="/created">Created</a
    >

    <a
      class="ml-5 hover:underline {currentPathState.path === '/liked' ? 'underline' : ''}"
      href="/liked">Liked</a
    >
  {/if}
</div>
