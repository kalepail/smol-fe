# Repro Matrix: Create → View Detail Flow

## Test Scenarios

| Scenario | Steps | Navigation Method | Expected Behavior | Observed Risk |
| :--- | :--- | :--- | :--- | :--- |
| **A. "Sticky" Flow** | 1. Create song<br>2. Wait for completion on same page | `history.pushState` (No Router) | `Smol.svelte` polls `getGen` until complete. UI updates inline. | **Low Risk.** <br>Polling ensures data is present before display. URL updates silently. |
| **B. "Fresh" Entry** | 1. Create song<br>2. Immediately Refresh (F5) OR Copy Link -> New Tab | SSR (`[id].astro`) | `[id].astro` and `SmolResults` fetch API immediately. | **High Risk.** <br>If API Read Replica lag > 0s, SSR returns 404/Null. Component mounts with no data and no retry. |

## Evidence
*   **Source:** `src/hooks/useSmolGeneration.ts:35` -> `history.pushState`
*   **Source:** `src/components/smol/SmolResults.svelte:123` -> Single `fetch` call on mount.

## Fix Recommendation
Align "Fresh" Entry reliability with "Sticky" Flow reliability.
1.  **Modify `SmolResults.svelte`:** Add polling/retry logic if the initial fetch returns 404/Null.
2.  **UX:** Show "Finalizing..." instead of "Error" during the polling phase.
