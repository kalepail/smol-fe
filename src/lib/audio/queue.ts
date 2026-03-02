import type { Smol } from "../../types/domain";

/**
 * Pure helper to determine the next track in the queue.
 * Wraps around to the start (playlist behavior).
 */
export function getNextTrack(
    playlist: Smol[],
    currentId: string | null
): Smol | null {
    if (!playlist || playlist.length === 0) return null;
    if (!currentId) return playlist[0];

    const currentIndex = playlist.findIndex((s) => s.Id === currentId);
    if (currentIndex === -1) return playlist[0];

    const nextIndex = (currentIndex + 1) % playlist.length;
    return playlist[nextIndex];
}
