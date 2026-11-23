/**
 * Mixtape store - modular implementation
 * Re-exports from the modular structure for backward compatibility
 */
export {
  mixtapeDraftState,
  mixtapeModeState,
  mixtapeSheetState,
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
  openMixtapeSheet,
  closeMixtapeSheet,
  mixtapeDraft,
  mixtapeMode,
} from './mixtape/index';
