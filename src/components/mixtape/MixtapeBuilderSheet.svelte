<script lang="ts">
  import { mixtapeDraftState, mixtapeModeState, exitMixtapeMode } from '../../stores/mixtape.svelte';
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
  open={mixtapeModeState.active}
  title={draftTitle}
  subtitle="Add songs from the feed or search, then publish."
  maxWidth="lg"
  onClose={exitMixtapeMode}
>
  <MixtapeBuilder />
</Sheet>
