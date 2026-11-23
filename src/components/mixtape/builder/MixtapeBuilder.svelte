<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { type DndEvent, SHADOW_PLACEHOLDER_ITEM_ID } from 'svelte-dnd-action';
  import type { MixtapeTrack } from '../../../types/domain';
  import {
    mixtapeDraftState,
    mixtapeDraftHasContent,
    exitMixtapeMode,
    setTitle,
    setDescription,
    moveTrack,
    removeTrack,
    clearDraft,
    touchMixtapeDraft,
    setTracks,
    getSnapshotDraft,
  } from '../../../stores/mixtape.svelte';
  import { confirmAction } from '../../../stores/confirm.svelte';
  import { toast } from '../../../stores/toast.svelte';
  import { useMixtapePublishing } from '../../../hooks/useMixtapePublishing';
  import { useMixtapeDragDrop } from '../../../hooks/useMixtapeDragDrop';
  import MixtapeTrackList from './MixtapeTrackList.svelte';
  import MixtapeForm from './MixtapeForm.svelte';
  import { logger } from '../../../utils/logger';

  let publishing = $state(false);
  let statusMessage = $state<string | null>(null);
  let statusTone = $state<'info' | 'success' | 'error'>('info');
  let isDraggingTracks = $state(false);
  let tracksForDnd = $state<MixtapeTrack[]>([]);
  let isExternalDragActive = $state(false);
  let tracksListEl = $state<HTMLUListElement | null>(null);

  const publishingHook = useMixtapePublishing();
  const dragDropHook = useMixtapeDragDrop();

  function resetStatus() {
    statusMessage = null;
  }

  function showStatus(message: string, tone: typeof statusTone) {
    statusMessage = message;
    statusTone = tone;
  }

  function handleMove(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    moveTrack(index, targetIndex);
  }

  function handleRemove(index: number) {
    const track = mixtapeDraftState.tracks[index];
    if (!track) return;
    removeTrack(track.id);
    toast.info(`Removed "${track.title}" from draft.`);
  }

  async function handleDiscard() {
    if (!mixtapeDraftHasContent.current) {
      clearDraft();
      exitMixtapeMode();
      return;
    }

    const name = mixtapeDraftState.title.trim() || 'current mixtape draft';
    const confirmed = await confirmAction({
      title: `Discard "${name}"?`,
      message: 'This clears all tracks, title, and description from your local draft.',
      confirmLabel: 'Discard draft',
      destructive: true,
    });
    if (!confirmed) return;

    clearDraft();
    exitMixtapeMode();
    toast.info('Mixtape draft discarded.');
  }

  function handleSaveDraft() {
    touchMixtapeDraft();
    exitMixtapeMode();
    toast.success('Mixtape draft saved locally.');
  }

  async function handlePublish() {
    resetStatus();
    publishing = true;

    try {
      const published = await publishingHook.publish(getSnapshotDraft());
      clearDraft();
      exitMixtapeMode();
      toast.success('Mixtape published.');
      await navigate(`/mixtapes/${published.id}`);
    } catch (error) {
      logger.error('mixtape', error);
      showStatus(
        error instanceof Error ? error.message : 'Failed to publish mixtape. Try again.',
        'error'
      );
    } finally {
      publishing = false;
    }
  }

  function handleTrackConsider(event: CustomEvent<DndEvent<MixtapeTrack>>) {
    isDraggingTracks = true;
    tracksForDnd = event.detail.items;
  }

  function handleTrackFinalize(event: CustomEvent<DndEvent<MixtapeTrack>>) {
    isDraggingTracks = false;
    const filtered = event.detail.items.filter(
      (item) => item.id && item.id !== SHADOW_PLACEHOLDER_ITEM_ID
    );
    setTracks(filtered);
    tracksForDnd = getSnapshotDraft().tracks;
  }

  function handleExternalDragOver(event: DragEvent) {
    const shouldShowShadow = dragDropHook.handleExternalDragOver(
      event,
      isDraggingTracks,
      tracksForDnd,
      tracksListEl,
      (tracks) => {
        tracksForDnd = tracks;
      }
    );
    if (shouldShowShadow) {
      isExternalDragActive = true;
    }
  }

  function handleExternalDragLeave(event: DragEvent) {
    dragDropHook.handleExternalDragLeave(
      event,
      isDraggingTracks,
      getSnapshotDraft().tracks,
      (tracks) => {
        isExternalDragActive = false;
        tracksForDnd = tracks;
      }
    );
  }

  function handleExternalDrop(event: DragEvent) {
    dragDropHook.handleExternalDrop(
      event,
      mixtapeDraftState.tracks,
      getSnapshotDraft().tracks,
      tracksListEl,
      (tracks) => {
        mixtapeDraftState.tracks = tracks;
        isExternalDragActive = false;
        tracksForDnd = getSnapshotDraft().tracks;
      }
    );
  }

  onMount(() => {
    resetStatus();
  });

  $effect(() => {
    if (!isDraggingTracks) {
      tracksForDnd = mixtapeDraftState.tracks;
    }
  });
</script>

<div
  role="region"
  aria-label="Mixtape builder workspace"
  class="grid gap-5 lg:grid-cols-[1.3fr_1fr]"
  ondragover={handleExternalDragOver}
  ondragleave={handleExternalDragLeave}
  ondrop={handleExternalDrop}
>
  <MixtapeTrackList
    tracks={tracksForDnd}
    {isExternalDragActive}
    onConsider={handleTrackConsider}
    onFinalize={handleTrackFinalize}
    onMove={handleMove}
    onRemove={handleRemove}
    bindElement={(el) => (tracksListEl = el)}
  />

  <MixtapeForm
    draft={mixtapeDraftState}
    {publishing}
    {statusMessage}
    {statusTone}
    onTitleChange={(title) => {
      resetStatus();
      setTitle(title);
    }}
    onDescriptionChange={(desc) => {
      resetStatus();
      setDescription(desc);
    }}
    onDiscard={handleDiscard}
    onSaveDraft={handleSaveDraft}
    onPublish={handlePublish}
  />
</div>
