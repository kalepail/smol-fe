import type { MixtapeDraft } from '../types/domain';
import { publishMixtape, updateMixtape } from '../services/api/mixtapes';

export function useMixtapePublishing() {
  async function publish(draft: MixtapeDraft) {
    if (draft.tracks.length === 0) {
      throw new Error('Add at least one Smol before publishing.');
    }

    const published = await publishMixtape(draft);
    return published;
  }

  async function update(id: string, draft: MixtapeDraft) {
    if (draft.tracks.length === 0) {
      throw new Error('Add at least one Smol before updating.');
    }

    const updated = await updateMixtape(id, draft);
    return updated;
  }

  return {
    publish,
    update,
  };
}
