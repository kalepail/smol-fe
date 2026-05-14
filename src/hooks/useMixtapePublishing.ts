import type { MixtapeDraft } from '../types/domain';
import { publishMixtape } from '../services/api/mixtapes';

export function useMixtapePublishing() {
  async function publish(draft: MixtapeDraft) {
    if (draft.tracks.length === 0) {
      throw new Error('Add at least one Smol before publishing.');
    }

    if (draft.tracks.some((track) => track.public === 0)) {
      throw new Error('Mixtapes can only include public Smols. Remove private tracks before publishing.');
    }

    if (draft.tracks.some((track) => track.public === undefined)) {
      throw new Error('Some tracks need to be re-added before publishing so their public visibility can be verified.');
    }

    const published = await publishMixtape(draft);
    return published;
  }

  return {
    publish,
  };
}
