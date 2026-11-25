import type { MixtapeDraft, SmolDetailResponse } from '../types/domain';
import { publishMixtape } from '../services/api/mixtapes';
import { fetchWithTimeout } from '../services/api/fetch';

export type TrackIssueKind = 'private' | 'unverified';

export class MixtapeValidationError extends Error {
  readonly issues: Record<string, TrackIssueKind>;

  constructor(message: string, issues: Record<string, TrackIssueKind>) {
    super(message);
    this.name = 'MixtapeValidationError';
    this.issues = issues;
  }
}

const API_URL = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

export async function verifyDraftTrackVisibility(
  draft: MixtapeDraft,
  onVisibilityResolved?: (id: string, isPublic: 0 | 1) => void
): Promise<{ draft: MixtapeDraft; issues: Record<string, TrackIssueKind> }> {
  const tracks = draft.tracks.map((track) => ({ ...track }));
  const unknownTracks = tracks.filter((track) => track.public === undefined);

  if (unknownTracks.length > 0 && API_URL) {
    await Promise.all(
      unknownTracks.map(async (track) => {
        try {
          const response = await fetchWithTimeout(`${API_URL}/${encodeURIComponent(track.id)}`, {
            credentials: 'include',
            timeout: 8_000,
          });
          if (!response.ok) return;
          const detail = (await response.json()) as SmolDetailResponse;
          const pub = detail?.d1?.Public;
          if (pub === 0 || pub === 1) {
            track.public = pub;
            onVisibilityResolved?.(track.id, pub);
          }
        } catch {
          // Leave undefined so validation flags this specific track cleanly.
        }
      })
    );
  }

  const issues: Record<string, TrackIssueKind> = {};
  for (const track of tracks) {
    if (track.public === 0) {
      issues[track.id] = 'private';
    } else if (track.public === undefined) {
      issues[track.id] = 'unverified';
    }
  }

  return {
    draft: { ...draft, tracks },
    issues,
  };
}

export function useMixtapePublishing() {
  async function publish(
    draft: MixtapeDraft,
    onVisibilityResolved?: (id: string, isPublic: 0 | 1) => void
  ) {
    if (draft.tracks.length === 0) {
      throw new Error('Add at least one song before publishing.');
    }

    const { draft: verifiedDraft, issues } = await verifyDraftTrackVisibility(
      draft,
      onVisibilityResolved
    );

    const issueIds = Object.keys(issues);
    if (issueIds.length > 0) {
      const hasPrivate = issueIds.some((id) => issues[id] === 'private');
      const hasUnverified = issueIds.some((id) => issues[id] === 'unverified');
      if (hasPrivate) {
        throw new MixtapeValidationError(
          'Mixtapes can only include public songs. Remove the flagged private track(s) to publish.',
          issues
        );
      }
      if (hasUnverified) {
        throw new MixtapeValidationError(
          'Could not verify visibility for the flagged track(s). Remove or re-add them to publish.',
          issues
        );
      }
    }

    const published = await publishMixtape(verifiedDraft);
    return published;
  }

  return {
    publish,
  };
}
