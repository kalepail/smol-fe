import type { Smol } from '../types/domain';

/**
 * Audio state management using Svelte 5 runes
 * Pure state only - no DOM manipulation or side effects
 */

// Core reactive state
const AUDIO_STORAGE_KEY = "smol_audio_v1";

// Load from localStorage if available
function loadState(): Partial<typeof audioState> {
  if (typeof window === "undefined") return {};
  try {
    const saved = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    // Validate that we have a valid song object (sanity check)
    if (parsed.currentSong && !parsed.currentSong.Id) return {};
    return {
      playingId: parsed.playingId,
      currentSong: parsed.currentSong,
      progress: parsed.progress || 0,
      duration: parsed.duration || 0,
      repeatMode: parsed.repeatMode || "off"
    };
  } catch (e) {
    console.error("Failed to load audio state", e);
    return {};
  }
}

const savedState = loadState();

export const audioState = $state<{
  playingId: string | null;
  currentSong: Smol | null;
  audioElement: HTMLAudioElement | null;
  progress: number;
  songNextCallback: (() => void) | null;
  songPrevCallback: (() => void) | null;
  // Web Audio API fields
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  sourceNode: MediaElementAudioSourceNode | null;
  duration: number;
  repeatMode: "off" | "once" | "one";
  isCasting: boolean;
  isCastAvailable: boolean;
  // Track if audio was interrupted (not user-paused)
  wasInterrupted: boolean;
  // Next song for pre-caching
  nextSong: Smol | null;
}>({
  playingId: savedState.playingId ?? null,
  currentSong: savedState.currentSong ?? null,
  audioElement: null,
  progress: savedState.progress ?? 0,
  songNextCallback: null,
  songPrevCallback: null,
  audioContext: null,
  analyser: null,
  sourceNode: null,
  duration: savedState.duration ?? 0,
  repeatMode: savedState.repeatMode ?? "off",
  isCasting: false,
  isCastAvailable: false,
  wasInterrupted: false,
  nextSong: null,
});

// Helper to save state (throttled to avoid UI jank)
let saveTimeout: number | null = null;

// Force immediate save (for beforeunload)
function forceSaveState() {
  if (typeof window === "undefined") return;
  const stateToSave = {
    playingId: audioState.playingId,
    currentSong: audioState.currentSong,
    progress: audioState.progress,
    duration: audioState.duration,
    repeatMode: audioState.repeatMode
  };
  localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(stateToSave));
}

// Throttled save (publicly exported as saveState)
export function saveState() {
  if (typeof window === "undefined") return;

  // If a save is already scheduled, do nothing (throttle)
  if (saveTimeout !== null) return;

  saveTimeout = window.setTimeout(() => {
    forceSaveState();
    saveTimeout = null;
  }, 2000); // Save at most once every 2 seconds
}

// Ensure we save on exit
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", forceSaveState);
}

// Cross-tab synchronization (Golfed)
const bId = crypto.randomUUID(), ch = typeof window !== 'undefined' && 'BroadcastChannel' in window && new BroadcastChannel("smol_audio_sync");
if (ch) ch.onmessage = ({ data: d }) => d.type == 'play' && d.src !== bId && audioState.playingId && (audioState.playingId = null);

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isAppleMobile = /iPad|iPhone|iPod/.test(userAgent);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

function teardownAudioContext() {
  if (audioState.sourceNode) {
    try {
      audioState.sourceNode.disconnect();
    } catch (e) { /* ignore */ }
  }
  if (audioState.audioContext) {
    try {
      audioState.audioContext.close();
    } catch (e) { /* ignore */ }
  }
  audioState.audioContext = null;
  audioState.analyser = null;
  audioState.sourceNode = null;
  (window as any).__SMOL_AUDIO_CONTEXT__ = null;
}

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
  if (element && isIOSDevice()) {
    teardownAudioContext();
  }
}

/**
 * Update progress (called from component's event handlers)
 */
export function updateProgress(currentTime: number, duration: number) {
  audioState.duration = duration;
  if (duration > 0) {
    audioState.progress = (currentTime / duration) * 100;
  } else {
    audioState.progress = 0;
  }
}

/**
 * Seek to a specific progress percentage (0-100)
 */
export function seek(progress: number) {
  const audio = audioState.audioElement;
  if (!audio || !audio.duration) return;

  const newTime = (progress / 100) * audio.duration;
  audio.currentTime = newTime;
  audioState.progress = progress;
}

/**
 * Select a song and mark it to play
 */
