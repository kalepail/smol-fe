export const uiState = $state({
    isMenuOpen: false
});

export function toggleMenu() {
    uiState.isMenuOpen = !uiState.isMenuOpen;
}

export function closeMenu() {
    uiState.isMenuOpen = false;
}
