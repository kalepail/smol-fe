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
  songPrevCallback: (() => void) | null;
  // Web Audio API fields
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  sourceNode: MediaElementAudioSourceNode | null;
  duration: number;
  repeatMode: "off" | "once" | "one";
}>({
  playingId: null,
  currentSong: null,
  audioElement: null,
  progress: 0,
  songNextCallback: null,
  songPrevCallback: null,
  audioContext: null,
  analyser: null,
  sourceNode: null,
  duration: 0,
  repeatMode: "off",
});

// ... existing code ...

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
