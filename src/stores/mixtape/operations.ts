import type { MixtapeDraft, MixtapeTrack } from '../../types/domain';

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

export function insertTrackInArray(tracks: MixtapeTrack[], track: MixtapeTrack, index: number): MixtapeTrack[] | null {
  if (tracks.some((existing) => existing.id === track.id)) {
    return null;
  }

  const normalized = normalizeTrack(track);
  const clampedIndex = Math.max(0, Math.min(index, tracks.length));
  const updatedTracks = [...tracks];
  updatedTracks.splice(clampedIndex, 0, normalized);

  return updatedTracks;
}

export function addTrackToArray(tracks: MixtapeTrack[], track: MixtapeTrack): MixtapeTrack[] | null {
  if (tracks.some((existing) => existing.id === track.id)) {
    return null;
  }

  return [...tracks, normalizeTrack(track)];
}

export function removeTrackFromArray(tracks: MixtapeTrack[], id: string): MixtapeTrack[] {
  return tracks.filter((track) => track.id !== id);
}
