import type { Smol } from '../types/domain';
import { selectSong, togglePlayPause } from '../stores/audio.svelte.ts';

interface PlaybackControls {
  mixtapeTracks: Smol[];
  currentTrackIndex: number;
  isPlayingAll: boolean;
  onTrackIndexChange: (index: number) => void;
  onPlayingAllChange: (playing: boolean) => void;
}

export function useMixtapePlayback(controls: PlaybackControls) {
  // Don't destructure - keep reference to controls object to access reactive getters

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

  function handlePlayAll() {
    if (controls.mixtapeTracks.length === 0) return;

    // Find first playable track
    const firstTrackIndex = controls.mixtapeTracks.findIndex((t) => t?.Song_1);

    if (firstTrackIndex === -1) {
      alert('No playable tracks found yet. Please wait for tracks to load.');
      return;
    }

    controls.onPlayingAllChange(true);
    controls.onTrackIndexChange(firstTrackIndex);
    selectSong(controls.mixtapeTracks[firstTrackIndex]);
  }

  function stopPlayAll() {
    controls.onPlayingAllChange(false);
    selectSong(null);
    controls.onTrackIndexChange(-1);
  }

  function handleTrackClick(index: number, currentSongId: string | null) {
    const track = controls.mixtapeTracks[index];
    if (!track || !track.Song_1) return;

    // If clicking the currently selected track, toggle play/pause
    if (currentSongId === track.Id) {
      togglePlayPause();
      // Update state to reflect the current track and playback status
      controls.onTrackIndexChange(index);
      controls.onPlayingAllChange(true);
    } else {
      // Otherwise, select and play the new track
      controls.onTrackIndexChange(index);
      controls.onPlayingAllChange(true);
      selectSong(track);
    }
  }

  function playNext() {
    // Find the next track with audio
    for (let i = controls.currentTrackIndex + 1; i < controls.mixtapeTracks.length; i++) {
      if (controls.mixtapeTracks[i]?.Song_1) {
        controls.onTrackIndexChange(i);
        selectSong(controls.mixtapeTracks[i]);
        return;
      }
    }

    // If Play All is enabled, wrap around to beginning
    if (controls.isPlayingAll) {
      for (let i = 0; i < controls.currentTrackIndex; i++) {
        if (controls.mixtapeTracks[i]?.Song_1) {
          controls.onTrackIndexChange(i);
          selectSong(controls.mixtapeTracks[i]);
          return;
        }
      }
    }

    // No more tracks
    controls.onPlayingAllChange(false);
    controls.onTrackIndexChange(-1);
  }

  function playPrevious() {
    if (controls.currentTrackIndex < 0) return;

    // Find the previous track with audio
    for (let i = controls.currentTrackIndex - 1; i >= 0; i--) {
      if (controls.mixtapeTracks[i]?.Song_1) {
        controls.onTrackIndexChange(i);
        selectSong(controls.mixtapeTracks[i]);
        return;
      }
    }

    // Wrap around to end
    for (let i = controls.mixtapeTracks.length - 1; i >= controls.currentTrackIndex; i--) {
      if (controls.mixtapeTracks[i]?.Song_1) {
        controls.onTrackIndexChange(i);
        selectSong(controls.mixtapeTracks[i]);
        return;
      }
    }
  }

  function handleKeyboard(event: KeyboardEvent) {
    // Ignore if user is typing in an input/textarea
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    switch (event.key) {
      case ' ':
        event.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowRight':
        event.preventDefault();
        playNext();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        playPrevious();
        break;
    }
  }

  function setupMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        playPrevious();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        playNext();
      });

      navigator.mediaSession.setActionHandler('play', () => {
        togglePlayPause();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        togglePlayPause();
      });
    }
  }

  function updateMediaSessionMetadata(song: Smol, mixtapeTitle: string) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.Title || 'Unknown Track',
        artist: mixtapeTitle || 'Mixtape',
        album: mixtapeTitle || 'Smol Mixtape',
        artwork: [
          {
            src: `${API_URL}/image/${song.Id}.png?scale=8`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      });
    }
  }

  function clearMediaSessionMetadata() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
    }
  }

  return {
    handlePlayAll,
    stopPlayAll,
    handleTrackClick,
    playNext,
    playPrevious,
    handleKeyboard,
    setupMediaSession,
    updateMediaSessionMetadata,
    clearMediaSessionMetadata,
  };
}
