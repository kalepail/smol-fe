import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';
import { parseEditSlots, parseTracks, type MixtapeEditSession } from './operations';
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

/** Persist every owner's edit slot (`{ [creator]: session }`). */
export function persistEditSlots(slots: Record<string, MixtapeEditSession>) {
  const entries = Object.entries(slots).filter(([owner, session]) => owner && session?.creator === owner);
  if (entries.length) storage.setItem(EDIT_STORAGE_KEY, Object.fromEntries(entries));
  else storage.removeItem(EDIT_STORAGE_KEY);
}

/**
 * Load the per-owner edit slots (legacy single-session values migrate under
 * their own creator; creator-less slots are dropped — 25d P1-2).
 */
export function loadEditSlotsFromStorage(): Record<string, MixtapeEditSession> {
  return parseEditSlots(storage.getItem<unknown>(EDIT_STORAGE_KEY));
}
