/**
 * Mixtape store - modular implementation
 * Re-exports from the modular structure for backward compatibility
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
  loadPublishedMixtape,
  touchMixtapeDraft,
  getSnapshotDraft,
  enterMixtapeMode,
  exitMixtapeMode,
  toggleMixtapeMode,
  mixtapeDraft,
  mixtapeMode,
} from './mixtape/index';
