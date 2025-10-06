import type { Smol } from '../types/domain';

/**
 * Hook for managing Media Session API in grid contexts
 */
export function useGridMediaSession() {
  function setupMediaSessionHandlers(
    onPrevious: () => void,
    onNext: () => void
  ) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', onPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', onNext);
    }

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      }
    };
  }

  function updateMediaMetadata(song: Smol | null, apiUrl: string) {
    if (!('mediaSession' in navigator)) return;

    if (song) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.Title,
        artist: 'Smol',
        album: 'Smol',
        artwork: [
          {
            src: `${apiUrl}/image/${song.Id}.png?scale=8`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  }

  function findNextSong(
    results: Smol[],
    currentSongId: string | undefined
  ): Smol | null {
    if (results.length === 0) return null;

    let nextIndex = 0;

    if (currentSongId) {
      const currentIndex = results.findIndex((smol) => smol.Id === currentSongId);
      if (currentIndex !== -1 && currentIndex < results.length - 1) {
        nextIndex = currentIndex + 1;
      }
    }

    return results[nextIndex];
  }

  function findPreviousSong(
    results: Smol[],
    currentSongId: string | undefined
  ): Smol | null {
    if (results.length === 0) return null;

    const currentIndex = results.findIndex((s) => s.Id === currentSongId);

    if (currentIndex > 0) {
      return results[currentIndex - 1];
    } else if (results.length > 0) {
      return results[results.length - 1];
    }

    return null;
  }

  return {
    setupMediaSessionHandlers,
    updateMediaMetadata,
    findNextSong,
    findPreviousSong,
  };
}
