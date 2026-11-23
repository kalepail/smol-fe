<script lang="ts">
  import { flushSync } from 'svelte';
  import type { TrackIssueKind } from '../../../hooks/useMixtapePublishing';
  import {
    mixtapeActive,
    mixtapeEditState,
    setTitle,
    setDescription,
    moveTrack,
    removeFromDraftWithUndo,
  } from '../../../stores/mixtape.svelte';
  import MixtapeTrackList from './MixtapeTrackList.svelte';
  import MixtapeForm from './MixtapeForm.svelte';
  import Icon from '../../ui/Icon.svelte';

  interface Props {
    statusMessage: string | null;
    statusTone: 'info' | 'success' | 'error';
    showAuthAction?: boolean;
    trackIssues?: Record<string, TrackIssueKind>;
    onResetStatus: () => void;
    onOpenPicker: () => void;
    onSignIn?: () => void;
    titleError?: string | null;
    sameTitleHint?: string | null;
    onDelete?: () => void;
  }

  let {
    statusMessage,
    statusTone,
    showAuthAction = false,
    trackIssues = {},
    onResetStatus,
    onOpenPicker,
    onSignIn,
    titleError = null,
    sameTitleHint = null,
    onDelete,
  }: Props = $props();

  // Every op targets the active session (edit ?? create).
  const session = $derived(mixtapeActive.current);
  const edit = $derived(mixtapeEditState.session);
  const baselineIds = $derived(edit ? new Set(edit.baseline.trackIds) : null);

  let announcement = $state('');
  let workspaceEl = $state<HTMLDivElement | null>(null);

  function handleReorder(fromIndex: number, toIndex: number) {
    const track = session.tracks[fromIndex];
    if (!track || !moveTrack(fromIndex, toIndex)) return;
    announcement = `Moved "${track.title}" to position ${toIndex + 1} of ${session.tracks.length}.`;
  }

  function handleMove(index: number, direction: 'up' | 'down') {
    const track = session.tracks[index];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (!track) return;

    let moved = false;
    flushSync(() => {
      moved = moveTrack(index, targetIndex);
      if (moved) {
        const total = session.tracks.length;
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
    const track = session.tracks[index];
    if (!track) return;
    const removed = removeFromDraftWithUndo(track.id);
    if (removed) {
      onResetStatus();
      announcement = `Removed "${track.title}" from ${edit ? 'this mixtape' : 'draft'}.`;
    }
  }
</script>

<div
  bind:this={workspaceEl}
  role="region"
  aria-label="Mixtape builder workspace"
  class="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
>
  <div class="flex min-w-0 flex-col gap-3">
  {#if edit && edit.privateTrackCount > 0}
    <p class="flex gap-2 rounded-[var(--radius-control)] bg-surface-1 px-3 py-2.5 text-xs leading-relaxed text-ink-2 ring-1 ring-inset ring-line">
      <Icon name="info" size={16} class="mt-px text-ink-2" />
      <span>
        {edit.privateTrackCount} {edit.privateTrackCount === 1 ? 'song in this mixtape is' : 'songs in this mixtape are'} no longer public and will be removed when you save.
      </span>
    </p>
  {/if}
  <MixtapeTrackList
    tracks={session.tracks}
    {baselineIds}
    {trackIssues}
    {announcement}
    onReorder={handleReorder}
    onMove={handleMove}
    onRemove={handleRemove}
    {onOpenPicker}
  />
  {#if edit}
    <p class="px-1 text-xs leading-relaxed text-ink-3">Removing a song only takes it off this mixtape.</p>
  {/if}
  </div>

  <MixtapeForm
    draft={session}
    mode={edit ? 'edit' : 'create'}
    {titleError}
    {sameTitleHint}
    {onDelete}
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
