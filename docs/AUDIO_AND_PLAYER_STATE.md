# Audio & Player State

## Search Notes
*   **Verified Files:** `src/stores/audio.svelte.ts`, `src/layouts/Layout.astro`, `src/components/audio/BarAudioPlayer.svelte`.

## Architecture
State is managed via Svelte 5 Runes.

### Store (`src/stores/audio.svelte.ts`)
*   **Exports:** `audioState` object.
*   **Fields:** `playingId`, `currentSong`, `audioElement`, `progress`.

### Player Component (`BarAudioPlayer.svelte`)
*   **Mount:** `src/layouts/Layout.astro` (Line 113).
*   **Persistence:** Uses `transition:persist="audio-player"` to survive standard Astro navigations.
*   **Logic:**
    *   Reactive to `audioState.playingId`.
    *   Manages the HTML5 `<audio>` element.
    *   Handles `navigator.mediaSession` for mobile lock-screen controls.

## Persistence Strategy
*   **Standard Nav (`<a>`):** Astro Client Router (`<ClientRouter />` in `Layout.astro`) handles navigation. `transition:persist` keeps the player mounted.
*   **Create Flow:** `history.pushState` bypasses the router entirely, so the player remains mounted naturally.

### Mobile Integration
*   `BarAudioPlayer.svelte` attaches `visibilitychange` and `focus` event listeners to auto-resume playback if interrupted (e.g., by system audio).
*   Uses `navigator.mediaSession` to push metadata (Title, Artist, Artwork) to the OS.
