import type { MixtapeDraft, MixtapeTrack, Smol } from '../../types/domain';
import { toMixtapeTrack } from '../../utils/track';
import { dismissToastsByTag, toast } from '../toast.svelte';
import {
  persistDraft,
  loadDraftFromStorage,
  removeDraftFromStorage,
  persistEditSession,
  loadEditSessionFromStorage,
} from './persistence';
import {
  emptyDraft,
  touchDraft,
  dedupeTracks,
  moveTrackInArray,
  insertTrackInArray,
  addTrackToArray,
  removeTrackFromArray,
  isEditSessionDirty,
  type AddTrackResult,
  type MixtapeEditSession,
} from './operations';

export type { AddTrackResult, MixtapeEditSession };
export type MixtapeSheetView = 'builder' | 'picker';

const initialDraft = loadDraftFromStorage() || emptyDraft();

/**
 * Two-slot builder sessions (Report 24 §4):
 *   create → `mixtapeDraftState` (key `smol:mixtape-draft`, unchanged shape)
 *   edit   → `mixtapeEditState.session` (key `smol:mixtape-edit`)
 * Every builder op targets `active = edit ?? create`. The create draft is never
 * touched by an edit: it is simply parked while an edit is open.
 */
export const mixtapeDraftState = $state<MixtapeDraft>(initialDraft);

export const mixtapeEditState = $state<{ session: MixtapeEditSession | null }>({
  session: loadEditSessionFromStorage(),
});

function activeSession(): MixtapeDraft {
  return mixtapeEditState.session ?? mixtapeDraftState;
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

function persistActive() {
  if (mixtapeEditState.session) persistEditSession(mixtapeEditState.session);
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
function flushPendingPersist() {
  if (persistTimer) flushPersistDraft();
}

function resetRapidAddCounter() {
  rapidAddCount = 0;
  if (rapidAddResetTimer) {
    clearTimeout(rapidAddResetTimer);
    rapidAddResetTimer = null;
  }
}

const hasContentDerived = $derived(
  Boolean(
    mixtapeDraftState.title.trim() ||
      mixtapeDraftState.description.trim() ||
      mixtapeDraftState.tracks.length > 0
  )
);

const addChipsVisibleDerived = $derived(
  hasContentDerived || mixtapeEditState.session !== null || mixtapeSheetState.open || mixtapeSheetState.browsingDraft
);

const trackIdsDerived = $derived(
  new Set(activeSession().tracks.map((track) => track.id))
);

const isEditingDerived = $derived(mixtapeEditState.session !== null);

const isDirtyDerived = $derived(
  mixtapeEditState.session ? isEditSessionDirty(mixtapeEditState.session) : hasContentDerived
);

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
  const session = activeSession();
  session.title = title;
  session.updatedAt = new Date().toISOString();
  schedulePersistDraft();
}

export function setDescription(description: string) {
  const session = activeSession();
  session.description = description;
  session.updatedAt = new Date().toISOString();
  schedulePersistDraft();
}

export function addTrack(track: MixtapeTrack): AddTrackResult {
  const session = activeSession();
  const outcome = addTrackToArray(session.tracks, track);
  if (outcome.result !== 'added') return outcome.result;

  session.tracks = outcome.tracks;
  session.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return 'added';
}

export function insertTrack(track: MixtapeTrack, index: number): AddTrackResult {
  const session = activeSession();
  const outcome = insertTrackInArray(session.tracks, track, index);
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
  const edit = mixtapeEditState.session;
  if (edit && update(edit)) persistEditSession(edit);
}

export function removeTrack(id: string): { track: MixtapeTrack; index: number } | null {
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
  const session = activeSession();
  const newTracks = moveTrackInArray(session.tracks, fromIndex, toIndex);
  if (!newTracks) return false;

  session.tracks = newTracks;
  session.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return true;
}

export function setTracks(tracks: MixtapeTrack[]) {
  const session = activeSession();
  session.tracks = dedupeTracks(tracks);
  session.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

/** Clears the CREATE slot only (Discard / after publish). An open edit is untouched. */
export function clearDraft() {
  flushPendingPersist();
  resetRapidAddCounter();
  const newDraft = emptyDraft();

  mixtapeDraftState.draftId = newDraft.draftId;
  mixtapeDraftState.title = newDraft.title;
  mixtapeDraftState.description = newDraft.description;
  mixtapeDraftState.tracks = newDraft.tracks;
  mixtapeDraftState.updatedAt = newDraft.updatedAt;
  if (!mixtapeEditState.session) mixtapeSheetState.browsingDraft = false;

  removeDraftFromStorage();
}

/** Loads into the CREATE slot. */
export function loadDraft(draft: MixtapeDraft) {
  flushPendingPersist();
  const touched = touchDraft(draft);

  mixtapeDraftState.draftId = touched.draftId;
  mixtapeDraftState.title = touched.title;
  mixtapeDraftState.description = touched.description;
  mixtapeDraftState.tracks = touched.tracks;
  mixtapeDraftState.updatedAt = touched.updatedAt;

  persistDraft(mixtapeDraftState);
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
  /** Ask before discarding a dirty edit of a different mixtape (UI supplies the dialog). */
  confirmDiscard?: (title: string) => Promise<boolean>;
}

/**
 * Open a published mixtape in the builder's edit slot. Re-opening the mixtape
 * that is already being edited keeps its unsaved changes.
 */
export async function startEdit(mixtape: EditableMixtape, options: StartEditOptions = {}): Promise<'started' | 'cancelled'> {
  const current = mixtapeEditState.session;
  if (current && current.mixtapeId === mixtape.id && !options.tracks && isEditSessionDirty(current)) {
    return 'started';
  }
  if (current && current.mixtapeId !== mixtape.id && isEditSessionDirty(current) && options.confirmDiscard) {
    const ok = await options.confirmDiscard(current.title.trim() || current.baseline.title || 'this mixtape');
    if (!ok) return 'cancelled';
  }

  flushPendingPersist();
  resetRapidAddCounter();
  const baselineTracks = dedupeTracks(mixtape.tracks);
  const stored = mixtape.storedTrackCount ?? baselineTracks.length;
  const publicCount = mixtape.publicTrackCount ?? baselineTracks.length;
  const session: MixtapeEditSession = {
    kind: 'edit',
    draftId: `edit-${mixtape.id}`,
    mixtapeId: mixtape.id,
    creator: mixtape.creator,
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
  };
  mixtapeEditState.session = session;
  persistEditSession(session);
  return 'started';
}

/** Drop the edit slot without saving (Cancel). The create draft comes back. */
export function cancelEdit() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  mixtapeEditState.session = null;
  persistEditSession(null);
}

/** Close the edit slot after a successful save. A draft that fed this edit is consumed. */
export function finishEdit() {
  const consumedDraft = mixtapeEditState.session?.fromDraft === true;
  cancelEdit();
  if (consumedDraft) clearDraft();
}

/** Point the open edit at a newer server copy (409 "Load latest" or after a save). */
export function rebaseEdit(mixtape: EditableMixtape, options: { keepLocal?: boolean } = {}) {
  const session = mixtapeEditState.session;
  if (!session || session.mixtapeId !== mixtape.id) return;
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
  }
  session.updatedAt = new Date().toISOString();
  persistEditSession(session);
}

