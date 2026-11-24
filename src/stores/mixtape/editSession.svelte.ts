/**
 * Edit-session lifecycle for the two-slot builder store (start, save lock, finish/cancel bound to
 * (owner, mixtapeId), rebase, conflict, publish lock + durable consume). Imported ONLY by lazily
 * loaded code (builder sheet, lifecycle actions) so none of it ships in the Home bundle.
 */
import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';
import { userState } from '../user.svelte';
import { loadDraftFromStorage, loadEditSlot, persistDraft, persistEditSlot } from './persistence';
import {
  dedupeTracks,
  draftPayloadKey,
  isEditSessionDirty,
  type MergeSourceSnapshot,
  type MixtapeEditSession,
} from './operations';
import {
  clearDraft,
  currentEdit,
  editIsLocked,
  editSlots,
  flushPendingPersist,
  mixtapeCreateLock,
  mixtapeDraftState,
  mixtapeEditConflict,
  mixtapeEditLock,
  onSlotSwitch,
  persistOwner,
} from './state.svelte';

/**
 * After a successful create POST: consume the draft ONLY if the durable copy (which another tab
 * may have changed while the POST was in flight) and this tab's copy are still exactly the
 * published payload (25d pass 3 P1-3). Otherwise the newer durable draft is kept and shown.
 */
export function consumePublishedDraft(submitted: MixtapeDraft): 'cleared' | 'kept' {
  const published = draftPayloadKey(submitted);
  const durable = loadDraftFromStorage();
  if (durable && draftPayloadKey(durable) !== published) {
    mixtapeDraftState.draftId = durable.draftId || mixtapeDraftState.draftId;
    mixtapeDraftState.title = durable.title;
    mixtapeDraftState.description = durable.description;
    mixtapeDraftState.tracks = durable.tracks;
    mixtapeDraftState.updatedAt = durable.updatedAt;
    return 'kept';
  }
  if (draftPayloadKey(mixtapeDraftState) !== published) {
    persistDraft(mixtapeDraftState);
    return 'kept';
  }
  clearDraft();
  return 'cleared';
}

/** Minimal published-mixtape shape needed to open an edit session. */
export interface EditableMixtape {
  id: string;
  title: string;
  description: string;
  creator: string;
  createdAt?: string;
  revision?: number;
  visibility?: 'public' | 'owner';
  hiddenReason?: string | null;
  storedTrackCount?: number;
  publicTrackCount?: number;
  tracks: MixtapeTrack[];
}

export interface StartEditOptions {
  /** Override the starting track list (e.g. the match's songs + the draft's new ones). */
  tracks?: MixtapeTrack[];
  /** Started from the create draft ("Edit X instead"): a successful save consumes the draft. */
  fromDraft?: boolean;
  /** "Review in editor first" from the merge sheet: saving also deletes this (reviewed) source copy. */
  mergeFrom?: MergeSourceSnapshot | null;
  /** Ask before discarding a dirty edit of a different mixtape (UI supplies the dialog). */
  confirmDiscard?: (title: string) => Promise<boolean>;
}

/**
 * Open a published mixtape in the signed-in owner's edit slot. Re-opening the
 * mixtape that is already being edited keeps its unsaved changes. Refuses any
 * mixtape the signed-in account does not own.
 */
export async function startEdit(mixtape: EditableMixtape, options: StartEditOptions = {}): Promise<'started' | 'cancelled'> {
  const owner = userState.contractId;
  if (!owner || mixtape.creator !== owner) return 'cancelled';
  const current = currentEdit();
  if (current && editIsLocked(current.creator, current.mixtapeId)) return 'cancelled';
  if (current && current.mixtapeId === mixtape.id && !options.tracks && !options.mergeFrom && isEditSessionDirty(current)) {
    return 'started';
  }
  if (current && isEditSessionDirty(current) && (current.mixtapeId !== mixtape.id || options.tracks) && options.confirmDiscard) {
    const ok = await options.confirmDiscard(current.title.trim() || current.baseline.title || 'this mixtape');
    if (!ok) return 'cancelled';
  }
  // The account may have changed while the dialog was open.
  if (userState.contractId !== owner) return 'cancelled';

  flushPendingPersist();
  onSlotSwitch();
  const baselineTracks = dedupeTracks(mixtape.tracks);
  const stored = mixtape.storedTrackCount ?? baselineTracks.length;
  const publicCount = mixtape.publicTrackCount ?? baselineTracks.length;
  const session: MixtapeEditSession = {
    kind: 'edit',
    draftId: `edit-${mixtape.id}`,
    mixtapeId: mixtape.id,
    creator: owner,
    createdAt: mixtape.createdAt ?? '',
    revision: mixtape.revision && mixtape.revision > 0 ? mixtape.revision : 1,
    title: mixtape.title,
    description: mixtape.description ?? '',
    tracks: options.tracks ? dedupeTracks(options.tracks) : baselineTracks,
    updatedAt: new Date().toISOString(),
    baseline: {
      title: mixtape.title,
      description: mixtape.description ?? '',
      trackIds: baselineTracks.map((track) => track.id),
    },
    baselineVisibility: mixtape.visibility ?? null,
    baselineHiddenReason: mixtape.hiddenReason ?? null,
    privateTrackCount: Math.max(0, stored - publicCount),
    fromDraft: options.fromDraft === true,
    mergeFrom: options.mergeFrom ?? null,
  };
  editSlots.byOwner[owner] = session;
  clearEditConflict();
  persistOwner(owner);
  return 'started';
}

