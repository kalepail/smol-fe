import type { MixtapeDraft } from '../types/domain';
import { publishMixtape } from '../services/api/mixtapes';

export function useMixtapePublishing() {
  async function publish(draft: MixtapeDraft) {
    if (draft.tracks.length === 0) {
      throw new Error('Add at least one Smol before publishing.');
    }

    const published = await publishMixtape(draft);
    return published;
  }

  return {
    publish,
  };
}
