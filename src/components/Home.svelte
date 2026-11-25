<script lang="ts">
  import SmolGrid from './smol/SmolGrid.svelte';
  import type { SmolListResponse } from '../types/api';

  interface Props {
    playlist?: string | null;
    endpoint?: string;
    heading?: string;
    initialData?: SmolListResponse | null;
    emptyTitle?: string;
    emptyDescription?: string;
  }

  let {
    playlist = null,
    endpoint = '',
    heading,
    initialData = null,
    emptyTitle,
    emptyDescription,
  }: Props = $props();
</script>

<SmolGrid {playlist} {endpoint} {heading} {initialData} {emptyTitle} {emptyDescription} />