/**
 * Drop exactly one owner's edit of one mixtape (no-op if that slot now holds something else).
 * Every async completion (PUT, delete, merge) uses this with the identity it started with, so
 * an account or slot switch mid-request can never clear the wrong slot (25d pass 2 P1-4).
 */
export function cancelEditFor(owner: string, mixtapeId: string): boolean {
  const session = editSlots.byOwner[owner];
  if (!session || session.mixtapeId !== mixtapeId) return false;
  // Our own pending keystrokes must reach storage first, so the durable check below compares like with like.
  if (userState.contractId === owner) flushPendingPersist();
  const expectedUpdatedAt = session.updatedAt;
  delete editSlots.byOwner[owner];
  // Cross-tab durable check (25d pass 3 P1-2): another tab of the SAME account may have parked a
  // different mixtape (or a newer edit of this one) under this owner's key meanwhile. Only remove
  // the stored value if it is still exactly ours; adopt another tab's different parked edit.
  const durable = loadEditSlot(owner);
  if (!durable || (durable.mixtapeId === mixtapeId && durable.updatedAt === expectedUpdatedAt)) {
    persistEditSlot(owner, null);
  } else if (durable.mixtapeId !== mixtapeId) {
    editSlots.byOwner[owner] = durable;
  }
  if (editIsLocked(owner, mixtapeId)) {
    mixtapeEditLock.owner = null;
    mixtapeEditLock.mixtapeId = null;
  }
  if (mixtapeEditConflict.mixtapeId === mixtapeId) clearEditConflict();
  if (userState.contractId === owner) onSlotSwitch();
  return true;
}

/** Drop the signed-in owner's edit slot without saving (Cancel). The create draft comes back. */
export function cancelEdit() {
  const edit = currentEdit();
  if (edit) cancelEditFor(edit.creator, edit.mixtapeId);
  else clearEditConflict();
}

/** Close one specific edit slot after its successful save. A draft that fed it is consumed. */
export function finishEditFor(owner: string, mixtapeId: string): boolean {
  const consumedDraft = editSlots.byOwner[owner]?.mixtapeId === mixtapeId && editSlots.byOwner[owner]?.fromDraft === true;
  const closed = cancelEditFor(owner, mixtapeId);
  if (closed && consumedDraft) clearDraft();
  return closed;
}

/** Close the signed-in owner's edit after a successful save. */
export function finishEdit() {
  const edit = currentEdit();
  if (edit) finishEditFor(edit.creator, edit.mixtapeId);
}

/** Freeze (or release) one owner's edit while its PUT is in flight. */
export function setEditSaving(target: { owner: string; mixtapeId: string } | null) {
  if (target) flushPendingPersist();
  mixtapeEditLock.owner = target?.owner ?? null;
  mixtapeEditLock.mixtapeId = target?.mixtapeId ?? null;
}

/** Freeze (or release) the create draft while its POST is in flight. */
export function setCreatePublishing(draftId: string | null) {
  if (draftId) flushPendingPersist();
  mixtapeCreateLock.draftId = draftId;
}

/** Replace (or clear) the reviewed merge source of one owner's edit. */
export function setEditMergeFrom(owner: string, mixtapeId: string, mergeFrom: MergeSourceSnapshot | null) {
  const session = editSlots.byOwner[owner];
  if (!session || session.mixtapeId !== mixtapeId) return;
  session.mergeFrom = mergeFrom;
  persistOwner(owner);
}


export function setEditConflict(mixtapeId: string, revision: number | null) {
  mixtapeEditConflict.mixtapeId = mixtapeId;
  mixtapeEditConflict.revision = revision;
}

export function clearEditConflict() {
  mixtapeEditConflict.mixtapeId = null;
  mixtapeEditConflict.revision = null;
}

/** Point one owner's edit at a newer server copy (409 "Load latest" or after a save). */
export function rebaseEdit(mixtape: EditableMixtape, options: { keepLocal?: boolean; owner?: string } = {}) {
  const owner = options.owner ?? userState.contractId;
  const session = owner ? editSlots.byOwner[owner] : null;
  if (!owner || !session || session.mixtapeId !== mixtape.id) return;
  const tracks = dedupeTracks(mixtape.tracks);
  session.revision = mixtape.revision && mixtape.revision > 0 ? mixtape.revision : session.revision;
  session.baseline = {
    title: mixtape.title,
    description: mixtape.description ?? '',
    trackIds: tracks.map((track) => track.id),
  };
  session.baselineVisibility = mixtape.visibility ?? session.baselineVisibility;
  session.baselineHiddenReason = mixtape.hiddenReason ?? null;
  if (!options.keepLocal) {
    session.title = mixtape.title;
    session.description = mixtape.description ?? '';
    session.tracks = tracks;
    onSlotSwitch();
  }
  session.updatedAt = new Date().toISOString();
  persistOwner(owner);
}

/** Snapshot of whichever slot is active (edit ?? create). */
export function getActiveSnapshot(): MixtapeDraft {
  const session = currentEdit() ?? mixtapeDraftState;
  return {
    draftId: session.draftId,
    title: session.title,
    description: session.description,
    tracks: session.tracks.map((track) => ({ ...track })),
    updatedAt: session.updatedAt,
  };
}

