<script lang="ts">
  import { mixtapeModeState } from '../../stores/mixtape.svelte';

  let BuilderSheetComp = $state<typeof import('./MixtapeBuilderSheet.svelte').default | null>(null);

  // Lazy-load Sheet + MixtapeBuilder + svelte-dnd-action ONLY when Mixtape Mode opens.
  $effect(() => {
    if (!mixtapeModeState.active || BuilderSheetComp) return;
    void import('./MixtapeBuilderSheet.svelte').then((mod) => {
      BuilderSheetComp = mod.default;
    });
  });
</script>

{#if mixtapeModeState.active && BuilderSheetComp}
  <BuilderSheetComp />
{/if}
