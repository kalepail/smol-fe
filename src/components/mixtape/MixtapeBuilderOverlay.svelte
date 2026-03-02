<script lang="ts">
  import { mixtapeModeState, mixtapeDraftHasContent, exitMixtapeMode } from '../../stores/mixtape.svelte.ts';
  import MixtapeBuilder from './builder/MixtapeBuilder.svelte';

  function handleKeydown(event: KeyboardEvent) {
    if (!mixtapeModeState.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    }
  }

  function handleClose() {
    if (mixtapeDraftHasContent.current) {
      const confirmed = confirm('Exit Mixtape Mode? Your draft will stay saved locally.');
      if (!confirmed) return;
    }
    exitMixtapeMode();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if mixtapeModeState.active}
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
    <MixtapeBuilder />
  </div>
{/if}
