import { onMount } from 'svelte';

export function useCurrentPath() {
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

  return {
    get currentPath() {
      return currentPath;
    },
  };
}
