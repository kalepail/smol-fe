<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md | Subordinate]
- AUDIENCE: [Dev | Agent]
- NATURE: [Current]
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [State trace]
-->
# Data Flow & Data Models

## Core Entity: `Smol`
Refers to the Song/Track object. Type definition located in `src/types/domain.ts` (Imported in `SmolResults.svelte`).

## Data Sources

### 1. Live API (`https://api.smol.xyz`)
*   **Verified via:** `src/hooks/useSmolGeneration.ts`, `src/components/smol/SmolResults.svelte`
*   **Key Endpoints:**
    *   `POST /` (Create)
    *   `GET /[id]` (Read Detail)
    *   `POST /retry/[id]` (Retry Gen)

### 2. Galactic Snapshot (`public/data/GalacticSnapshot.json`)
*   **Usage:**
    *   Radio (`RadioBuilder.svelte`) uses this for seed data.
    *   Merged with Live API data in [smols.ts](../src/services/api/smols.ts).

## Create -> Detail Flow (The "Sticky" vs "Fresh" Gap)
1.  **Creation (Sticky):**
    *   User on `/create` -> `Smol.svelte`.
    *   Submits `POST /`.
    *   App calls `history.pushState` to `/[id]`. **No Router Transition.**
    *   `Smol.svelte` polls `GET /[id]` until status is complete.
2.  **Direct Access (Fresh):**
    *   User loads `/[id]`.
    *   SSR (`[id].astro`) fetches `GET /[id]`.
    *   Client (`SmolResults.svelte`) fetches `GET /[id]`.
    *   **Risk:** If API has read-replica lag, both fetches return 404/Null immediately, leading to an error state.

## Tags & Radio Architecture
*   **Radio:** Client-side logic in `RadioBuilder.svelte`.
*   **Tags:** Derived from `unifiedTags.ts` against the Snapshot data.
*   **Status:** Architecture is "Hybrid" (Snapshot seeds + Live hydration). No known production mismatches.
