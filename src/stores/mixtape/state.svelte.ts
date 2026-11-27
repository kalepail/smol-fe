import type { MixtapeDraft, MixtapeTrack, Smol } from '../../types/domain';
import { toMixtapeTrack } from '../../utils/track';
import { dismissToastsByTag, toast } from '../toast.svelte';
import { userState } from '../user.svelte';
import {
  persistDraft,
  loadDraftFromStorage,
  removeDraftFromStorage,
  persistEditSlot,
  loadEditSlot,
  loadEditSlotsFromStorage,
  EDIT_KEY_PREFIX,
} from './persistence';
import {
  emptyDraft,
  dedupeTracks,
  moveTrackInArray,
  insertTrackInArray,
  addTrackToArray,
  removeTrackFromArray,
  isEditSessionDirty,
  draftPayloadKey,
  type AddTrackResult,
  type MixtapeEditSession,
  type MergeSourceSnapshot,
} from './operations';

export type { AddTrackResult, MixtapeEditSession, MergeSourceSnapshot };
export type MixtapeSheetView = 'builder' | 'picker';

const initialDraft = loadDraftFromStorage() || emptyDraft();

/**
 * Core (every page) part of the two-slot builder store. The edit lifecycle (start / save /
 * finish / rebase / publish lock) lives in ./editSession.svelte.ts, which ONLY lazily loaded
 * code imports, so the Home bundle carries just what feed adds and the mini-bar need.
 * `editSlots`, `currentEdit`, `persistOwner`, … are exported for that module only — the
 * barrel (./index.ts) does not re-export them.
 *
 * Two-slot builder sessions (Report 24 §4):
 *   create → `mixtapeDraftState` (key `smol:mixtape-draft`, unchanged shape)
 *   edit   → one slot PER OWNER (key `smol:mixtape-edit`, keyed by creator)
 * Every builder op targets `active = edit ?? create`, where `edit` is only ever
 * the signed-in account's own slot: account B can never see, open, change or
 * delete account A's unsaved edit (25d P1-2). The create draft is never touched
 * by an edit: it is simply parked while an edit is open.
 */
export const mixtapeDraftState = $state<MixtapeDraft>(initialDraft);

export const editSlots = $state<{ byOwner: Record<string, MixtapeEditSession> }>({
  byOwner: loadEditSlotsFromStorage(),
});

export function currentEdit(): MixtapeEditSession | null {
  const owner = userState.contractId;
  if (!owner) return null;
  const session = editSlots.byOwner[owner];
  return session && session.creator === owner ? session : null;
}

/** The signed-in owner's edit slot (null for any other account or when signed out). */
export const mixtapeEditState = {
  get session(): MixtapeEditSession | null {
    return currentEdit();
  },
};

/**
 * In-flight save lock (25d P1-3): while a PUT for the open edit is pending,
 * every mutation of that edit slot is refused, so what the server stores is
 * exactly what the owner sees when the slot is cleared.
 */
export const mixtapeEditLock = $state<{ owner: string | null; mixtapeId: string | null }>({ owner: null, mixtapeId: null });

/**
 * In-flight publish lock (25d pass 2 P1-5): while the create POST is pending, the
 * create draft is frozen everywhere (builder AND page/feed/search/Now Playing adds).
 */
export const mixtapeCreateLock = $state<{ draftId: string | null }>({ draftId: null });

/** Revision conflict awaiting a choice (inline banner AND toast share it — 25d P2-2). */
export const mixtapeEditConflict = $state<{ mixtapeId: string | null; revision: number | null }>({
  mixtapeId: null,
  revision: null,
});

function activeSession(): MixtapeDraft {
  return currentEdit() ?? mixtapeDraftState;
}

export function editIsLocked(owner: string, mixtapeId: string): boolean {
  return mixtapeEditLock.owner === owner && mixtapeEditLock.mixtapeId === mixtapeId;
}

function activeIsLocked(): boolean {
  const edit = currentEdit();
  if (edit) return editIsLocked(edit.creator, edit.mixtapeId);
  return mixtapeCreateLock.draftId !== null && mixtapeCreateLock.draftId === mixtapeDraftState.draftId;
}

