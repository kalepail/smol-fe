<script lang="ts">
  import Navigation from "./layout/Navigation.svelte";
  import UserMenu from "./layout/UserMenu.svelte";
  import { useCurrentPath } from "../hooks/useCurrentPath.svelte";
  import { onMount, onDestroy } from "svelte";

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

  // Loading bar state
  let isLoading = $state(false);
  let loadingProgress = $state(0);
  let loadingInterval: ReturnType<typeof setInterval> | null = null;

  function startLoading() {
    isLoading = true;
    loadingProgress = 0;
    // Animate progress quickly to 90%, then slow down
    loadingInterval = setInterval(() => {
      if (loadingProgress < 90) {
        loadingProgress += Math.random() * 15;
      } else if (loadingProgress < 98) {
        loadingProgress += 0.5;
      }
    }, 100);
  }

  function stopLoading() {
    loadingProgress = 100;
    if (loadingInterval) clearInterval(loadingInterval);
    setTimeout(() => {
      isLoading = false;
      loadingProgress = 0;
    }, 200);
  }

  onMount(() => {
    // Listen for Astro view transitions
    document.addEventListener("astro:before-preparation", startLoading);
    document.addEventListener("astro:after-swap", stopLoading);
    document.addEventListener("astro:page-load", stopLoading);
  });

  onDestroy(() => {
    if (loadingInterval) clearInterval(loadingInterval);
    if (typeof document !== "undefined") {
      document.removeEventListener("astro:before-preparation", startLoading);
      document.removeEventListener("astro:after-swap", stopLoading);
      document.removeEventListener("astro:page-load", stopLoading);
    }
  });
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

  <!-- Loading bar -->
  {#if isLoading}
    <div class="loading-bar" style="width: {loadingProgress}%"></div>
  {/if}
</header>

<style>
  .loading-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: linear-gradient(90deg, #22c55e, #4ade80);
    transition: width 0.1s ease-out;
    box-shadow: 0 0 8px #22c55e;
  }
</style>
