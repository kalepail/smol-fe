import { preferences } from './preferences.svelte.ts';

export const backgroundState = $state({
    enableAnimations: false
});

/**
 * Check if animations should be enabled
 * Respects both backgroundState.enableAnimations AND renderMode
 * Fast mode = no animations, Thinking mode = animations enabled
 */
export function getEffectiveAnimationsEnabled(): boolean {
    return backgroundState.enableAnimations && preferences.renderMode === 'thinking';
}

export function setBackgroundAnimations(enabled: boolean) {
    backgroundState.enableAnimations = enabled;
}
