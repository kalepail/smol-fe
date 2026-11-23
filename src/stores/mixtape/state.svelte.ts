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

const initialDraft = loadDraftFromStorage() || emptyDraft();
const initialModeState = loadModeStateFromStorage();

export const mixtapeDraftState = $state<MixtapeDraft>(initialDraft);
export const mixtapeModeState = $state<MixtapeModeState>(initialModeState);

let persistTimer: ReturnType<typeof setTimeout> | null = null;

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

const hasContentDerived = $derived(
  Boolean(
    mixtapeDraftState.title ||
      mixtapeDraftState.description ||
      mixtapeDraftState.tracks.length > 0
  )
);

const trackIdsDerived = $derived(
  new Set(mixtapeDraftState.tracks.map((track) => track.id))
);

export const mixtapeDraftHasContent = {
  get current() {
    return hasContentDerived;
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

export function addTrack(track: MixtapeTrack) {
  const newTracks = addTrackToArray(mixtapeDraftState.tracks, track);
  if (!newTracks) return;

  mixtapeDraftState.tracks = newTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

export function insertTrack(track: MixtapeTrack, index: number) {
  const newTracks = insertTrackInArray(mixtapeDraftState.tracks, track, index);
  if (!newTracks) return;

  mixtapeDraftState.tracks = newTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

export function removeTrack(id: string) {
  if (!mixtapeDraftState.tracks.some((track) => track.id === id)) return;

  mixtapeDraftState.tracks = removeTrackFromArray(mixtapeDraftState.tracks, id);
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

export function moveTrack(fromIndex: number, toIndex: number) {
  const newTracks = moveTrackInArray(mixtapeDraftState.tracks, fromIndex, toIndex);
  if (!newTracks) return;

  mixtapeDraftState.tracks = newTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

export function setTracks(tracks: MixtapeTrack[]) {
  mixtapeDraftState.tracks = dedupeTracks(tracks);
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
}

export function resetDraft(options: { keepDraftId?: boolean } = {}) {
  const currentId = options.keepDraftId ? mixtapeDraftState.draftId : createDraftId();
  const newDraft = emptyDraft({ draftId: currentId });

  mixtapeDraftState.draftId = newDraft.draftId;
  mixtapeDraftState.title = newDraft.title;
  mixtapeDraftState.description = newDraft.description;
  mixtapeDraftState.tracks = newDraft.tracks;
  mixtapeDraftState.updatedAt = newDraft.updatedAt;

  flushPersistDraft();
}

export function clearDraft() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
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

  flushPersistDraft();
}

export function touchMixtapeDraft() {
  mixtapeDraftState.updatedAt = new Date().toISOString();
  flushPersistDraft();
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
  },
};
