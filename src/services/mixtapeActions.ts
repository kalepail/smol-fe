/**
 * Owner lifecycle actions for mixtapes (Report 24 §5.5–5.9): edit, save,
 * delete + 10s Undo, restore, merge. Every action:
 *   - talks to the API through services/api/mixtapes (structured errors),
 *   - shows exactly ONE toast on the `mixtape-lifecycle` channel,
 *   - invalidates the owner cache so every surface refreshes.
 * Only playlists change here: no song or owned token is ever touched.
 */
import { navigate } from 'astro:transitions/client';
import {
  deleteMixtape,
  fetchMixtapeDetail,
  listMyMixtapes,
  mergeMixtape,
  MixtapeActionError,
  restoreMixtape,
  updateMixtape,
  type MixtapeDetail,
  type MixtapeMergeResult,
  type MixtapeWriteReceipt,
  type OwnedMixtape,
} from './api/mixtapes';
import {
  appendEditTracks,
  cancelEdit,
  cancelEditFor,
  clearEditConflict,
  finishEditFor,
  mixtapeEditConflict,
  mixtapeEditState,
  openMixtapeSheet,
  rebaseEdit,
  setEditConflict,
  setEditMergeFrom,
  setEditSaving,
  startEdit,
  type EditableMixtape,
  type MergeSourceSnapshot,
  type MixtapeSheetView,
} from '../stores/mixtape.svelte';
import { checkMergeSourceDeletion } from '../stores/mixtape/operations';
import type { MixtapeTrack } from '../types/domain';
import { confirmAction } from '../stores/confirm.svelte';
import { toast } from '../stores/toast.svelte';
import { openAuthSheet } from '../stores/authSheet.svelte';
import { invalidateMyMixtapes, myMixtapesFocus, removeOwnedLocally } from '../stores/myMixtapes.svelte';
import { logger } from '../utils/logger';

export const LIFECYCLE_TAG = 'mixtape-lifecycle';
export const UNDO_WINDOW_MS = 10_000;

export const MERGE_REASSURANCE = 'Only the playlist changes. Your songs and any owned tokens aren’t touched.';
export const DELETE_REASSURANCE = 'Deletes this playlist only — none of your songs or anyone’s owned tokens are affected.';

const API_URL = import.meta.env.PUBLIC_API_URL;

export function friendlyMixtapeError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof MixtapeActionError) return error.message;
  return fallback;
}

function lifecycleError(error: unknown, fallback: string) {
  logger.error('mixtape', error);
  const message = friendlyMixtapeError(error, fallback);
  if (error instanceof MixtapeActionError && error.kind === 'auth') {
    toast.error(message, {
      tag: LIFECYCLE_TAG,
      actionLabel: 'Sign in',
      onAction: () => openAuthSheet('signin', 'Sign in again to manage your mixtapes.'),
    });
    return;
  }
  toast.error(message, { tag: LIFECYCLE_TAG });
}

export function detailToTracks(detail: Pick<MixtapeDetail, 'tracks'>): MixtapeTrack[] {
  return detail.tracks.map((track) => ({
    id: track.Id,
    title: track.Title || 'Untitled Smol',
    coverUrl: `${API_URL}/image/${track.Id}.png`,
    creator: track.Address ?? null,
    public: 1,
  }));
}

export function toEditable(detail: MixtapeDetail): EditableMixtape {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description ?? '',
    creator: detail.creator,
    createdAt: detail.createdAt,
    revision: detail.revision,
    visibility: detail.visibility,
    hiddenReason: detail.hiddenReason ?? null,
    storedTrackCount: detail.storedTrackCount,
    publicTrackCount: detail.publicTrackCount,
    tracks: detailToTracks(detail),
  };
}

type FreshDetail = { kind: 'found'; detail: MixtapeDetail } | { kind: 'gone'; merged: boolean } | { kind: 'error'; error: unknown };

/** Fresh GET /mixtapes/:id that tells a definitive 404 apart from a retryable failure (25d pass 2 P1-3). */
async function readFreshDetail(id: string): Promise<FreshDetail> {
  try {
    const result = await fetchMixtapeDetail(id, { fresh: true });
    if (result.kind === 'found') return result;
    return { kind: 'gone', merged: result.kind === 'merged' };
  } catch (error) {
    return { kind: 'error', error };
  }
}

