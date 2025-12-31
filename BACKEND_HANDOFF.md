# 🚨 SMOL BACKEND HANDOFF: BIG BIG UPDATE 🚨

Hey Tyler, we've made significant progress on the Radio and Track Detail UI. We need you to do a thorough sanity check on the following blockchain-coupled features to ensure they are production-ready.

## 🛠 Critical Verification Needed

> [!IMPORTANT]
> **Mentorship Request**: Once you've checked these features, can you help me learn how to test them all myself? I want to be able to verify this stuff independently moving forward!

### 1. Mint & Trade Modals (`MintTradeModal.svelte`)
- **Action**: Verify the end-to-end flow for single track minting and AMM trading.
- **Context**: The UI is now fully wired to use the blue "Trade" button and the minting hook.
- **Goal**: Ensure that when a user clicks "Mint" or "Trade", the Stellar transactions are being built and submitted correctly via the backend.

### 2. Contract Functions
- **Action**: Audit all contract-related interactions (likes, minting, trading, and mixtape publishing).
- **Context**: We've updated the frontend stores (runes) and hooks.
- **Goal**: Confirm that the backend correctly handles the responses from the smart contracts and updates the D1/KV stores without lag or state mismatches.

### 3. Song Publishing & Visibility (`/[id]` page)
- **Action**: Verify the `PUT /:id` endpoint for toggling `Public` status.
- **Context**: Users can now publish/unpublish their tracks directly from the detailed view.
- **Goal**: Confirm ownership validation is strictly enforced and that the database state updates immediately to reflect visibility changes on the home feed.

### 4. Live API & DB Integration (CRITICAL)
- **Problem**: Development was done using `smols-snapshot.json` due to local API limitations.
- **Action**: Verify that all song-fetching logic in `RadioBuilder.svelte` and `ArtistResults.svelte` works correctly with the **LIVE** database.
- **Goal**: Ensure:
    - **Live Fetching**: Songs are being pulled from the actual API, not the snapshot.
    - **Sorting Logic**: The popularity and frequency sorting works as intended with live metadata.
    - **Generation Pipeline**: The AI-assisted radio generation correctly maps to live song IDs and successfully fetches their metadata from the backend.

### 5. Generation Pipeline & Versioning
- **Action**: Sanity check the end-to-end workflow (Pixellab -> CF AI -> AI Song Gen -> D1/R2).
- **Context**: We've introduced V1/V2 versioning in the UI. 
- **Goal**: Ensure the backend correctly associates multiple song variants with a single prompt/ID and that the "best version" flag (D1) stays synced when users swap variants.

### 6. Logged-in Features
- **Action**: Test every feature that requires authentication.
- **Goal**: Verify:
    - **Likes**: Toggling likes on the Radio and Artist pages.
    - **Ownership Checks**: Ensuring only the original creator can "Publish/Unpublish" or "Delete" tracks on the detailed `/[id]` page.
    - **Publish Button Login Gate**: The "Publish" button on `/[id]` is now located within the player controls (replaces the Mint button for owners) and MUST be login-gated. Verify that clicking it without a session triggers the login flow.

## 📚 Module Reference Syllabus

To help you navigate, these are the primary files involved in the features listed above:

### 1. Radio & Generation
- **[`RadioBuilder.svelte`](file:///src/components/radio/RadioBuilder.svelte)**: Core logic for radio generation, tag management, AI-assisted "Dream Mode", and session state persistence.
- **[`RadioResults.svelte`](file:///src/components/radio/RadioResults.svelte)**: The radio dashboard. Contains the "Trade" button logic and mobile scroller styling.
- **[`RadioPlayer.svelte`](file:///src/components/radio/RadioPlayer.svelte)**: High-fidelity audio player with integrated 'Like' and variant switching.

### 2. Blockchain & Trading
- **[`MintTradeModal.svelte`](file:///src/components/shared/MintTradeModal.svelte)**: The central component for Stellar AMM trades and track minting. Connects frontend actions to contract calls.
- **[`TokenBalancePill.svelte`](file:///src/components/shared/TokenBalancePill.svelte)**: Displays live token balances; useful for verifying transaction outcomes in the UI.

### 3. Track Detail & Metadata
- **[`SmolResults.svelte`](file:///src/components/smol/SmolResults.svelte)**: The detailed `/[id]` view. Manages V1/V2 versioning, lyrics display, and the "Publish/Unpublish" owner tools.
- **[`ArtistResults.svelte`](file:///src/components/artist/ArtistResults.svelte)**: Manages artist-specific track lists and "Fresh Drops" sorting logic.

### 4. Global Architecture
- **[`audio.svelte.ts`](file:///src/stores/audio.svelte.ts)**: Global audio rune; ensures music doesn't stop when users navigate between Radio and Artist pages.
- **[`user.svelte.ts`](file:///src/stores/user.svelte.ts)**: Global authentication state; used to guard owner-only tools and 'Like' features.
- **[`global.css`](file:///src/styles/global.css)**: Contains the `.dark-scrollbar` utility and Glass design system tokens.

---

**Note**: The UI is now very polished and reactive. If you see any errors in the console during these tests, please flag them immediately so we can adjust the frontend error handling.

Let's get this perfectly wired up! 🚀🪐✨
