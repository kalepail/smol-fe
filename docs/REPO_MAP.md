<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md | Subordinate]
- AUDIENCE: [Dev | Agent]
- NATURE: [Current]
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [Link check | Claim check | State trace]
-->
# Smol FE Repository Map

## Overview
- **Stack**: Astro + Svelte 5 (Runes) + TailwindCSS
- **State Management**: Svelte 5 Rune Stores (`src/stores/`)
- **API**: Astro Endpoints (`src/pages/api/*`), Backend Handoff (`BACKEND_HANDOFF.md`)
- **Blockchains**: Stellar (Soroban) via `smol-sdk` and `comet-sdk`.

## Directory Structure

### Top Level
- `.agent/`: Antigravity configuration (Rules, Skills, Workflows).
- `ext/`: Linked dependencies (`smol-sdk`, `comet-sdk`).
- `scripts/`: Utility scripts (data processing, snapshot management).
- `src/`: Source code.

### Source (`src/`)
- **`components/`**: UI building blocks.
  - `components/labs/`: Experiments (Asteroids, Quiz, Roulette).
  - `components/ui/`: Shared atomic components.
- **`pages/`**: Routing.
  - `pages/api/`: Server-side API endpoints.
  - `pages/labs/`: Labs section pages.
  - `pages/[id].astro`: Song detail page (potential consistency hotspot).
- **`services/`**: Business logic & Integrations.
  - `services/ai/`: Gemini/AI integration.
  - `services/api/`: Wrapper for backend API calls.
  - `services/tags/`: Tag logic.
- **`stores/`** (⚠️ HOTSPOT): Global state using Svelte 5 Runes.
  - `audio.svelte.ts`: Audio playback state (Howler/WebAudio).
  - `user.svelte.ts`: Auth & User profile state.
  - `preferences.svelte.ts`: Local persistence.
- **`utils/`**: Helpers.

## Key Hotspots & Danger Zones
1.  **Audio State** (`src/stores/audio.svelte.ts`):
    - Central playback logic. Modifications here affect Global Player, Radio, and Artist pages.
2.  **Auth & Tipping** (Requires Ralph Loop):
    - **Passkey Kit**: Hard interaction with `passkey-kit` and `OpenZeppelin Relayer`.
    - **Relayer**: Configured via environment variables (~`RELAYER_URL`).
    - **Files**: `src/stores/user.svelte.ts`, [rpc.ts](../src/utils/rpc.ts)
3.  **Data Consistency**:
    - `GalacticSnapshot.json` (Static) vs Live API.
    - [snapshot.ts](../src/services/api/snapshot.ts): Unification logic.
4.  **Svelte 5 Runes**:
    - This project uses Runes (`$state`, `$effect`). Do NOT introduce Svelte 4 stores (`writable`) without good reason.

## Deploy
- **Target**: Cloudflare Pages.
- **Config**: `wrangler.toml`.
- **Constraint**: Edge runtime limitations apply.