async function loadFreshDetail(id: string): Promise<MixtapeDetail | null> {
  const result = await readFreshDetail(id);
  if (result.kind === 'found') return result.detail;
  if (result.kind === 'gone') {
    toast.error(result.merged ? 'This mixtape was merged into another mixtape.' : 'This mixtape was already deleted.', {
      tag: LIFECYCLE_TAG,
    });
    invalidateMyMixtapes([id]);
    return null;
  }
  lifecycleError(result.error, 'Couldn’t open this mixtape. Check your connection and try again.');
  return null;
}

function confirmDiscardEdit(title: string) {
  return confirmAction({
    title: `Discard changes to "${title}"?`,
    message: 'The published mixtape stays as it was.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    destructive: true,
  });
}

/**
 * Open a published mixtape in the builder (edit slot). Always loads the latest
 * server copy first (track titles, revision) unless a fresh detail is passed.
 */
export async function openMixtapeEditor(
  target: string | MixtapeDetail,
  options: {
    view?: MixtapeSheetView;
    tracks?: (detail: MixtapeDetail) => MixtapeTrack[];
    fromDraft?: boolean;
    mergeFrom?: MergeSourceSnapshot | null;
  } = {}
): Promise<'started' | 'cancelled' | 'failed'> {
  const detail = typeof target === 'string' ? await loadFreshDetail(target) : target;
  if (!detail) return 'failed';
  const result = await startEdit(toEditable(detail), {
    tracks: options.tracks?.(detail),
    fromDraft: options.fromDraft,
    mergeFrom: options.mergeFrom,
    confirmDiscard: confirmDiscardEdit,
  });
  if (result === 'started') openMixtapeSheet(options.view ?? 'builder');
  return result;
}

/** Cancel the open edit, asking first when there are unsaved changes. */
export async function cancelMixtapeEdit(dirty: boolean): Promise<boolean> {
  const session = mixtapeEditState.session;
  if (!session) return true;
  if (dirty) {
    const ok = await confirmDiscardEdit(session.title.trim() || session.baseline.title || 'this mixtape');
    if (!ok) return false;
  }
  cancelEdit();
  return true;
}

export type SaveEditOutcome =
  | { ok: true; receipt: MixtapeWriteReceipt; id: string }
  | { ok: false; error: MixtapeActionError | Error };

function sameSubmission(
  session: { title: string; description: string; tracks: { id: string }[] },
  submitted: { title: string; description: string; smols: string[] }
): boolean {
  return (
    session.title.trim() === submitted.title &&
    session.description === submitted.description &&
    session.tracks.length === submitted.smols.length &&
    session.tracks.every((track, index) => track.id === submitted.smols[index])
  );
}

function snapshotOf(row: OwnedMixtape): MergeSourceSnapshot {
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    trackIds: row.trackIds,
    storedTrackCount: row.storedTrackCount,
    publicTrackCount: row.publicTrackCount,
  };
}

/** Fresh owner-list read of one mixtape: snapshot, null when gone, 'error' when unreadable. */
async function readFreshSource(id: string): Promise<MergeSourceSnapshot | null | 'error'> {
  try {
    const mine = await listMyMixtapes();
    const row = mine.find((item) => item.id === id);
    return row ? snapshotOf(row) : null;
  } catch {
    return 'error';
  }
}

const songsText = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

/**
 * Gate for "Save & delete copy" (25d pass 2 P1-1/P1-2): re-reads the source and only
 * allows deleting it when it is exactly the reviewed revision, has no private /
 * unavailable songs, and every one of its songs is in the target being saved.
 * Otherwise the source is kept, the edit is updated for re-review, and a
 * `merge_review` error explains what changed.
 */
