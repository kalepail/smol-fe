<script lang="ts">
  import type { Smol } from '../types/domain';
  import SmolGrid from './smol/SmolGrid.svelte';

  interface Props {
    results: Smol[];
    playlist?: string | null;
  }

  let { results, playlist = null }: Props = $props();
</script>

<SmolGrid {results} {playlist} />
