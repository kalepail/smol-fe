# Diff Surface Map

Exhaustive inventory of callsites relevant to Song Detail, Navigation, and Creation.

## 1. Detail Fetching (GET API/[id])

### SSR Context
*   `src/pages/[id].astro` (Line 16):
    ```typescript
    const data = await fetch(`${API_URL}/${id}`, ...)
    ```
    *   **Behavior:** Single-shot. Fail -> Render with null data.

### Client Context
*   `src/components/smol/SmolResults.svelte` (Line 123):
    ```typescript
    const res = await fetch(`${API_URL}/${id}`, ...)
    ```
    *   **Behavior:** Single-shot on mount if `id` exists. `fetchSmolData`.
*   `src/hooks/useSmolGeneration.ts` (Line 64):
    ```typescript
    fetch(`${API_URL}/${id}`)
    ```
    *   **Usage:** Used by `getGen` polling in `Smol.svelte`.

## 2. Navigation to Detail (`nav` / `href`)

### Logic-Based Navigation (`navigate()`)
*   `src/components/smol/SmolResults.svelte` (Line 315, 367): `navigate(...)`
*   `src/components/tags/TagExplorer.svelte` (Line 789, 799): `navigate(...)`
*   `src/components/artist/ArtistResults.svelte` (Line 1816, 1823, 2237): `navigate(...)`
*   `src/components/radio/RadioPlayer.svelte` (Lines 907, 988): `navigate('/${currentSong.Id}${from}')`
*   `src/components/player/GlobalPlayer.svelte` (Lines 1269, 1300...): Multiple `navigate` calls.

### HREF Links (`href="..."`)
*   `src/components/player/GlobalPlayer.svelte`: `<a href="/radio">` (Line 247).
*   Need to manually verify grid items in `SmolGrid.svelte` for `href` vs `onclick`. (Likely `onclick` -> `navigate` or `a` tag).

### History API (Bypass)
*   `src/hooks/useSmolGeneration.ts` (Line 35):
    ```typescript
    history.pushState({}, '', `/${id}`);
    ```
    *   **Critical:** This updates the URL *without* triggering a router transition or unmounting `Smol.svelte`.

## 3. Creation Exit
*   **File:** `src/components/Smol.svelte`
*   **Mechanism:**
    *   Calls `generationHook.postGen`.
    *   `postGen` (in hook) calls `history.pushState` to `/[id]`.
    *   `Smol.svelte` remains mounted.
    *   `Smol.svelte` initiates `setInterval(getGen)` to poll for completion.
    *   UI updates reactively (conditionally renders `SmolDisplay` instead of generator).
*   **True Navigation:** Only occurs if user clicks a link (leaving the page) or Refreshes.

## 4. Audio Persistence
*   `src/layouts/Layout.astro`:
    ```astro
    <BarAudioPlayer client:only="svelte" transition:persist="audio-player" />
    ```
    *   **Verified:** Uses `transition:persist`.
*   `src/components/audio/BarAudioPlayer.svelte`
    *   **Verified:** Manages `audioState`.
