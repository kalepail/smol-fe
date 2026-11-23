import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';

export type AddTrackResult = 'added' | 'duplicate' | 'private';

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
  /** Started from the create draft via "Edit X instead": saving consumes that draft. */
  fromDraft: boolean;
}

export function isEditSessionDirty(session: MixtapeEditSession): boolean {
  const { baseline } = session;
  if (session.title !== baseline.title || session.description !== baseline.description) return true;
  if (session.tracks.length !== baseline.trackIds.length) return true;
  return session.tracks.some((track, index) => track.id !== baseline.trackIds[index]);
}