async function verifyMergeSource(
  owner: string,
  mixtapeId: string,
  reviewed: MergeSourceSnapshot,
  targetTrackIds: string[],
  stage: 'before' | 'after'
): Promise<{ ok: true } | { ok: false; error: MixtapeActionError }> {
  const fresh = await readFreshSource(reviewed.id);
  if (fresh === 'error') {
    return {
      ok: false,
      error: new MixtapeActionError(
        `Couldn’t check "${reviewed.title}" right now, so it was kept. Try again in a moment.`,
        'network',
        { code: 'merge_source_unverified' }
      ),
    };
  }
  const check = checkMergeSourceDeletion(reviewed, fresh, targetTrackIds);
  if (check.ok) return { ok: true };
  if (check.reason === 'gone') {
    // Nothing left to delete: finish as a normal edit.
    setEditMergeFrom(owner, mixtapeId, null);
    return { ok: true };
  }
  if (check.reason === 'changed') {
    if (stage === 'before') {
      // Bring the source's newer songs into the editor for review; the delete waits for the next save.
      const added = await tracksForIds(check.fresh.id, check.newTrackIds);
      if (added) appendEditTracks(owner, mixtapeId, added);
      setEditMergeFrom(owner, mixtapeId, check.fresh);
    } else {
      setEditMergeFrom(owner, mixtapeId, null);
    }
    return {
      ok: false,
      error: new MixtapeActionError(
        stage === 'before'
          ? `"${reviewed.title}" changed on another device, so it wasn’t deleted. ${
              check.newTrackIds.length ? `Its ${songsText(check.newTrackIds.length)} were added here — review` : 'Review'
            } and save again.`
          : `"${reviewed.title}" changed while saving, so it was kept. Merge it again to review its latest songs.`,
        'invalid',
        { code: 'merge_source_changed' }
      ),
    };
  }
  if (check.reason === 'unavailable') {
    setEditMergeFrom(owner, mixtapeId, null);
    return {
      ok: false,
      error: new MixtapeActionError(
        `"${reviewed.title}" has ${songsText(check.count)} that ${check.count === 1 ? 'isn’t' : 'aren’t'} public right now, so it can’t be deleted in this merge. Save to update this mixtape — "${reviewed.title}" will be kept.`,
        'invalid',
        { code: 'merge_source_unavailable' }
      ),
    };
  }
  return {
    ok: false,
    error: new MixtapeActionError(
      `${songsText(check.missingIds.length)} from "${reviewed.title}" ${check.missingIds.length === 1 ? 'isn’t' : 'aren’t'} in this mixtape, so deleting "${reviewed.title}" would lose ${
        check.missingIds.length === 1 ? 'it' : 'them'
      }. Add ${check.missingIds.length === 1 ? 'it' : 'them'} back, or save without deleting.`,
      'invalid',
      { code: 'merge_source_missing' }
    ),
  };
}

/** Track rows (titles/covers) for some of a mixtape's song ids, via its fresh detail. */
async function tracksForIds(mixtapeId: string, ids: string[]): Promise<MixtapeTrack[] | null> {
  if (!ids.length) return [];
  const result = await readFreshDetail(mixtapeId);
  if (result.kind !== 'found') return null;
  const wanted = new Set(ids);
  return detailToTracks(result.detail).filter((track) => wanted.has(track.id));
}

/** Keep the edit as a normal edit (drop the pending source deletion). */
export function saveWithoutDeletingSource() {
  const session = mixtapeEditState.session;
  if (session) setEditMergeFrom(session.creator, session.mixtapeId, null);
}

/**
 * PUT the open edit with `expectedRevision`. The edit slot is FROZEN while the
 * request is in flight and every completion is bound to the (owner, mixtape) that
 * submitted it, so an account or slot switch mid-request can never clear the
 * wrong slot (25d P1-3, pass 2 P1-4). 409 is returned (not toasted twice) for
 * inline recovery.
 */
