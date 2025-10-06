import type { MixtapeTrack } from '../types/domain';
import { SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';

export function useMixtapeDragDrop() {
  function handleExternalDragOver(
    event: DragEvent,
    isDraggingTracks: boolean,
    tracksForDnd: MixtapeTrack[],
    tracksListEl: HTMLUListElement | null,
    onTracksUpdate: (tracks: MixtapeTrack[]) => void
  ): boolean {
    if (isDraggingTracks) return false;
    if (!event.dataTransfer || !event.dataTransfer.types.includes('application/json'))
      return false;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';

    if (!tracksListEl || tracksForDnd.length === 0) {
      onTracksUpdate([
        {
          id: SHADOW_PLACEHOLDER_ITEM_ID,
          title: '',
          coverUrl: null,
          creator: null,
        },
      ]);
      return true;
    }

    const listItems = Array.from(
      tracksListEl.querySelectorAll<HTMLElement>('[data-mixtape-track-id]')
    );
    let insertIndex = listItems.length;

    for (let i = 0; i < listItems.length; i += 1) {
      const rect = listItems[i].getBoundingClientRect();
      const midpointY = rect.top + rect.height / 2;
      if (event.clientY < midpointY) {
        insertIndex = i;
        break;
      }
    }

    const tracksWithShadow = tracksForDnd.filter(
      (track) => track.id !== SHADOW_PLACEHOLDER_ITEM_ID
    );
    tracksWithShadow.splice(insertIndex, 0, {
      id: SHADOW_PLACEHOLDER_ITEM_ID,
      title: '',
      coverUrl: null,
      creator: null,
    });

    onTracksUpdate(tracksWithShadow);
    return true;
  }

  function handleExternalDragLeave(
    event: DragEvent,
    isDraggingTracks: boolean,
    snapshotTracks: MixtapeTrack[],
    onTracksUpdate: (tracks: MixtapeTrack[]) => void
  ): void {
    if (!event.currentTarget || isDraggingTracks) return;
    const target = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (related && target.contains(related)) return;

    onTracksUpdate(snapshotTracks);
  }

  function handleExternalDrop(
    event: DragEvent,
    mixtapeTracks: MixtapeTrack[],
    snapshotTracks: MixtapeTrack[],
    tracksListEl: HTMLUListElement | null,
    onTracksUpdate: (tracks: MixtapeTrack[]) => void
  ): void {
    if (!event.dataTransfer) return;
    event.preventDefault();

    const raw = event.dataTransfer.getData('application/json');
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        type?: string;
        track?: MixtapeTrack;
      };
      if (parsed?.type !== 'smol' || !parsed.track) return;

      const alreadyAdded = snapshotTracks.some(
        (track) => track.id === parsed.track?.id
      );
      if (alreadyAdded) {
        onTracksUpdate(snapshotTracks);
        return;
      }

      const normalized: MixtapeTrack = {
        id: parsed.track.id,
        title: parsed.track.title ?? 'Untitled Smol',
        coverUrl: parsed.track.coverUrl ?? null,
        creator: parsed.track.creator ?? null,
      };

      if (snapshotTracks.length === 0 || !tracksListEl) {
        onTracksUpdate([...mixtapeTracks, normalized]);
        return;
      }

      const listItems = Array.from(
        tracksListEl.querySelectorAll<HTMLElement>('[data-mixtape-track-id]')
      );
      let insertIndex = listItems.length;

      for (let i = 0; i < listItems.length; i += 1) {
        const rect = listItems[i].getBoundingClientRect();
        const midpointY = rect.top + rect.height / 2;
        if (event.clientY < midpointY) {
          insertIndex = i;
          break;
        }
      }

      const updatedTracks = [...mixtapeTracks];
      updatedTracks.splice(insertIndex, 0, normalized);
      onTracksUpdate(updatedTracks);
    } catch (error) {
      console.warn('Failed to parse dragged data', error);
    }
  }

  return {
    handleExternalDragOver,
    handleExternalDragLeave,
    handleExternalDrop,
  };
}