/** Snapshot of whichever slot is active (edit ?? create). */
export function getActiveSnapshot(): MixtapeDraft {
  const session = activeSession();
  return {
    draftId: session.draftId,
    title: session.title,
    description: session.description,
    tracks: session.tracks.map((track) => ({ ...track })),
    updatedAt: session.updatedAt,
  };
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
 * Single canonical helper to add any Smol or MixtapeTrack to the persistent draft.
 * Coalesces rapid adds into a single tagged toast and handles duplicate/private feedback cleanly.
 */
export function addToDraft(
  input: Smol | MixtapeTrack,
  options: { silent?: boolean; onOpen?: () => void } = {}
): AddTrackResult {
  const track = isMixtapeTrackInput(input) ? input : toMixtapeTrack(input);
  const result = addTrack(track);

  if (options.silent) {
    return result;
  }

  const openAction = () => {
    options.onOpen?.();
    openMixtapeSheet('builder');
  };

  if (result === 'private') {
    toast.info('Private songs can’t be added to mixtapes.', { tag: 'mixtape-add' });
    return result;
  }

  const editTitle = mixtapeEditState.session ? mixtapeEditState.session.title.trim() || 'this mixtape' : null;

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

export function removeFromDraftWithUndo(
  id: string,
  options: { silent?: boolean } = {}
): { track: MixtapeTrack; index: number } | null {
  const removed = removeTrack(id);
  if (!removed || options.silent) return removed;

  const from = mixtapeEditState.session ? `"${mixtapeEditState.session.title.trim() || 'this mixtape'}"` : 'draft';
  toast.info(`Removed "${removed.track.title}" from ${from}.`, {
    tag: 'mixtape-remove',
    duration: 6000,
    actionLabel: 'Undo',
    onAction: () => {
      insertTrack(removed.track, removed.index);
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
