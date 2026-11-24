import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';

/** `busy`: the open edit is being saved, so it is frozen (25d P1-3). */
export type AddTrackResult = 'added' | 'duplicate' | 'private' | 'busy';

export function createDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyDraft(overrides: Partial<MixtapeDraft> = {}): MixtapeDraft {
  return {
    draftId: createDraftId(),
    title: '',
    description: '',
    tracks: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function touchDraft(draft: MixtapeDraft): MixtapeDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeTrack(track: MixtapeTrack): MixtapeTrack {
  return {
    id: track.id,
    title: track.title ?? 'Untitled Smol',
    coverUrl: track.coverUrl ?? null,
    creator: track.creator ?? null,
    public: track.public === 0 || track.public === 1 ? track.public : undefined,
  };
}

export function dedupeTracks(tracks: MixtapeTrack[]): MixtapeTrack[] {
  const seen = new Set<string>();
  const cleaned: MixtapeTrack[] = [];
  for (const track of tracks) {
    if (!track?.id || seen.has(track.id)) continue;
    seen.add(track.id);
    cleaned.push(normalizeTrack(track));
  }
  return cleaned;
}

export function moveTrackInArray(tracks: MixtapeTrack[], fromIndex: number, toIndex: number): MixtapeTrack[] | null {
  if (
    fromIndex < 0 ||
    fromIndex >= tracks.length ||
    toIndex < 0 ||
    toIndex >= tracks.length ||
    fromIndex === toIndex
  ) {
    return null;
  }

  const newTracks = [...tracks];
  const [item] = newTracks.splice(fromIndex, 1);
  newTracks.splice(toIndex, 0, item);

  return newTracks;
}

export function insertTrackInArray(
  tracks: MixtapeTrack[],
  track: MixtapeTrack,
  index: number
): { result: AddTrackResult; tracks: MixtapeTrack[] } {
  if (track.public === 0) {
    return { result: 'private', tracks };
  }

  if (tracks.some((existing) => existing.id === track.id)) {
    return { result: 'duplicate', tracks };
  }

  const normalized = normalizeTrack(track);
  const clampedIndex = Math.max(0, Math.min(index, tracks.length));
  const updatedTracks = [...tracks];
  updatedTracks.splice(clampedIndex, 0, normalized);

  return { result: 'added', tracks: updatedTracks };
}

export function addTrackToArray(
  tracks: MixtapeTrack[],
  track: MixtapeTrack
): { result: AddTrackResult; tracks: MixtapeTrack[] } {
  return insertTrackInArray(tracks, track, tracks.length);
}

export function removeTrackFromArray(tracks: MixtapeTrack[], id: string): MixtapeTrack[] {
  return tracks.filter((track) => track.id !== id);
}

/**
 * Edit slot (Report 24 §4): a published mixtape opened in the builder. Shares
 * the MixtapeDraft shape so every builder op (add/remove/move/setMeta) works on
 * `active = edit ?? create` unchanged.
 */
export interface MixtapeEditSession extends MixtapeDraft {
  kind: 'edit';
  mixtapeId: string;
  creator: string;
  createdAt: string;
  /** Server revision the edit started from (sent as `expectedRevision`). */
  revision: number;
  baseline: { title: string; description: string; trackIds: string[] };
  baselineVisibility: 'public' | 'owner' | null;
  baselineHiddenReason: string | null;
  /** Stored songs that are no longer public; they are dropped when the edit is saved. */
  privateTrackCount: number;
  /** Started from the create draft via "Edit X instead". */
  fromDraft: boolean;
  /** Normalized payload of the create draft that fed this edit; only THAT draft is consumed on save. */
  originDraftKey?: string | null;
  /** "Review in editor first" from the merge sheet: saving also deletes this source copy. */
  mergeFrom?: MergeSourceSnapshot | null;
}

/**
 * The merge source the owner chose to review ("Review in editor first"). Informational only:
 * saving a reviewed merge PUTs the target and ALWAYS keeps the source (25d pass 3 P1-1).
 */
export interface MergeSourceSnapshot {
  id: string;
  title: string;
}

export function isEditSessionDirty(session: MixtapeEditSession): boolean {
  const { baseline } = session;
  if (session.title !== baseline.title || session.description !== baseline.description) return true;
  if (session.tracks.length !== baseline.trackIds.length) return true;
  return session.tracks.some((track, index) => track.id !== baseline.trackIds[index]);
}

export function parseTracks(value: unknown): MixtapeTrack[] {
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

/**
 * Parse the persisted edit slots (`{ [creator]: session }`). A legacy single
 * session (Report 24 v1) migrates under its own creator; any slot without a
 * creator — or filed under someone else's key — is dropped, so an edit can
 * never surface for an account that did not start it (25d P1-2).
 */
export function parseEditSlots(raw: unknown): Record<string, MixtapeEditSession> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const entries: Array<[string | null, unknown]> =
    'mixtapeId' in record ? [[null, record]] : Object.entries(record);
  const slots: Record<string, MixtapeEditSession> = {};
  for (const [key, candidate] of entries) {
    const session = parseEditSession(candidate);
    if (!session || !session.creator) continue;
    if (key !== null && key !== session.creator) continue;
    if (!slots[session.creator]) slots[session.creator] = session;
  }
  return slots;
}

export function parseEditSession(value: unknown): MixtapeEditSession | null {
  const parsed = value as Partial<MixtapeEditSession> | null;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.mixtapeId !== 'string' || !parsed.mixtapeId) {
    return null;
  }
  const baseline = parsed.baseline && typeof parsed.baseline === 'object' ? parsed.baseline : null;
  if (!baseline) return null;
  const raw = parsed.mergeFrom as Partial<MergeSourceSnapshot> | null | undefined;
  const mergeFrom: MergeSourceSnapshot | null =
    raw && typeof raw.id === 'string' ? { id: raw.id, title: typeof raw.title === 'string' ? raw.title : '' } : null;

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
    originDraftKey: typeof parsed.originDraftKey === 'string' ? parsed.originDraftKey : null,
    mergeFrom,
  };
}

/**
 * What a create POST actually publishes (the API trims title/description, so whitespace-only
 * edits are the same payload). Used for the Retry-After gate and to decide whether a durable
 * draft is still exactly what was published (25d pass 3 P1-3 / P2-1).
 */
export function draftPayloadKey(draft: { title: string; description: string; tracks: { id: string }[] }): string {
  return JSON.stringify([draft.title.trim(), draft.description.trim(), draft.tracks.map((track) => track.id)]);
}
