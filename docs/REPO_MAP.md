# Repository Map & Architecture

## Search Notes
*   **Method:** `ls -R src`, `view_file package.json`, `view_file astro.config.mjs`
*   **Date:** 2026-01-09

## Tech Stack (Verified)
*   **Framework:** Astro 5.14.1 (SSR Enabled)
*   **UI Library:** Svelte 5.39.9 (Runes)
*   **Style:** TailwindCSS 4.1.14 (Vite Plugin)
*   **Build:** Vite 5 (via Astro)
*   **Deploy:** Cloudflare Pages (`@astrojs/cloudflare` v12.6.9)

## Directory Structure

### `src/pages` (Router)
*   **SSR Context:** All `.astro` files here run on the server (Cloudflare Worker).
*   **Routes:**
    *   `src/pages/index.astro` -> `/`
    *   `src/pages/[id].astro` -> `/:id` (Song Detail)
    *   `src/pages/create.astro` -> `/create` (Creation Flow)
    *   `src/pages/radio.astro` -> `/radio`

### `src/components`
*   **`audio/`**: `BarAudioPlayer.svelte` (Canonical persistent player).
*   **`smol/`**:
    *   `Smol.svelte`: Hybrid component (Splash vs Generator). Orchestrates creation.
    *   `SmolResults.svelte`: Detail view component. Fetching logic isolated here.
*   **`radio/`**: `RadioBuilder.svelte`.

### `src/stores` (Global State)
*   `audio.svelte.ts`: Svelte 5 Rune store for playback state.
*   `user.svelte.ts`: Authentication state.

## Build Pipeline
*   **Command:** `pnpm run build` -> `astro build`
*   **Output:** `dist/` (Static assets + Worker)
*   **Adapter:** Cloudflare Pages (SSR)

## Risk Assessment
1.  **Hydration Latency:** `[id].astro` relies on SSR fetch, or client-side fetch in `SmolResults`.
2.  **Navigation Consistency:** Creation flow uses `history.pushState` (Client-only URL change), creating a "Sticky" state that differs from a fresh page load.