export function selectSong(songData: Smol | null) {
  if (songData) {
    audioState.currentSong = songData;
    audioState.playingId = songData.Id;

    // Broadcast play event
    ch && ch.postMessage({ type: "play", src: bId });
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
      // User-initiated pause - clear interruption flag
      audioState.playingId = null;
      audioState.wasInterrupted = false;
    } else {
      // Play
      audioState.playingId = currentSong.Id;
      audioState.wasInterrupted = false;

      // Broadcast play event
      ch && ch.postMessage({ type: "play", src: bId });
    }
  }
}

/**
 * Toggle repeat mode: off -> once -> one -> off
 */
export function toggleRepeatMode() {
  const modes: ("off" | "once" | "one")[] = ["off", "once", "one"];
  const currentIdx = modes.indexOf(audioState.repeatMode);
  const nextIdx = (currentIdx + 1) % modes.length;
  audioState.repeatMode = modes[nextIdx];
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
 * Register a callback for playing the previous song
 */
export function registerSongPrevCallback(callback: (() => void) | null) {
  audioState.songPrevCallback = callback;
}

/**
 * Call the registered next song callback if it exists
 */
export function playNextSong() {
  if (audioState.songNextCallback) {
    audioState.songNextCallback();
  }
}

/**
 * Call the registered previous song callback if it exists
 */
export function playPrevSong() {
  if (audioState.songPrevCallback) {
    audioState.songPrevCallback();
  }
}

/**
 * Initialize Web Audio API context and analyzer safely.
 * Reuses existing context/source if available to prevent errors.
 * Uses window persistence to survive HMR.
 * @param force - If true, destroys existing context and recreates it (for recovery)
 */
export function initAudioContext(force = false) {
  const { audioElement } = audioState;

  if (!audioElement) return;

  if (isIOSDevice()) {
    teardownAudioContext();
    return;
  }

  // Force Reset Logic
  if (force) {
    console.warn("[AudioStore] Forcing AudioContext reset...");
    teardownAudioContext();
  }

  // Restore from global cache if available (HMR support)
  if ((window as any).__SMOL_AUDIO_CONTEXT__ && !force) {
    const cached = (window as any).__SMOL_AUDIO_CONTEXT__;
    if (cached.context.state === 'suspended') {
      cached.context.resume();
    }

    // Check if the cached source is linked to the CURRENT audio element
    // If we re-mounted, the element changed, so the old source is invalid for the new element.
    if (cached.source.mediaElement !== audioElement) {
      try {
        const newSource = cached.context.createMediaElementSource(audioElement);
        newSource.connect(cached.analyser);

        // Update cache
        cached.source = newSource;
        (window as any).__SMOL_AUDIO_CONTEXT__ = cached;

        audioState.audioContext = cached.context;
        audioState.analyser = cached.analyser;
        audioState.sourceNode = newSource;
        return;
      } catch (e) {
        console.error("[AudioStore] Failed to update source:", e);
      }
    }

    // Update store references if needed
    if (audioState.audioContext !== cached.context) {
      audioState.audioContext = cached.context;
      audioState.analyser = cached.analyser;
      audioState.sourceNode = cached.source;
    }
    return;
  }

  // If already set up in store, nothing to do
  if (audioState.audioContext && audioState.sourceNode && audioState.analyser && !force) {
    // Check for stale source
    if (audioState.sourceNode.mediaElement !== audioElement) {
      // This case handles store persistence without window cache (rare but possible)
      try {
        const ctx = audioState.audioContext;
        const newSource = ctx.createMediaElementSource(audioElement);
        newSource.connect(audioState.analyser);
        audioState.sourceNode = newSource;
      } catch (e) { /* ignore */ }
    }

    if (audioState.audioContext.state === 'suspended') {
      audioState.audioContext.resume();
    }
    return;
  }

  try {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AudioContextClass) {
      console.error("[AudioStore] Web Audio API not supported in this browser");
      return;
    }
    const ctx = new AudioContextClass();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // Create source
    const source = ctx.createMediaElementSource(audioElement);

    source.connect(analyser);
    analyser.connect(ctx.destination);

    // Update store
    audioState.audioContext = ctx;
    audioState.analyser = analyser;
    audioState.sourceNode = source;

    // Cache globally
    (window as any).__SMOL_AUDIO_CONTEXT__ = {
      context: ctx,
      analyser: analyser,
      source: source
    };


    // Resume immediately if suspended (may fail without gesture, but worth a try)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(e => { /* ignore */ });
    }
  } catch (err) {
    console.warn("Failed to init Audio Context:", err);
  }
}
