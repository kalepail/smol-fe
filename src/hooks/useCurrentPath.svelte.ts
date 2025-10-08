import { onMount } from 'svelte';

// Shared state across all component instances
const state = $state({
  path: typeof window !== 'undefined' ? location.pathname : '',
});

let initialized = false;

export function useCurrentPath() {
  onMount(() => {
    // Only set up the listener once globally
    if (!initialized) {
      initialized = true;

      const updatePath = () => {
        state.path = location.pathname;
      };

      document.addEventListener('astro:page-load', updatePath);
    }
  });

  return {
    get path() {
      return state.path;
    },
  };
}
