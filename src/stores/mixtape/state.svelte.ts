import type { MixtapeDraft, MixtapeTrack, Smol } from '../../types/domain';
import { toMixtapeTrack } from '../../utils/track';
import { dismissToastsByTag, toast } from '../toast.svelte';
import {
  persistDraft,
  loadDraftFromStorage,
  removeDraftFromStorage,
} from './persistence';
import {
  emptyDraft,
  touchDraft,
  dedupeTracks,
  moveTrackInArray,
  insertTrackInArray,
  addTrackToArray,
  removeTrackFromArray,
  type AddTrackResult,
} from './operations';

export type { AddTrackResult };
export type MixtapeSheetView = 'builder' | 'picker';

const initialDraft = loadDraftFromStorage() || emptyDraft();

export const mixtapeDraftState = $state<MixtapeDraft>(initialDraft);

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

function schedulePersistDraft() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistDraft(mixtapeDraftState);
  }, 250);
}

function flushPersistDraft() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistDraft(mixtapeDraftState);
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
  hasContentDerived || mixtapeSheetState.open || mixtapeSheetState.browsingDraft
);

const trackIdsDerived = $derived(
  new Set(mixtapeDraftState.tracks.map((track) => track.id))
);

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
  mixtapeDraftState.title = title;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  schedulePersistDraft();
}

export function setDescription(description: string) {
  mixtapeDraftState.description = description;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  schedulePersistDraft();
}

export function addTrack(track: MixtapeTrack): AddTrackResult {
  const outcome = addTrackToArray(mixtapeDraftState.tracks, track);
  if (outcome.result !== 'added') return outcome.result;

  mixtapeDraftState.tracks = outcome.tracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return 'added';
}

export function insertTrack(track: MixtapeTrack, index: number): AddTrackResult {
  const outcome = insertTrackInArray(mixtapeDraftState.tracks, track, index);
  if (outcome.result !== 'added') return outcome.result;

  mixtapeDraftState.tracks = outcome.tracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return 'added';
}

export function updateTrackVisibility(id: string, isPublic: 0 | 1) {
  const idx = mixtapeDraftState.tracks.findIndex((track) => track.id === id);
  if (idx === -1 || mixtapeDraftState.tracks[idx].public === isPublic) return;

  const updated = [...mixtapeDraftState.tracks];
  updated[idx] = { ...updated[idx], public: isPublic };
  mixtapeDraftState.tracks = updated;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

export function removeTrack(id: string): { track: MixtapeTrack; index: number } | null {
  const index = mixtapeDraftState.tracks.findIndex((track) => track.id === id);
  if (index === -1) return null;

  const track = mixtapeDraftState.tracks[index];
  mixtapeDraftState.tracks = removeTrackFromArray(mixtapeDraftState.tracks, id);
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return { track, index };
}

export function moveTrack(fromIndex: number, toIndex: number): boolean {
  const newTracks = moveTrackInArray(mixtapeDraftState.tracks, fromIndex, toIndex);
  if (!newTracks) return false;

  mixtapeDraftState.tracks = newTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
  return true;
}

export function setTracks(tracks: MixtapeTrack[]) {
  mixtapeDraftState.tracks = dedupeTracks(tracks);
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

export function clearDraft() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  resetRapidAddCounter();
  const newDraft = emptyDraft();

  mixtapeDraftState.draftId = newDraft.draftId;
  mixtapeDraftState.title = newDraft.title;
  mixtapeDraftState.description = newDraft.description;
  mixtapeDraftState.tracks = newDraft.tracks;
  mixtapeDraftState.updatedAt = newDraft.updatedAt;
  mixtapeSheetState.browsingDraft = false;

  removeDraftFromStorage();
}

export function loadDraft(draft: MixtapeDraft) {
  const touched = touchDraft(draft);

  mixtapeDraftState.draftId = touched.draftId;
  mixtapeDraftState.title = touched.title;
  mixtapeDraftState.description = touched.description;
  mixtapeDraftState.tracks = touched.tracks;
  mixtapeDraftState.updatedAt = touched.updatedAt;

  flushPersistDraft();
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

  if (result === 'duplicate') {
    toast.info(`"${track.title}" is already in your mixtape draft.`, {
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

  const message =
    rapidAddCount > 1
      ? `Added ${rapidAddCount} songs to mixtape draft.`
      : `Added "${track.title}" to mixtape draft.`;

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

  toast.info(`Removed "${removed.track.title}" from draft.`, {
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
