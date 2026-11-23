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
  cancelEdit,
  finishEdit,
  mixtapeEditState,
  openMixtapeSheet,
  rebaseEdit,
  startEdit,
  type EditableMixtape,
  type MixtapeSheetView,
} from '../stores/mixtape.svelte';
import type { MixtapeTrack } from '../types/domain';
import { confirmAction } from '../stores/confirm.svelte';
import { toast } from '../stores/toast.svelte';
import { openAuthSheet } from '../stores/authSheet.svelte';
import { invalidateMyMixtapes, removeOwnedLocally } from '../stores/myMixtapes.svelte';
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

async function loadFreshDetail(id: string): Promise<MixtapeDetail | null> {
  try {
    const result = await fetchMixtapeDetail(id, { fresh: true });
    if (result.kind === 'found') return result.detail;
    toast.error(
      result.kind === 'merged' ? 'This mixtape was merged into another mixtape.' : 'This mixtape was already deleted.',
      { tag: LIFECYCLE_TAG }
    );
    invalidateMyMixtapes([id]);
    return null;
  } catch (error) {
    lifecycleError(error, 'Couldn’t open this mixtape. Check your connection and try again.');
    return null;
  }
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
  options: { view?: MixtapeSheetView; tracks?: (detail: MixtapeDetail) => MixtapeTrack[]; fromDraft?: boolean } = {}
): Promise<'started' | 'cancelled' | 'failed'> {
  const detail = typeof target === 'string' ? await loadFreshDetail(target) : target;
  if (!detail) return 'failed';
  const result = await startEdit(toEditable(detail), {
    tracks: options.tracks?.(detail),
    fromDraft: options.fromDraft,
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

/** PUT the open edit session with `expectedRevision`. 409 is returned (not toasted twice) for inline recovery. */
export async function saveMixtapeEdit(): Promise<SaveEditOutcome> {
  const session = mixtapeEditState.session;
  if (!session) return { ok: false, error: new Error('Nothing to save.') };
  const title = session.title.trim();
  if (!title) return { ok: false, error: new MixtapeActionError('Give your mixtape a name.', 'invalid') };
  if (session.tracks.length === 0) {
    return { ok: false, error: new MixtapeActionError('Add at least one song, or delete the mixtape instead.', 'invalid') };
  }

  const id = session.mixtapeId;
  const wasHidden = session.baselineVisibility === 'owner';
  try {
    const receipt = await updateMixtape(id, {
      title,
      description: session.description,
      smols: session.tracks.map((track) => track.id),
      expectedRevision: session.revision,
    });
    finishEdit();
    invalidateMyMixtapes([id]);
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
  } catch (error) {
    logger.error('mixtape', error);
    if (error instanceof MixtapeActionError) {
      if (error.kind === 'revision_conflict') {
        toast.error(`"${title}" was changed on another device.`, {
          tag: LIFECYCLE_TAG,
          duration: 8000,
          actionLabel: 'Load latest',
          onAction: () => void loadLatestEdit(),
        });
      } else if (error.kind === 'not_found' || error.kind === 'merged') {
        cancelEdit();
        invalidateMyMixtapes([id]);
        toast.error(error.message, { tag: LIFECYCLE_TAG });
      }
      return { ok: false, error };
    }
    return { ok: false, error: new MixtapeActionError('Couldn’t save right now. Your changes are saved on this device.', 'server') };
  }
}

/** 409 recovery: discard local edits and load the latest server copy. */
export async function loadLatestEdit(): Promise<boolean> {
  const session = mixtapeEditState.session;
  if (!session) return false;
  const detail = await loadFreshDetail(session.mixtapeId);
  if (!detail) return false;
  rebaseEdit(toEditable(detail));
  toast.info(`Loaded the latest "${detail.title}".`, { tag: LIFECYCLE_TAG });
  return true;
}

/** 409 recovery: keep local edits, adopt the server's revision, and save again. */
export async function saveMineAnyway(current: OwnedMixtape | null | undefined): Promise<SaveEditOutcome> {
  const session = mixtapeEditState.session;
  if (!session) return { ok: false, error: new Error('Nothing to save.') };
  let revision = current?.revision;
  if (!revision) {
    try {
      const fresh = await fetchMixtapeDetail(session.mixtapeId, { fresh: true });
      if (fresh.kind === 'found') revision = fresh.detail.revision;
    } catch {
      // fall through: the save below reports the problem
    }
  }
  if (revision) session.revision = revision;
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
  invalidateMyMixtapes([source.id, target.id]);
  if (options.navigateTo) await navigate(options.navigateTo);
  const added = result.addedCount;
  toast.success(
    `Merged into "${target.title}". ${added === 0 ? 'Every song was already there.' : `${added} ${added === 1 ? 'song' : 'songs'} added.`}`,
    {
      tag: LIFECYCLE_TAG,
      actionLabel: 'Open',
      onAction: () => void navigate(`/mixtapes/${encodeURIComponent(target.id)}`),
    }
  );
  return result;
}
