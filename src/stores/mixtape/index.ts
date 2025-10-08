/**
 * Modular mixtape store - re-exports for backward compatibility
 */
export {
  mixtapeDraftState,
  mixtapeModeState,
  mixtapeDraftHasContent,
  mixtapeTrackIds,
  setTitle,
  setDescription,
  addTrack,
  insertTrack,
  removeTrack,
  moveTrack,
  setTracks,
  resetDraft,
  clearDraft,
  loadDraft,
  touchMixtapeDraft,
  getSnapshotDraft,
  enterMixtapeMode,
  exitMixtapeMode,
  toggleMixtapeMode,
  mixtapeDraft,
  mixtapeMode,
} from './state.svelte';
