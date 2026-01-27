<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md | Subordinate]
- AUDIENCE: [Dev | Agent]
- NATURE: [Current]
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [Link check | Claim check | State trace]
-->
# Routes and Pages

## Route Inventory
Generated from `src/pages`.

### Top-Level Routes
| Route | File Path | Type | Key Component(s) | Data Source |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `src/pages/index.astro` | SSR | `SmolGrid.svelte` | Client Fetch |
| `/[id]` | `src/pages/[id].astro` | SSR | `SmolResults.svelte` | SSR Fetch + Client Fetch |
| `/create` | `src/pages/create.astro` | SSR | `Smol.svelte` (client:only) | `useSmolGeneration` |
| `/radio` | `src/pages/radio.astro` | SSR | `RadioBuilder.svelte` | Snapshot + Live |
| `/artists` | `src/pages/artists.astro` | SSR | `ArtistsIndex.svelte` | Client Fetch |

### Navigation Mechanics: Create Flow
**File:** `src/hooks/useSmolGeneration.ts`
**Line 35:** `history.pushState({}, '', '/${id}')`
*   **Behavior:** Updates the URL visually to the song ID.
*   **Impact:** **Does NOT trigger an Astro route transition.** The user stays on the "Page" context of `create.astro`, but the browser URL says `/[id]`.
*   **Result:** The application state relies on `Smol.svelte`'s polling loop (`getGen`). The user sees the progress and eventual result because `Smol.svelte` handles the UI state.
*   **Contrast:** If the user hits Refresh, the browser loads `src/pages/[id].astro` (The "True" Detail Page), which uses a completely different fetching strategy (Single-Shot SSR + Client Fetch).

## Critical Stability Bug
The "Fresh" load (Refresh/New Tab) lacks the reliability of the "Sticky" load (Create Flow).
*   **Sticky:** Polls until success.
*   **Fresh:** Fetches once. If DB lags -> 404 Error.
