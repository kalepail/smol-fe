<script lang="ts">
  import Navigation from "./layout/Navigation.svelte";
  import UserMenu from "./layout/UserMenu.svelte";
  import { useCurrentPath } from "../hooks/useCurrentPath.svelte";

  interface Props {
    _kid: string | null;
    _cid: string | null;
  }

  let { _kid, _cid }: Props = $props();

  let playlist = $state<string | null>(
    typeof window !== "undefined"
      ? localStorage.getItem("smol:playlist")
      : null,
  );
  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);
</script>

<header
  class="sticky top-0 z-[200] p-2 bg-slate-800 text-lime-500 border-b border-slate-700/50 shadow-lg"
>
  <div
    class="flex items-center justify-between md:justify-start flex-nowrap max-w-[1024px] mx-auto gap-3"
  >
    <Navigation />
    <UserMenu initialKeyId={_kid} initialContractId={_cid} />
  </div>

  {#if playlist}
    <div
      class="flex items-center justify-start flex-wrap max-w-[1024px] mx-auto mt-3"
    >
      <a
        class="text-sm hover:underline {path.endsWith(playlist)
          ? 'underline'
          : ''}"
        href={`/playlist/${playlist}`}>{playlist}</a
      >
    </div>
  {/if}
</header>
