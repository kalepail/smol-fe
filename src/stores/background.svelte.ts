export const backgroundState = $state({
    enableAnimations: false
});

export function setBackgroundAnimations(enabled: boolean) {
    backgroundState.enableAnimations = enabled;
}