// UI visibility is ephemeral (never persisted). No separate persisted "mixtape mode".
export const mixtapeSheetState = $state<{
  open: boolean;
  view: MixtapeSheetView;
  browsingDraft: boolean;
}>({
  open: false,
  view: 'builder',
  browsingDraft: false,
});

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let rapidAddCount = 0;
let rapidAddResetTimer: ReturnType<typeof setTimeout> | null = null;

/** Persist ONE owner's slot under its own key (never the other accounts'). */
export function persistOwner(owner: string) {
  persistEditSlot(owner, editSlots.byOwner[owner] ?? null);
}

function persistActive() {
  const edit = currentEdit();
  if (edit) persistOwner(edit.creator);
  else persistDraft(mixtapeDraftState);
}

function schedulePersistDraft() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistActive();
  }, 250);
}

function flushPersistDraft() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistActive();
}

/** Flush any pending debounced write before the active slot changes. */
export function flushPendingPersist() {
  if (persistTimer) flushPersistDraft();
}

// Never lose the last keystrokes of a title/description to the debounce on reload/close.
if (typeof window !== 'undefined') {
  // Another tab parked an edit for an account this tab has no slot for: adopt it (read-only merge;
  // a slot this tab holds is never overwritten from outside).
  window.addEventListener('storage', (event) => {
    if (!event.key?.startsWith(EDIT_KEY_PREFIX)) return;
    const owner = event.key.slice(EDIT_KEY_PREFIX.length);
    if (!owner || editSlots.byOwner[owner]) return;
    const session = loadEditSlot(owner);
    if (session) editSlots.byOwner[owner] = session;
  });
  window.addEventListener('pagehide', flushPendingPersist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPersist();
  });
}

function resetRapidAddCounter() {
  rapidAddCount = 0;
  if (rapidAddResetTimer) {
    clearTimeout(rapidAddResetTimer);
    rapidAddResetTimer = null;
  }
}

/** Slot switches invalidate per-slot Undo toasts (25d P1-4). */
export function onSlotSwitch() {
  dismissToastsByTag('mixtape-remove');
  resetRapidAddCounter();
}

const hasContentDerived = $derived(
  Boolean(
    mixtapeDraftState.title.trim() ||
      mixtapeDraftState.description.trim() ||
      mixtapeDraftState.tracks.length > 0
  )
);

const addChipsVisibleDerived = $derived(
  hasContentDerived || currentEdit() !== null || mixtapeSheetState.open || mixtapeSheetState.browsingDraft
);

const trackIdsDerived = $derived(
  new Set(activeSession().tracks.map((track) => track.id))
);

const isEditingDerived = $derived(currentEdit() !== null);

const isDirtyDerived = $derived.by(() => {
  const edit = currentEdit();
  return edit ? isEditSessionDirty(edit) : hasContentDerived;
});

const isSavingDerived = $derived(activeIsLocked());

/** The session every builder op targets: the open edit, else the create draft. */
export const mixtapeActive = {
  get current(): MixtapeDraft {
    return activeSession();
  },
};

export const mixtapeIsEditing = {
  get current() {
    return isEditingDerived;
  },
};

/** True while the open edit's PUT is in flight (all edit mutations are frozen). */
export const mixtapeIsSaving = {
  get current() {
    return isSavingDerived;
  },
};

/** Edit: differs from the published baseline. Create: has any content. */
export const mixtapeIsDirty = {
  get current() {
    return isDirtyDerived;
  },
};

/** A create draft with content OR an open edit: the mini-bar / draft pill should show. */
export const mixtapeSessionActive = {
  get current() {
    return hasContentDerived || isEditingDerived;
  },
};

export const mixtapeDraftHasContent = {
  get current() {
    return hasContentDerived;
  },
};

export const mixtapeAddChipsVisible = {
  get current() {
    return addChipsVisibleDerived;
  },
};

export const mixtapeTrackIds = {
  get current() {
    return trackIdsDerived;
  },
};

export function setTitle(title: string) {
  if (activeIsLocked()) return;
  const session = activeSession();
  session.title = title;
  session.updatedAt = new Date().toISOString();
  schedulePersistDraft();
}

export function setDescription(description: string) {
  if (activeIsLocked()) return;
  const session = activeSession();
  session.description = description;
  session.updatedAt = new Date().toISOString();
  schedulePersistDraft();
}