export async function saveMixtapeEdit(): Promise<SaveEditOutcome> {
  const session = mixtapeEditState.session;
  if (!session) return { ok: false, error: new Error('Nothing to save.') };
  const title = session.title.trim();
  if (!title) return { ok: false, error: new MixtapeActionError('Give your mixtape a name.', 'invalid') };
  if (session.tracks.length === 0) {
    return { ok: false, error: new MixtapeActionError('Add at least one song, or delete the mixtape instead.', 'invalid') };
  }

  const id = session.mixtapeId;
  const owner = session.creator;
  const wasHidden = session.baselineVisibility === 'owner';
  const submitted = {
    title,
    description: session.description,
    smols: session.tracks.map((track) => track.id),
    expectedRevision: session.revision,
  };
  const submittedTracks = session.tracks.map((track) => ({ ...track }));
  const slotIs = (s: { creator: string; mixtapeId: string } | null) => Boolean(s && s.creator === owner && s.mixtapeId === id);

  setEditSaving({ owner, mixtapeId: id });
  let receipt: MixtapeWriteReceipt;
  let mergeFrom = session.mergeFrom ?? null;
  try {
    if (mergeFrom) {
      // Never PUT a merge whose source changed under the review: re-check first.
      const gate = await verifyMergeSource(owner, id, mergeFrom, submitted.smols, 'before');
      if (!gate.ok) {
        setEditSaving(null);
        return { ok: false, error: gate.error };
      }
      mergeFrom = mixtapeEditState.session && slotIs(mixtapeEditState.session) ? mixtapeEditState.session.mergeFrom ?? null : mergeFrom;
    }
    receipt = await updateMixtape(id, submitted);
  } catch (error) {
    setEditSaving(null);
    logger.error('mixtape', error);
    if (error instanceof MixtapeActionError) {
      if (error.kind === 'revision_conflict') {
        setEditConflict(id, error.current?.revision ?? null);
        toast.error(`"${title}" was changed on another device.`, {
          tag: LIFECYCLE_TAG,
          duration: 8000,
          actionLabel: 'Load latest',
          onAction: () => void loadLatestEdit(),
        });
      } else if (error.kind === 'not_found' || error.kind === 'merged') {
        // Deleted-state recovery (concurrent_delete / conflict without a current row).
        cancelEditFor(owner, id);
        removeOwnedLocally(id);
        invalidateMyMixtapes([id]);
        toast.error(error.message, { tag: LIFECYCLE_TAG });
      }
      return { ok: false, error };
    }
    return { ok: false, error: new MixtapeActionError('Couldn’t save right now. Your changes are saved on this device.', 'server') };
  }
  setEditSaving(null);

  // Bound to the submitting slot: look it up by (owner, mixtape), never "whatever is active".
  const live = mixtapeEditState.session && slotIs(mixtapeEditState.session) ? mixtapeEditState.session : null;
  if (live && !sameSubmission(live, submitted)) {
    // Defensive: never drop local changes that are not what the server stored.
    rebaseEdit(
      {
        id,
        title,
        description: submitted.description,
        creator: owner,
        revision: receipt.revision,
        visibility: receipt.visibility,
        hiddenReason: receipt.hiddenReason,
        tracks: submittedTracks,
      },
      { keepLocal: true, owner }
    );
    invalidateMyMixtapes([id]);
    toast.info(`Saved "${title}". Your newer changes are still here — save again to keep them.`, { tag: LIFECYCLE_TAG });
    return { ok: true, receipt, id };
  }

  finishEditFor(owner, id);
  invalidateMyMixtapes([id]);

  if (mergeFrom) {
    // Re-check right before deleting: the source must still be exactly what was reviewed.
    const gate = await verifyMergeSource(owner, id, mergeFrom, submitted.smols, 'after');
    if (!gate.ok) {
      toast.info(`Saved "${title}". ${gate.error.message}`, { tag: LIFECYCLE_TAG, duration: 10_000 });
      return { ok: true, receipt, id };
    }
    try {
      await deleteMixtape(mergeFrom.id);
      const source = mergeFrom;
      removeOwnedLocally(source.id);
      invalidateMyMixtapes([id, source.id]);
      // Never leave the owner on the copy that was just deleted.
      if (typeof window !== 'undefined' && window.location.pathname === `/mixtapes/${source.id}`) {
        await navigate(`/mixtapes/${encodeURIComponent(id)}`);
      }
      toast.success(`Saved "${title}" and deleted the copy "${source.title}".`, {
        tag: LIFECYCLE_TAG,
        duration: UNDO_WINDOW_MS,
        actionLabel: 'Undo',
        focusAction: true,
        onAction: () => void undoDelete(source.id, source.title),
      });
    } catch (error) {
      lifecycleError(error, `Saved "${title}", but couldn’t delete "${mergeFrom.title}". Delete it from Your mixtapes.`);
    }
    return { ok: true, receipt, id };
  }

  if (receipt.visibility === 'owner') {
    toast.info(`Saved "${title}". It’s hidden from the Mixtapes page — open it to see why.`, {
      tag: LIFECYCLE_TAG,
      actionLabel: 'Open',
      onAction: () => void navigate(`/mixtapes/${encodeURIComponent(id)}`),
    });
  } else if (wasHidden) {
    toast.success(`Saved. "${title}" is back on the Mixtapes page.`, { tag: LIFECYCLE_TAG });
  } else {
    toast.success(`Saved "${title}".`, { tag: LIFECYCLE_TAG });
  }
  return { ok: true, receipt, id };
}

