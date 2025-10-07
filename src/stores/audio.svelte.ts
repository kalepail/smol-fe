import type { Smol } from '../types/domain';

/**
 * Audio state management using Svelte 5 runes
 * Pure state only - no DOM manipulation or side effects
 */

// Core reactive state
export const audioState = $state<{
  playingId: string | null;
  currentSong: Smol | null;
  audioElement: HTMLAudioElement | null;
  progress: number;
  songNextCallback: (() => void) | null;
}>({
  playingId: null,
  currentSong: null,
  audioElement: null,
  progress: 0,
  songNextCallback: null,
});

/**
 * Derived state function: Check if audio is currently playing
 */
export function isPlaying(): boolean {
  return (
    audioState.playingId !== null &&
    audioState.currentSong !== null &&
    audioState.playingId === audioState.currentSong.Id
  );
}

/**
 * Set the audio element reference (called from component on mount)
 */
export function setAudioElement(element: HTMLAudioElement | null) {
  audioState.audioElement = element;
}

/**
 * Update progress (called from component's event handlers)
 */
export function updateProgress(currentTime: number, duration: number) {
  if (duration > 0) {
    audioState.progress = (currentTime / duration) * 100;
  } else {
    audioState.progress = 0;
  }
}

/**
 * Select a song and mark it to play
 */
export function selectSong(songData: Smol | null) {
  if (songData) {
    audioState.currentSong = songData;
    audioState.playingId = songData.Id;
  } else {
    audioState.currentSong = null;
    audioState.playingId = null;
  }
}

/**
 * Toggle play/pause state
 */
export function togglePlayPause() {
  const { playingId, currentSong } = audioState;

  if (currentSong) {
    if (playingId === currentSong.Id) {
      // Pause
      audioState.playingId = null;
    } else {
      // Play
      audioState.playingId = currentSong.Id;
    }
  }
}

/**
 * Reset audio state to initial values
 */
export function resetAudioState() {
  audioState.playingId = null;
  audioState.currentSong = null;
  audioState.progress = 0;
}

/**
 * Register a callback for playing the next song
 * This allows pages to control what happens when a song ends
 */
export function registerSongNextCallback(callback: (() => void) | null) {
  audioState.songNextCallback = callback;
}

/**
 * Call the registered next song callback if it exists
 */
export function playNextSong() {
  if (audioState.songNextCallback) {
    audioState.songNextCallback();
  }
}