export function addTrack(track: MixtapeTrack): AddTrackResult {
  if (activeIsLocked()) return 'busy';
  const session = activeSession();
  const outcome = addTrackToArray(session.tracks, track);
  if (outcome.result !== 'added') return outcome.result;

  session.tracks = outcome.tracks;
  session.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return 'added';
}

/** Applies to both slots: visibility is a fact about the song, not the session. */
export function updateTrackVisibility(id: string, isPublic: 0 | 1) {
  const update = (session: MixtapeDraft): boolean => {
    const idx = session.tracks.findIndex((track) => track.id === id);
    if (idx === -1 || session.tracks[idx].public === isPublic) return false;
    const updated = [...session.tracks];
    updated[idx] = { ...updated[idx], public: isPublic };
    session.tracks = updated;
    session.updatedAt = new Date().toISOString();
    return true;
  };
  if (update(mixtapeDraftState)) persistDraft(mixtapeDraftState);
  const edit = currentEdit();
  if (edit && !editIsLocked(edit.creator, edit.mixtapeId) && update(edit)) persistOwner(edit.creator);
}

export function removeTrack(id: string): { track: MixtapeTrack; index: number } | null {
  if (activeIsLocked()) return null;
  const session = activeSession();
  const index = session.tracks.findIndex((track) => track.id === id);
  if (index === -1) return null;

  const track = session.tracks[index];
  session.tracks = removeTrackFromArray(session.tracks, id);
  session.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return { track, index };
}

export function moveTrack(fromIndex: number, toIndex: number): boolean {
  if (activeIsLocked()) return false;
  const session = activeSession();
  const newTracks = moveTrackInArray(session.tracks, fromIndex, toIndex);
  if (!newTracks) return false;

  session.tracks = newTracks;
  session.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return true;
}

