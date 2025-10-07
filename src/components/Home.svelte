<script lang="ts">
  import SmolGrid from './smol/SmolGrid.svelte';

  interface Props {
    playlist?: string | null;
    endpoint?: string;
  }

  let {
    playlist = null,
    endpoint = ''
  }: Props = $props();
</script>

<SmolGrid {playlist} {endpoint} />