/**
 * 409 recovery: discard local edits and load the latest server copy (clears the
 * conflict everywhere). Only a DEFINITIVE 404 closes the edit; a 503 / network
 * failure keeps the dirty edit and the conflict choices (25d pass 2 P1-3). A
 * pending merge deletion is cancelled: the reloaded target no longer holds the
 * reviewed source songs (pass 2 P1-1).
 */
export async function loadLatestEdit(): Promise<boolean> {
  const session = mixtapeEditState.session;
  if (!session) return false;
  const owner = session.creator;
  const id = session.mixtapeId;
  const result = await readFreshDetail(id);
  if (result.kind === 'gone') {
    cancelEditFor(owner, id);
    invalidateMyMixtapes([id]);
    toast.error(result.merged ? 'This mixtape was merged into another mixtape.' : 'This mixtape was deleted on another device.', {
      tag: LIFECYCLE_TAG,
    });
    return false;
  }
  if (result.kind === 'error') {
    toast.error('Couldn’t load the latest version. Your changes are still here — try again.', {
      tag: LIFECYCLE_TAG,
      duration: 8000,
      actionLabel: 'Try again',
      onAction: () => void loadLatestEdit(),
    });
    return false;
  }
  const live = mixtapeEditState.session;
  if (!live || live.creator !== owner || live.mixtapeId !== id) return false;
  const pendingMerge = live.mergeFrom ?? null;
  rebaseEdit(toEditable(result.detail), { owner });
  if (pendingMerge) setEditMergeFrom(owner, id, null);
  clearEditConflict();
  toast.info(
    pendingMerge
      ? `Loaded the latest "${result.detail.title}". The merge with "${pendingMerge.title}" was cancelled — it’s kept as is. Merge again to review it.`
      : `Loaded the latest "${result.detail.title}".`,
    { tag: LIFECYCLE_TAG, duration: pendingMerge ? 10_000 : 4000 }
  );
  return true;
}

/** 409 recovery: keep local edits, adopt the server's revision, and save again. */
export async function saveMineAnyway(): Promise<SaveEditOutcome> {
  const session = mixtapeEditState.session;
  if (!session) return { ok: false, error: new Error('Nothing to save.') };
  let revision = mixtapeEditConflict.mixtapeId === session.mixtapeId ? mixtapeEditConflict.revision : null;
  if (!revision) {
    const fresh = await readFreshDetail(session.mixtapeId);
    if (fresh.kind === 'found') revision = fresh.detail.revision ?? null;
  }
  if (revision) session.revision = revision;
  clearEditConflict();
  return saveMixtapeEdit();
}

export interface DeletableMixtape {
  id: string;
  title: string;
  hiddenReason?: string | null;
}

/**
 * Confirm → soft delete → (optionally navigate) → 10s Undo toast.
 * Returns true when the mixtape was deleted.
 */
export async function deleteMixtapeWithUndo(
  mixtape: DeletableMixtape,
  options: { navigateTo?: string; onDeleted?: () => void } = {}
): Promise<boolean> {
  const title = mixtape.title.trim() || 'Untitled mixtape';
  const isCopy = mixtape.hiddenReason === 'duplicate' || mixtape.hiddenReason === 'superseded';
  const confirmed = await confirmAction({
    title: isCopy ? `Delete this copy of "${title}"?` : `Delete "${title}"?`,
    message: 'This deletes the mixtape and its share link. You can undo for a few seconds.',
    note: DELETE_REASSURANCE,
    confirmLabel: isCopy ? 'Delete this copy' : 'Delete mixtape',
    cancelLabel: 'Keep it',
    destructive: true,
  });
  if (!confirmed) return false;

  try {
    await deleteMixtape(mixtape.id);
  } catch (error) {
    if (error instanceof MixtapeActionError && error.kind === 'not_found') {
      removeOwnedLocally(mixtape.id);
      invalidateMyMixtapes([mixtape.id]);
    }
    lifecycleError(error, 'Couldn’t delete this mixtape. Please try again.');
    return false;
  }

  if (mixtapeEditState.session?.mixtapeId === mixtape.id) cancelEdit();
  removeOwnedLocally(mixtape.id);
  invalidateMyMixtapes([mixtape.id]);
  options.onDeleted?.();
  if (options.navigateTo) await navigate(options.navigateTo);

  toast.info(`Deleted "${title}".`, {
    tag: LIFECYCLE_TAG,
    duration: UNDO_WINDOW_MS,
    actionLabel: 'Undo',
    focusAction: true,
    onAction: () => void undoDelete(mixtape.id, title),
  });
  return true;
}

