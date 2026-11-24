import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';
import { parseEditSession, parseEditSlots, parseTracks, type MixtapeEditSession } from './operations';
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

/**
 * Each owner's edit slot lives under ITS OWN key (25d pass 2 P1-4), so tabs signed
 * into different accounts can never overwrite each other's parked edit.
 */
export const EDIT_KEY_PREFIX = `${EDIT_STORAGE_KEY}:`;

export function editSlotKey(owner: string): string {
  return `${EDIT_KEY_PREFIX}${owner}`;
}

/** Write (or clear) exactly one owner's slot. Never touches any other account's key. */
export function persistEditSlot(owner: string, session: MixtapeEditSession | null) {
  if (!owner) return;
  if (session && session.creator === owner) storage.setItem(editSlotKey(owner), session);
  else storage.removeItem(editSlotKey(owner));
}

export function loadEditSlot(owner: string): MixtapeEditSession | null {
  const session = parseEditSession(storage.getItem<unknown>(editSlotKey(owner)));
  return session && session.creator === owner ? session : null;
}

/**
 * Load every owner's slot from its own key, migrating the shared-map / single-slot
 * value used by earlier builds into per-owner keys (never overwriting a newer one).
 */
export function loadEditSlotsFromStorage(): Record<string, MixtapeEditSession> {
  if (typeof window === 'undefined') return {};
  const legacy = parseEditSlots(storage.getItem<unknown>(EDIT_STORAGE_KEY));
  for (const [owner, session] of Object.entries(legacy)) {
    if (!loadEditSlot(owner)) persistEditSlot(owner, session);
  }
  if (Object.keys(legacy).length || storage.getItem<unknown>(EDIT_STORAGE_KEY) !== null) storage.removeItem(EDIT_STORAGE_KEY);

  const slots: Record<string, MixtapeEditSession> = {};
  let keys: string[] = [];
  try {
    keys = Object.keys(window.localStorage).filter((key) => key.startsWith(EDIT_KEY_PREFIX));
  } catch {
    keys = [];
  }
  for (const key of keys) {
    const owner = key.slice(EDIT_KEY_PREFIX.length);
    const session = owner ? loadEditSlot(owner) : null;
    if (session) slots[owner] = session;
  }
  return slots;
}
