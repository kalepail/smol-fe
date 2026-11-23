<script lang="ts">
  import { flushSync } from 'svelte';
  import type { TrackIssueKind } from '../../../hooks/useMixtapePublishing';
  import {
    mixtapeDraftState,
    setTitle,
    setDescription,
    moveTrack,
    removeFromDraftWithUndo,
  } from '../../../stores/mixtape.svelte';
  import MixtapeTrackList from './MixtapeTrackList.svelte';
  import MixtapeForm from './MixtapeForm.svelte';

  interface Props {
    statusMessage: string | null;
    statusTone: 'info' | 'success' | 'error';
    showAuthAction?: boolean;
    trackIssues?: Record<string, TrackIssueKind>;
    onResetStatus: () => void;
    onOpenPicker: () => void;
    onSignIn?: () => void;
  }

  let {
    statusMessage,
    statusTone,
    showAuthAction = false,
    trackIssues = {},
    onResetStatus,
    onOpenPicker,
    onSignIn,
  }: Props = $props();

  let announcement = $state('');
  let workspaceEl = $state<HTMLDivElement | null>(null);

  function handleReorder(fromIndex: number, toIndex: number) {
    const track = mixtapeDraftState.tracks[fromIndex];
    if (!track || !moveTrack(fromIndex, toIndex)) return;
    announcement = `Moved "${track.title}" to position ${toIndex + 1} of ${mixtapeDraftState.tracks.length}.`;
  }

  function handleMove(index: number, direction: 'up' | 'down') {
    const track = mixtapeDraftState.tracks[index];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (!track) return;

    let moved = false;
    flushSync(() => {
      moved = moveTrack(index, targetIndex);
      if (moved) {
        const total = mixtapeDraftState.tracks.length;
        announcement = `Moved "${track.title}" to position ${targetIndex + 1} of ${total}.`;
      }
    });
    if (!moved || !workspaceEl) return;

    const selectorId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(track.id) : track.id;
    const row = workspaceEl.querySelector(`[data-mixtape-track-id="${selectorId}"]`);
    if (!row) return;

    const preferredLabel = direction === 'up' ? 'Move track up' : 'Move track down';
    const fallbackLabel = direction === 'up' ? 'Move track down' : 'Move track up';
    const preferredBtn = row.querySelector<HTMLButtonElement>(`button[aria-label="${preferredLabel}"]`);
    const fallbackBtn = row.querySelector<HTMLButtonElement>(`button[aria-label="${fallbackLabel}"]`);
    if (preferredBtn && !preferredBtn.disabled) {
      preferredBtn.focus();
    } else if (fallbackBtn && !fallbackBtn.disabled) {
      fallbackBtn.focus();
    }
  }

  function handleRemove(index: number) {
    const track = mixtapeDraftState.tracks[index];
    if (!track) return;
    const removed = removeFromDraftWithUndo(track.id);
    if (removed) {
      onResetStatus();
      announcement = `Removed "${track.title}" from draft.`;
    }
  }
</script>

<div
  bind:this={workspaceEl}
  role="region"
  aria-label="Mixtape builder workspace"
  class="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
>
  <MixtapeTrackList
    tracks={mixtapeDraftState.tracks}
    {trackIssues}
    {announcement}
    onReorder={handleReorder}
    onMove={handleMove}
    onRemove={handleRemove}
    {onOpenPicker}
  />

  <MixtapeForm
    draft={mixtapeDraftState}
    {statusMessage}
    {statusTone}
    {showAuthAction}
    onTitleChange={(title) => {
      onResetStatus();
      setTitle(title);
    }}
    onDescriptionChange={(desc) => {
      onResetStatus();
      setDescription(desc);
    }}
    {onSignIn}
  />
</div>
