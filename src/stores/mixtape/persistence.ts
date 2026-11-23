import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';
import type { MixtapeEditSession } from './operations';
import * as storage from '../../services/localStorage';

/** Create slot (unchanged key + shape since Report 19). */
const STORAGE_KEY = 'smol:mixtape-draft';
/** Edit slot (Report 24 §4): the published mixtape currently being edited. */
const EDIT_STORAGE_KEY = 'smol:mixtape-edit';
const LEGACY_MODE_STORAGE_KEY = 'smol:mixtape-mode';

export function clearLegacyModeStorage() {
  storage.removeItem(LEGACY_MODE_STORAGE_KEY);
}

export function persistDraft(draft: MixtapeDraft) {
  storage.setItem(STORAGE_KEY, draft);
}

function parseTracks(value: unknown): MixtapeTrack[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((track) => track && typeof track === 'object' && typeof track.id === 'string')
    .map((track) => ({
      id: track.id,
      title: typeof track.title === 'string' ? track.title : 'Untitled Smol',
      coverUrl: typeof track.coverUrl === 'string' ? track.coverUrl : null,
      creator: typeof track.creator === 'string' ? track.creator : null,
      public: track.public === 0 || track.public === 1 ? track.public : undefined,
    }));
}

export function loadDraftFromStorage(): MixtapeDraft | null {
  // One-time cleanup of retired mixtape-mode flag.
  clearLegacyModeStorage();

  const parsed = storage.getItem<Partial<MixtapeDraft>>(STORAGE_KEY);

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  return {
    draftId: typeof parsed.draftId === 'string' ? parsed.draftId : '',
    title: typeof parsed.title === 'string' ? parsed.title : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    tracks: parseTracks(parsed.tracks),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function removeDraftFromStorage() {
  storage.removeItem(STORAGE_KEY);
  clearLegacyModeStorage();
}

export function persistEditSession(session: MixtapeEditSession | null) {
  if (session) storage.setItem(EDIT_STORAGE_KEY, session);
  else storage.removeItem(EDIT_STORAGE_KEY);
}

export function loadEditSessionFromStorage(): MixtapeEditSession | null {
  const parsed = storage.getItem<Partial<MixtapeEditSession>>(EDIT_STORAGE_KEY);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.mixtapeId !== 'string' || !parsed.mixtapeId) {
    return null;
  }
  const baseline = parsed.baseline && typeof parsed.baseline === 'object' ? parsed.baseline : null;
  if (!baseline) return null;

  return {
    kind: 'edit',
    draftId: typeof parsed.draftId === 'string' ? parsed.draftId : `edit-${parsed.mixtapeId}`,
    mixtapeId: parsed.mixtapeId,
    creator: typeof parsed.creator === 'string' ? parsed.creator : '',
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    revision: typeof parsed.revision === 'number' && parsed.revision > 0 ? parsed.revision : 1,
    title: typeof parsed.title === 'string' ? parsed.title : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    tracks: parseTracks(parsed.tracks),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    baseline: {
      title: typeof baseline.title === 'string' ? baseline.title : '',
      description: typeof baseline.description === 'string' ? baseline.description : '',
      trackIds: Array.isArray(baseline.trackIds) ? baseline.trackIds.filter((id): id is string => typeof id === 'string') : [],
    },
    baselineVisibility: parsed.baselineVisibility === 'owner' || parsed.baselineVisibility === 'public' ? parsed.baselineVisibility : null,
    baselineHiddenReason: typeof parsed.baselineHiddenReason === 'string' ? parsed.baselineHiddenReason : null,
    privateTrackCount: typeof parsed.privateTrackCount === 'number' && parsed.privateTrackCount > 0 ? parsed.privateTrackCount : 0,
    fromDraft: parsed.fromDraft === true,
  };
}
