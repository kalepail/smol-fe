import type { MixtapeDraft, MixtapeModeState, MixtapeTrack } from '../../types/domain';
import {
  persistDraft,
  loadDraftFromStorage,
  removeDraftFromStorage,
  persistModeState,
  loadModeStateFromStorage,
} from './persistence';
import {
  emptyDraft,
  createDraftId,
  touchDraft,
  dedupeTracks,
  moveTrackInArray,
  insertTrackInArray,
  addTrackToArray,
  removeTrackFromArray,
} from './operations';

// Initialize from storage or create empty
const initialDraft = loadDraftFromStorage() || emptyDraft();
const initialModeState = loadModeStateFromStorage();

// Core reactive state
export const mixtapeDraftState = $state<MixtapeDraft>(initialDraft);
export const mixtapeModeState = $state<MixtapeModeState>(initialModeState);

// Computed properties using object getters
// Per Svelte 5 rules: Cannot export $derived directly from modules
// Use getter pattern instead - access these directly (not .value)
export const mixtapeDraftHasContent = {
  get current() {
    return Boolean(
      mixtapeDraftState.title ||
      mixtapeDraftState.description ||
      mixtapeDraftState.tracks.length > 0
    );
  }
};

export const mixtapeTrackIds = {
  get current() {
    return new Set(mixtapeDraftState.tracks.map((track) => track.id));
  }
};

// Draft management functions
export function setTitle(title: string) {
  mixtapeDraftState.title = title;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function setDescription(description: string) {
  mixtapeDraftState.description = description;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function addTrack(track: MixtapeTrack) {
  const newTracks = addTrackToArray(mixtapeDraftState.tracks, track);
  if (!newTracks) return;

  mixtapeDraftState.tracks = newTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function insertTrack(track: MixtapeTrack, index: number) {
  const newTracks = insertTrackInArray(mixtapeDraftState.tracks, track, index);
  if (!newTracks) return;

  mixtapeDraftState.tracks = newTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function removeTrack(id: string) {
  if (!mixtapeDraftState.tracks.some((track) => track.id === id)) return;

  mixtapeDraftState.tracks = removeTrackFromArray(mixtapeDraftState.tracks, id);
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function moveTrack(fromIndex: number, toIndex: number) {
  const newTracks = moveTrackInArray(mixtapeDraftState.tracks, fromIndex, toIndex);
  if (!newTracks) return;

  mixtapeDraftState.tracks = newTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function setTracks(tracks: MixtapeTrack[]) {
  mixtapeDraftState.tracks = dedupeTracks(tracks);
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function resetDraft(options: { keepDraftId?: boolean } = {}) {
  const currentId = options.keepDraftId ? mixtapeDraftState.draftId : createDraftId();
  const newDraft = emptyDraft({ draftId: currentId });

  mixtapeDraftState.draftId = newDraft.draftId;
  mixtapeDraftState.title = newDraft.title;
  mixtapeDraftState.description = newDraft.description;
  mixtapeDraftState.tracks = newDraft.tracks;
  mixtapeDraftState.updatedAt = newDraft.updatedAt;

  persistDraft(mixtapeDraftState);
}

export function clearDraft() {
  const newDraft = emptyDraft();

  mixtapeDraftState.draftId = newDraft.draftId;
  mixtapeDraftState.title = newDraft.title;
  mixtapeDraftState.description = newDraft.description;
  mixtapeDraftState.tracks = newDraft.tracks;
  mixtapeDraftState.updatedAt = newDraft.updatedAt;

  removeDraftFromStorage();
}

export function loadDraft(draft: MixtapeDraft) {
  const touched = touchDraft(draft);

  mixtapeDraftState.draftId = touched.draftId;
  mixtapeDraftState.title = touched.title;
  mixtapeDraftState.description = touched.description;
  mixtapeDraftState.tracks = touched.tracks;
  mixtapeDraftState.updatedAt = touched.updatedAt;

  persistDraft(mixtapeDraftState);
}

export function touchMixtapeDraft() {
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function getSnapshotDraft(): MixtapeDraft {
  return {
    draftId: mixtapeDraftState.draftId,
    title: mixtapeDraftState.title,
    description: mixtapeDraftState.description,
    tracks: [...mixtapeDraftState.tracks],
    updatedAt: mixtapeDraftState.updatedAt,
  };
}

// Mode management functions
export function enterMixtapeMode() {
  mixtapeModeState.active = true;
  persistModeState(mixtapeModeState);
}

export function exitMixtapeMode() {
  mixtapeModeState.active = false;
  persistModeState(mixtapeModeState);
}

export function toggleMixtapeMode() {
  mixtapeModeState.active = !mixtapeModeState.active;
  persistModeState(mixtapeModeState);
}

// For backward compatibility - create objects that look like the old stores
export const mixtapeDraft = {
  setTitle,
  setDescription,
  addTrack,
  insertTrack,
  removeTrack,
  moveTrack,
  setTracks,
  reset: resetDraft,
  clear: clearDraft,
  load: loadDraft,
  touch: touchMixtapeDraft,
  getSnapshot: getSnapshotDraft,
};

export const mixtapeMode = {
  get active() {
    return mixtapeModeState.active;
  }
};
