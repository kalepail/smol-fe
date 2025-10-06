import type { MixtapeDraft, MixtapeTrack, MixtapeModeState } from '../types/domain';
import * as storage from '../services/localStorage';

/**
 * Mixtape state management using Svelte 5 runes
 */

const STORAGE_KEY = 'smol:mixtape-draft';
const MODE_STORAGE_KEY = 'smol:mixtape-mode';

function createDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDraft(overrides: Partial<MixtapeDraft> = {}): MixtapeDraft {
  return {
    draftId: createDraftId(),
    title: '',
    description: '',
    tracks: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function loadDraftFromStorage(): MixtapeDraft {
  const parsed = storage.getItem<Partial<MixtapeDraft>>(STORAGE_KEY);

  if (!parsed || typeof parsed !== 'object') {
    return emptyDraft();
  }

  const tracks: MixtapeTrack[] = Array.isArray(parsed.tracks)
    ? parsed.tracks
        .filter((track) => track && typeof track === 'object' && typeof track.id === 'string')
        .map((track) => ({
          id: track.id,
          title: typeof track.title === 'string' ? track.title : 'Untitled Smol',
          coverUrl: typeof track.coverUrl === 'string' ? track.coverUrl : null,
          creator: typeof track.creator === 'string' ? track.creator : null,
        }))
    : [];

  return {
    draftId: typeof parsed.draftId === 'string' ? parsed.draftId : createDraftId(),
    title: typeof parsed.title === 'string' ? parsed.title : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    tracks,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  };
}

function persistDraft(draft: MixtapeDraft) {
  storage.setItem(STORAGE_KEY, draft);
}

function touchDraft(draft: MixtapeDraft): MixtapeDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTrack(track: MixtapeTrack): MixtapeTrack {
  return {
    id: track.id,
    title: track.title ?? 'Untitled Smol',
    coverUrl: track.coverUrl ?? null,
    creator: track.creator ?? null,
  };
}

function dedupeTracks(tracks: MixtapeTrack[]): MixtapeTrack[] {
  const seen = new Set<string>();
  const cleaned: MixtapeTrack[] = [];
  for (const track of tracks) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    cleaned.push(normalizeTrack(track));
  }
  return cleaned;
}

function loadModeState(): MixtapeModeState {
  const parsed = storage.getItem<Partial<MixtapeModeState>>(MODE_STORAGE_KEY);

  if (!parsed || typeof parsed !== 'object') {
    return { active: false };
  }

  return {
    active: Boolean(parsed.active),
  };
}

function persistModeState(state: MixtapeModeState) {
  storage.setItem(MODE_STORAGE_KEY, state);
}

// Core reactive state
export const mixtapeDraftState = $state<MixtapeDraft>(loadDraftFromStorage());
export const mixtapeModeState = $state<MixtapeModeState>(loadModeState());

// Computed properties for backward compatibility
export const mixtapeDraftHasContent = {
  get value() {
    return Boolean(
      mixtapeDraftState.title ||
      mixtapeDraftState.description ||
      mixtapeDraftState.tracks.length > 0
    );
  }
};

export const mixtapeTrackIds = {
  get value() {
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
  if (mixtapeDraftState.tracks.some((existing) => existing.id === track.id)) {
    return;
  }

  mixtapeDraftState.tracks = [...mixtapeDraftState.tracks, normalizeTrack(track)];
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function insertTrack(track: MixtapeTrack, index: number) {
  if (mixtapeDraftState.tracks.some((existing) => existing.id === track.id)) {
    return;
  }

  const normalized = normalizeTrack(track);
  const clampedIndex = Math.max(0, Math.min(index, mixtapeDraftState.tracks.length));
  const updatedTracks = [...mixtapeDraftState.tracks];
  updatedTracks.splice(clampedIndex, 0, normalized);

  mixtapeDraftState.tracks = updatedTracks;
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function removeTrack(id: string) {
  if (!mixtapeDraftState.tracks.some((track) => track.id === id)) return;

  mixtapeDraftState.tracks = mixtapeDraftState.tracks.filter((track) => track.id !== id);
  mixtapeDraftState.updatedAt = new Date().toISOString();
  persistDraft(mixtapeDraftState);
}

export function moveTrack(fromIndex: number, toIndex: number) {
  const tracks = [...mixtapeDraftState.tracks];
  if (
    fromIndex < 0 ||
    fromIndex >= tracks.length ||
    toIndex < 0 ||
    toIndex >= tracks.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  const [item] = tracks.splice(fromIndex, 1);
  tracks.splice(toIndex, 0, item);

  mixtapeDraftState.tracks = tracks;
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

  storage.removeItem(STORAGE_KEY);
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
