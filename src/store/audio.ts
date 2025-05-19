import { writable, get } from 'svelte/store';

export const playingId = writable<string | null>(null); // ID of the song that *should be* playing
export const currentSong = writable<any | null>(null); // Data of the currently selected song (can be paused)
export const audioElement = writable<HTMLAudioElement | null>(null);
export const audioProgress = writable<number>(0); // Percentage

// --- HTMLAudioElement Control Functions (primarily for BarAudioPlayer) ---

export function setAudioSourceAndLoad(url: string) {
    const audio = get(audioElement);
    if (audio) {
        audio.src = url;
        audio.load(); // Important to load the new source
    }
}

export function playAudioInElement() {
    const audio = get(audioElement);
    if (audio && audio.src) { // Check if src is set before playing
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error('Error playing audio:', error);
                // If play fails, we should probably reflect this in the state
                playingId.set(null); // Indicate it's not playing
            });
        }
    }
}

export function pauseAudioInElement() {
    const audio = get(audioElement);
    if (audio) {
        audio.pause();
    }
}

export function resetAudioElement() {
    const audio = get(audioElement);
    if (audio) {
        audio.pause();
        audio.src = ''; // Clear the source
        audio.currentTime = 0;
        audioProgress.set(0);
    }
}

export function updateProgressInStore(currentTime: number, duration: number) {
    if (get(audioElement)?.src) { // Only update progress if there's an active audio source
        if (duration > 0) {
            audioProgress.set((currentTime / duration) * 100);
        } else {
            audioProgress.set(0);
        }
    } else {
        audioProgress.set(0); // Reset progress if no source
    }
}

// --- State Management Functions (for UI components to call) ---

/**
 * Selects a song, making it the current song and marking it to play.
 * If null is passed, it stops and deselects any current song.
 */
export function selectSong(songData: any | null) {
    if (songData) {
        currentSong.set(songData);
        playingId.set(songData.Id); // This will trigger BarAudioPlayer to load and play
    } else {
        // This is effectively a "stop" or "deselect" action
        currentSong.set(null);
        playingId.set(null);
        // BarAudioPlayer's reactive logic will call resetAudioElement() when currentSong is null
    }
}

/**
 * Toggles the play/pause state of the currently selected song.
 * If no song is selected, this does nothing.
 */
export function togglePlayPause() {
    const pId = get(playingId);
    const cSong = get(currentSong);

    if (cSong) { // Only proceed if there's a song selected
        if (pId === cSong.Id) { // If it's currently marked as playing
            playingId.set(null); // Mark as paused (BarAudioPlayer will pause the element)
        } else { // If it's selected but marked as paused (pId is null or different)
            playingId.set(cSong.Id); // Mark as playing (BarAudioPlayer will play the element)
        }
    }
} 