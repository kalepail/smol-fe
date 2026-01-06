<script lang="ts">
  import { userState } from "../../stores/user.svelte";
  import { useCurrentPath } from "../../hooks/useCurrentPath.svelte";

  const isAuthenticated = $derived(userState.contractId !== null);
  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);
</script>

<div class="flex items-center mr-auto">
  <h1 class="flex flex-col text-xl py-1">
    <a href="/" class="flex items-center gap-1">
      <span class="text-[#9ae600] font-bold">SMOL</span>
      {#if path === "/radio"}
        <span class="font-thin text-white tracking-widest text-lg">RADIO</span>
      {/if}
    </a>
  </h1>

  <a
    class="ml-4 hover:underline {path === '/mixtapes' ||
    path.startsWith('/mixtapes/')
      ? 'underline'
      : ''}"
    href="/mixtapes">Mixtapes</a
  >

  <a
    class="ml-4 hover:underline {path === '/artists' ||
    path.startsWith('/artists/')
      ? 'underline'
      : ''}"
    href="/artists">Artists</a
  >

  <a
    class="ml-4 hover:underline {path === '/tags' ? 'underline' : ''}"
    href="/tags">Tags</a
  >

  <a
    class="ml-4 hover:underline {path === '/radio' ? 'underline' : ''}"
    href="/radio">Radio</a
  >

  <a
    class="ml-4 hover:underline {path === '/store' ? 'underline' : ''}"
    href="/store">Store</a
  >

  {#if isAuthenticated}
    <!-- Content links moved to UserMenu -->
  {/if}
</div>
