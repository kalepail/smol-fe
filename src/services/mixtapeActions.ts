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
  mixtapeEditConflict,
  mixtapeEditState,
  openMixtapeSheet,
  type MergeSourceSnapshot,
  type MixtapeSheetView,
} from '../stores/mixtape.svelte';
import {
  cancelEdit,
  cancelEditFor,
  clearEditConflict,
  finishEditFor,
  rebaseEdit,
  setEditConflict,
  setEditMergeFrom,
  setEditSaving,
  startEdit,
  type EditableMixtape,
} from '../stores/mixtape/editSession.svelte';
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
  | { ok: true; receipt: MixtapeWriteReceipt; id: string; stayOpen?: boolean }
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

  // A reviewed merge only ever PUTs the target: the source is never deleted from the client
  // (25d pass 3 P1-1 — no multi-request retire race can lose a song). The owner deletes it later.
  const mergeFrom = session.mergeFrom ?? null;
  setEditSaving({ owner, mixtapeId: id });
  let receipt: MixtapeWriteReceipt;
  try {
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
    return { ok: true, receipt, id, stayOpen: true };
  }

  finishEditFor(owner, id);
  invalidateMyMixtapes([id]);
  // Another tab parked a newer edit for this account (pass 4 P1-1): it was adopted, not discarded.
  const adopted = mixtapeEditState.session;
  if (adopted && adopted.creator === owner) {
    toast.info(
      `Saved "${title}". Another tab has unsaved changes to "${adopted.title.trim() || 'a mixtape'}" — they’re kept in your editor.`,
      { tag: LIFECYCLE_TAG, duration: 8000 }
    );
    return { ok: true, receipt, id };
  }

  if (mergeFrom) {
    toast.success(`Saved "${title}". "${mergeFrom.title}" was kept — you can delete it anytime from Your mixtapes.`, {
      tag: LIFECYCLE_TAG,
      duration: 10_000,
      actionLabel: 'View yours',
      focusAction: true,
      onAction: () => void navigate('/mixtapes?view=yours'),
    });
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
      ? `Loaded the latest "${result.detail.title}". The songs from "${pendingMerge.title}" weren’t added — it’s kept as is. Merge again to review them.`
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
 * Merge sheet "Review in editor first" (Report 24 §5.5): open the TARGET with the source's
 * missing songs appended. Saving PUTs the target only; the source is always kept (pass 3 P1-1).
 * Only the direct "Merge & delete copy" retires a source — atomically, server-side.
 */
export async function reviewMergeInEditor(source: { id: string; title: string }, targetId: string): Promise<boolean> {
  const sourceDetail = await loadFreshDetail(source.id);
  if (!sourceDetail) return false;
  const sourceTracks = detailToTracks(sourceDetail);
  const reviewed: MergeSourceSnapshot = { id: sourceDetail.id, title: sourceDetail.title };
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
