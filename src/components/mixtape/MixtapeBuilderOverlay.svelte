<script lang="ts">
  import { mixtapeSheetState } from '../../stores/mixtape.svelte';

  let BuilderSheetComp = $state<typeof import('./MixtapeBuilderSheet.svelte').default | null>(null);

  // Lazy-load Sheet + MixtapeBuilder ONLY when the builder sheet opens.
  $effect(() => {
    if (!mixtapeSheetState.open || BuilderSheetComp) return;
    void import('./MixtapeBuilderSheet.svelte').then((mod) => {
      BuilderSheetComp = mod.default;
    });
  });
</script>

{#if BuilderSheetComp}
  <BuilderSheetComp />
{/if}
