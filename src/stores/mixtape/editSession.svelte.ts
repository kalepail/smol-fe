/**
 * Edit-session lifecycle for the two-slot builder store (start, save lock, finish/cancel bound to
 * (owner, mixtapeId), rebase, conflict, publish lock + durable consume). Imported ONLY by lazily
 * loaded code (builder sheet, lifecycle actions) so none of it ships in the Home bundle.
 */
import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';
import { userState } from '../user.svelte';
import { toast } from '../toast.svelte';
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
  return consumeDraftIfUnchanged(draftPayloadKey(submitted));
}

/**
 * Consume the create draft only while BOTH its durable copy and this tab's copy still have the
 * given normalized payload. A newer durable draft (e.g. a song added in another tab) is kept and
 * loaded here instead. Used after a create POST and after an "Edit X instead" save (pass 4 P1-2).
 */
export function consumeDraftIfUnchanged(published: string): 'cleared' | 'kept' {
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
  /**
   * Started from the create draft ("Edit X instead"). A successful save consumes that draft only
   * while it is still the payload that was moved into this edit (pass 4 P1-2).
   */
  fromDraft?: boolean;
  /** The originating draft's payload key, captured by the caller before any await (null = never consume). */
  originDraftKey?: string | null;
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
  // Another tab may have parked a newer edit (even of this same mixtape) under this owner's key:
  // adopt it before deciding anything, so opening never overwrites it with a fresh baseline.
  adoptDivergentDurableEdit(owner);
  const current = currentEdit();
  if (current && editIsLocked(current.creator, current.mixtapeId)) return 'cancelled';
  if (current && current.mixtapeId === mixtape.id && !options.tracks && !options.mergeFrom && isEditSessionDirty(current)) {
    return 'started';
  }
  if (current && isEditSessionDirty(current) && (current.mixtapeId !== mixtape.id || options.tracks) && options.confirmDiscard) {
    // The confirmation covers ONLY the edit it names (25d pass 5 P1-2).
    const named = { mixtapeId: current.mixtapeId, updatedAt: current.updatedAt };
    const ok = await options.confirmDiscard(current.title.trim() || current.baseline.title || 'this mixtape');
    if (!ok) return 'cancelled';
    if (userState.contractId !== owner) return 'cancelled';
    // Another tab may have parked a different (or newer) edit while the dialog was open: never
    // replace what the owner didn't agree to discard — adopt it and say so.
    const durable = loadEditSlot(owner);
    if (durable && (durable.mixtapeId !== named.mixtapeId || durable.updatedAt !== named.updatedAt)) {
      editSlots.byOwner[owner] = durable;
      toast.info(
        `Another tab has newer unsaved changes to "${durable.title.trim() || 'a mixtape'}", so nothing was discarded. They’re in your editor.`,
        { tag: 'mixtape-lifecycle', duration: 8000 }
      );
      return 'cancelled';
    }
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
    // Never recomputed from the live draft here (it may have changed during the detail GET).
    // `null` from the caller means "never consume the draft" — only `undefined` falls back.
    originDraftKey: options.fromDraft
      ? options.originDraftKey !== undefined
        ? options.originDraftKey
        : draftPayloadKey(mixtapeDraftState)
      : null,
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
  // Pass 4 P1-1: ANY divergent durable edit is adopted — a different mixtape OR a newer edit of
  // this same one — never silently discarded.
  const durable = loadEditSlot(owner);
  if (!durable || (durable.mixtapeId === mixtapeId && durable.updatedAt === expectedUpdatedAt)) {
    persistEditSlot(owner, null);
  } else {
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

/**
 * Close one specific edit slot after its successful save. A create draft that fed it ("Edit X
 * instead") is consumed only if it is still exactly the payload that was moved (pass 4 P1-2).
 */
export function finishEditFor(owner: string, mixtapeId: string): boolean {
  const session = editSlots.byOwner[owner];
  const originDraftKey = session?.mixtapeId === mixtapeId && session.fromDraft ? session.originDraftKey ?? null : null;
  const closed = cancelEditFor(owner, mixtapeId);
  if (closed && originDraftKey) consumeDraftIfUnchanged(originDraftKey);
  return closed;
}

/**
 * Re-read this owner's durable edit and adopt it when it diverges from this tab's in-memory slot
 * (another tab parked something newer). This tab's own pending keystrokes are flushed first, so a
 * difference is always someone else's newer write.
 */
function adoptDivergentDurableEdit(owner: string) {
  if (userState.contractId === owner) flushPendingPersist();
  const durable = loadEditSlot(owner);
  if (!durable) return;
  const memory = editSlots.byOwner[owner];
  if (memory && memory.mixtapeId === durable.mixtapeId && memory.updatedAt === durable.updatedAt) return;
  if (memory && editIsLocked(owner, memory.mixtapeId)) return; // never swap a slot mid-save
  editSlots.byOwner[owner] = durable;
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
