import { onMount } from 'svelte';

// Shared state across all component instances
export const currentPathState = $state({
  path: typeof window !== 'undefined' ? location.pathname : '',
});

let initialized = false;

export function useCurrentPath() {
  onMount(() => {
    // Only set up the listener once globally
    if (!initialized) {
      initialized = true;

      const updatePath = () => {
        currentPathState.path = location.pathname;
      };

      document.addEventListener('astro:page-load', updatePath);
    }
  });
}
