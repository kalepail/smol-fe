<script lang="ts">
  import { mixtapeDraftState, mixtapeSheetState, closeMixtapeSheet } from '../../stores/mixtape.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import MixtapeBuilder from './builder/MixtapeBuilder.svelte';

  const draftTitle = $derived.by(() => {
    const count = mixtapeDraftState.tracks.length;
    const name = mixtapeDraftState.title.trim();
    if (count === 0) return 'New mixtape';
    const songs = `${count} ${count === 1 ? 'song' : 'songs'}`;
    return name ? `${songs} in "${name}"` : `${songs} in draft`;
  });
</script>

<Sheet
  open={mixtapeSheetState.open}
  title={draftTitle}
  subtitle="Close to add songs from the feed."
  maxWidth="lg"
  onClose={closeMixtapeSheet}
>
  <MixtapeBuilder />
</Sheet>
