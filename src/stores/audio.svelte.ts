import type { Smol } from '../types/domain';

/**
 * Audio state management using Svelte 5 runes
 */

// Core reactive state
export const audioState = $state<{
  playingId: string | null;
  currentSong: Smol | null;
  audioElement: HTMLAudioElement | null;
  progress: number;
}>({
  playingId: null,
  currentSong: null,
  audioElement: null,
  progress: 0,
});

// Derived state function
export function isPlaying(): boolean {
  return (
    audioState.playingId !== null &&
    audioState.currentSong !== null &&
    audioState.playingId === audioState.currentSong.Id
  );
}

/**
 * Set the audio element reference (called from component)
 */
export function setAudioElement(element: HTMLAudioElement | null) {
  audioState.audioElement = element;
}

/**
 * Set audio source and load it
 */
export function setAudioSourceAndLoad(url: string) {
  if (audioState.audioElement) {
    audioState.audioElement.src = url;
    audioState.audioElement.load();
  }
}

/**
 * Play audio in the element
 */
export function playAudioInElement() {
  if (audioState.audioElement && audioState.audioElement.src) {
    const playPromise = audioState.audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.error('Error playing audio:', error);
        audioState.playingId = null;
      });
    }
  }
}

/**
 * Pause audio in the element
 */
export function pauseAudioInElement() {
  if (audioState.audioElement) {
    audioState.audioElement.pause();
  }
}

/**
 * Reset audio element to initial state
 */
export function resetAudioElement() {
  if (audioState.audioElement) {
    audioState.audioElement.pause();
    audioState.audioElement.src = '';
    audioState.audioElement.currentTime = 0;
    audioState.progress = 0;
  }
}

/**
 * Update progress in store
 */
export function updateProgressInStore(currentTime: number, duration: number) {
  if (audioState.audioElement?.src) {
    if (duration > 0) {
      audioState.progress = (currentTime / duration) * 100;
    } else {
      audioState.progress = 0;
    }
  } else {
    audioState.progress = 0;
  }
}

/**
 * Select a song, making it the current song and marking it to play
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
 * Toggle play/pause state of the currently selected song
 */
export function togglePlayPause() {
  const { playingId, currentSong } = audioState;

  console.log('togglePlayPause called', {
    playingId,
    currentSongId: currentSong?.Id
  });

  if (currentSong) {
    if (playingId === currentSong.Id) {
      console.log('Pausing - setting playingId to null');
      audioState.playingId = null;
    } else {
      console.log('Playing - setting playingId to', currentSong.Id);
      audioState.playingId = currentSong.Id;
    }
  } else {
    console.log('No current song, cannot toggle');
  }
}

/**
 * Get current progress value (for components that need read-only access)
 */
export function getAudioProgress(): number {
  return audioState.progress;
}

/**
 * Get current playing ID (for components that need read-only access)
 */
export function getPlayingId(): string | null {
  return audioState.playingId;
}

/**
 * Get current song (for components that need read-only access)
 */
export function getCurrentSong(): Smol | null {
  return audioState.currentSong;
}
