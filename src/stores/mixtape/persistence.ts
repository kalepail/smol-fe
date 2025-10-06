import type { MixtapeDraft, MixtapeModeState } from '../../types/domain';
import * as storage from '../../services/localStorage';

const STORAGE_KEY = 'smol:mixtape-draft';
const MODE_STORAGE_KEY = 'smol:mixtape-mode';

export function persistDraft(draft: MixtapeDraft) {
  storage.setItem(STORAGE_KEY, draft);
}

export function loadDraftFromStorage(): MixtapeDraft | null {
  const parsed = storage.getItem<Partial<MixtapeDraft>>(STORAGE_KEY);

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const tracks = Array.isArray(parsed.tracks)
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
    draftId: typeof parsed.draftId === 'string' ? parsed.draftId : '',
    title: typeof parsed.title === 'string' ? parsed.title : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    tracks,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function removeDraftFromStorage() {
  storage.removeItem(STORAGE_KEY);
}

export function persistModeState(state: MixtapeModeState) {
  storage.setItem(MODE_STORAGE_KEY, state);
}

export function loadModeStateFromStorage(): MixtapeModeState {
  const parsed = storage.getItem<Partial<MixtapeModeState>>(MODE_STORAGE_KEY);

  if (!parsed || typeof parsed !== 'object') {
    return { active: false };
  }

  return {
    active: Boolean(parsed.active),
  };
}