export function setTracks(tracks: MixtapeTrack[]) {
  if (activeIsLocked()) return;
  const session = activeSession();
  session.tracks = dedupeTracks(tracks);
  session.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

/** Clears the CREATE slot only (Discard / after publish). An open edit is untouched. */
export function clearDraft() {
  flushPendingPersist();
  resetRapidAddCounter();
  dismissToastsByTag('mixtape-remove');
  const newDraft = emptyDraft();

  mixtapeDraftState.draftId = newDraft.draftId;
  mixtapeDraftState.title = newDraft.title;
  mixtapeDraftState.description = newDraft.description;
  mixtapeDraftState.tracks = newDraft.tracks;
  mixtapeDraftState.updatedAt = newDraft.updatedAt;
  if (!currentEdit()) mixtapeSheetState.browsingDraft = false;

  removeDraftFromStorage();
}

export function getSnapshotDraft(): MixtapeDraft {
  return {
    draftId: mixtapeDraftState.draftId,
    title: mixtapeDraftState.title,
    description: mixtapeDraftState.description,
    tracks: mixtapeDraftState.tracks.map((track) => ({ ...track })),
    updatedAt: mixtapeDraftState.updatedAt,
  };
}

export function openMixtapeSheet(view: MixtapeSheetView = 'builder') {
  mixtapeSheetState.browsingDraft = true;
  mixtapeSheetState.view = view;
  dismissToastsByTag('mixtape-add');
  resetRapidAddCounter();
  mixtapeSheetState.open = true;
}

export function closeMixtapeSheet() {
  flushPendingPersist();
  mixtapeSheetState.open = false;
  mixtapeSheetState.view = 'builder';
}

export function setMixtapeSheetView(view: MixtapeSheetView) {
  mixtapeSheetState.view = view;
}

function isMixtapeTrackInput(input: Smol | MixtapeTrack): input is MixtapeTrack {
  return 'id' in input && !('Id' in input);
}

/**
 * Single canonical helper to add any Smol or MixtapeTrack to the active session.
 * Coalesces rapid adds into a single tagged toast and handles duplicate/private feedback cleanly.
 */
export function addToDraft(
  input: Smol | MixtapeTrack,
  options: { silent?: boolean; onOpen?: () => void } = {}
): AddTrackResult {
  const track = isMixtapeTrackInput(input) ? input : toMixtapeTrack(input);
  const result = addTrack(track);

  if (options.silent && result !== 'busy') {
    return result;
  }

  const openAction = () => {
    options.onOpen?.();
    openMixtapeSheet('builder');
  };

  if (result === 'busy') {
    toast.info(
      currentEdit() ? 'Saving your changes… add it again in a moment.' : 'Publishing your mixtape… add it again in a moment.',
      { tag: 'mixtape-add' }
    );
    return result;
  }

  if (result === 'private') {
    toast.info('Private songs can’t be added to mixtapes.', { tag: 'mixtape-add' });
    return result;
  }

  const edit = currentEdit();
  const editTitle = edit ? edit.title.trim() || 'this mixtape' : null;

  if (result === 'duplicate') {
    toast.info(editTitle ? `"${track.title}" is already in "${editTitle}".` : `"${track.title}" is already in your mixtape draft.`, {
      tag: 'mixtape-add',
      actionLabel: 'Open draft',
      onAction: openAction,
    });
    return result;
  }

  rapidAddCount += 1;
  if (rapidAddResetTimer) clearTimeout(rapidAddResetTimer);
  rapidAddResetTimer = setTimeout(() => {
    rapidAddCount = 0;
    rapidAddResetTimer = null;
  }, 4500);

  const target = editTitle ? `"${editTitle}"` : 'mixtape draft';
  const message =
    rapidAddCount > 1
      ? `Added ${rapidAddCount} songs to ${target}.`
      : `Added "${track.title}" to ${target}.`;

  toast.success(message, {
    tag: 'mixtape-add',
    actionLabel: 'Open draft',
    onAction: openAction,
  });

  return result;
}

/** Identity of a builder slot, so a deferred action can only ever touch the slot it came from. */
type SlotRef = { kind: 'create'; draftId: string } | { kind: 'edit'; owner: string; mixtapeId: string };

function activeRef(): SlotRef {
  const edit = currentEdit();
  return edit
    ? { kind: 'edit', owner: edit.creator, mixtapeId: edit.mixtapeId }
    : { kind: 'create', draftId: mixtapeDraftState.draftId };
}

function resolveRef(ref: SlotRef): MixtapeDraft | null {
  if (ref.kind === 'create') return mixtapeDraftState.draftId === ref.draftId ? mixtapeDraftState : null;
  if (userState.contractId !== ref.owner) return null;
  const edit = editSlots.byOwner[ref.owner];
  return edit && edit.mixtapeId === ref.mixtapeId ? edit : null;
}

/**
 * Re-insert a removed track into the slot it was removed from — never into
 * whichever slot happens to be active when Undo is clicked (25d P1-4).
 */
function undoRemoveInto(ref: SlotRef, track: MixtapeTrack, index: number): boolean {
  const target = resolveRef(ref);
  if (!target) return false;
  if (ref.kind === 'edit' && editIsLocked(ref.owner, ref.mixtapeId)) return false;
  if (ref.kind === 'create' && mixtapeCreateLock.draftId === ref.draftId) return false;
  const outcome = insertTrackInArray(target.tracks, track, index);
  if (outcome.result !== 'added') return false;
  target.tracks = outcome.tracks;
  target.updatedAt = new Date().toISOString();
  if (ref.kind === 'edit') persistOwner(ref.owner);
  else persistDraft(mixtapeDraftState);
  return true;
}

export function removeFromDraftWithUndo(
  id: string,
  options: { silent?: boolean } = {}
): { track: MixtapeTrack; index: number } | null {
  const ref = activeRef();
  const removed = removeTrack(id);
  if (!removed || options.silent) return removed;

  const edit = currentEdit();
  const from = edit ? `"${edit.title.trim() || 'this mixtape'}"` : 'draft';
  toast.info(`Removed "${removed.track.title}" from ${from}.`, {
    tag: 'mixtape-remove',
    duration: 6000,
    actionLabel: 'Undo',
    onAction: () => {
      undoRemoveInto(ref, removed.track, removed.index);
    },
  });

  return removed;
}

export function toggleDraftTrack(
  input: Smol | MixtapeTrack,
  options: { silent?: boolean; onOpen?: () => void } = {}
): 'added' | 'removed' | 'private' {
  const track = isMixtapeTrackInput(input) ? input : toMixtapeTrack(input);
  if (mixtapeTrackIds.current.has(track.id)) {
    removeFromDraftWithUndo(track.id, { silent: options.silent });
    return 'removed';
  }
  const result = addToDraft(track, options);
  return result === 'private' ? 'private' : 'added';
}