export async function undoDelete(id: string, title: string): Promise<boolean> {
  try {
    await restoreMixtape(id);
  } catch (error) {
    lifecycleError(error, 'Couldn’t restore this mixtape. Please try again.');
    return false;
  }
  // Focus the restored card once it is back in Your mixtapes (25d P2-7).
  myMixtapesFocus.id = id;
  invalidateMyMixtapes([id]);
  toast.success(`Restored "${title}".`, {
    tag: LIFECYCLE_TAG,
    actionLabel: 'Open',
    onAction: () => void navigate(`/mixtapes/${encodeURIComponent(id)}`),
  });
  return true;
}

/**
 * Merge `source` into `target`. Throws MixtapeActionError so the merge sheet can
 * render 409 merge_unavailable_tracks / >100 inline; success toasts + refreshes.
 */
export async function mergeMixtapes(
  source: { id: string; title: string },
  target: { id: string; title: string },
  options: { navigateTo?: string } = {}
): Promise<MixtapeMergeResult> {
  const result = await mergeMixtape(source.id, target.id);
  if (mixtapeEditState.session?.mixtapeId === source.id) cancelEdit();
  removeOwnedLocally(source.id);

  if (result.targetDeletedConcurrently) {
    // The merge committed, but the target is gone: never link to it (25d P2-3).
    removeOwnedLocally(target.id);
    invalidateMyMixtapes([source.id, target.id]);
    await navigate('/mixtapes?view=yours');
    toast.info(
      `Merged "${source.title}" into "${target.title}", but "${target.title}" was deleted at the same moment. Check Your mixtapes.`,
      { tag: LIFECYCLE_TAG, duration: 10_000 }
    );
    return result;
  }

  invalidateMyMixtapes([source.id, target.id]);
  if (options.navigateTo) await navigate(options.navigateTo);
  const added = result.addedCount;
  const message = `Merged into "${target.title}". ${added === 0 ? 'Every song was already there.' : `${added} ${added === 1 ? 'song' : 'songs'} added.`}`;
  if (options.navigateTo) {
    // Already on the target: offer the next useful step and move focus to it (Report 24 §7).
    toast.success(message, {
      tag: LIFECYCLE_TAG,
      actionLabel: 'Your mixtapes',
      focusAction: true,
      onAction: () => void navigate('/mixtapes?view=yours'),
    });
  } else {
    toast.success(message, {
      tag: LIFECYCLE_TAG,
      actionLabel: 'Open',
      focusAction: true,
      onAction: () => void navigate(`/mixtapes/${encodeURIComponent(target.id)}`),
    });
  }
  return result;
}

/**
 * Merge sheet "Review in editor first" (Report 24 §5.5): open the TARGET with
 * the source's missing songs appended; saving it also deletes the source copy.
 */
export async function reviewMergeInEditor(source: { id: string; title: string }, targetId: string): Promise<boolean> {
  const sourceDetail = await loadFreshDetail(source.id);
  if (!sourceDetail) return false;
  const sourceTracks = detailToTracks(sourceDetail);
  // Snapshot exactly what is being reviewed (25d pass 2 P1-2): revision + songs + private count.
  const reviewed: MergeSourceSnapshot = {
    id: sourceDetail.id,
    title: sourceDetail.title,
    revision: sourceDetail.revision ?? 0,
    trackIds: sourceTracks.map((track) => track.id),
    storedTrackCount: sourceDetail.storedTrackCount ?? sourceTracks.length,
    publicTrackCount: sourceDetail.publicTrackCount ?? sourceTracks.length,
  };
  const result = await openMixtapeEditor(targetId, {
    mergeFrom: reviewed,
    tracks: (detail) => {
      const base = detailToTracks(detail);
      const have = new Set(base.map((track) => track.id));
      return [...base, ...sourceTracks.filter((track) => !have.has(track.id))];
    },
  });
  return result === 'started';
}
