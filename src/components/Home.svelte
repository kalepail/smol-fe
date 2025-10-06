<script lang="ts">
  import type { Smol } from '../types/domain';
  import SmolGrid from './smol/SmolGrid.svelte';

  interface Props {
    results: Smol[];
    playlist?: string | null;
    initialCursor?: string | null;
    hasMore?: boolean;
    endpoint?: string;
  }

  let {
    results,
    playlist = null,
    initialCursor = null,
    hasMore = false,
    endpoint = ''
  }: Props = $props();
</script>

<SmolGrid {results} {playlist} {initialCursor} {hasMore} {endpoint} />
