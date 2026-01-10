# Hypotheses & Fix Plan

## Root Cause Analysis
**Confirmed:** The "Create" flow uses `history.pushState` and polling, masking any database replication lag. The "Direct Link" flow uses single-shot fetching, exposing the lag.

## Hypotheses
1.  **Replication Lag (High Confidence):** API reads immediately after writes (on a fresh connection) returns 404 or partial data.

## Stability Improvement Plan ("Prime Only")
**Objective:** Make `/[id]` resilient to "Freshly Created" IDs.

### Minimal Diff Plan
**File:** `src/components/smol/SmolResults.svelte`
**Changes:**
1.  Modify `fetchData` to handle 404s gracefully.
2.  If 404, initiate a `setInterval` retry loop (e.g., 1s interval, 10s timeout).
3.  Add a reactive state `isFinalizing` to show a "Finalizing..." spinner instead of the Error UI.

**Verification:**
*   Create Song -> Open in Incognito Tab immediately.
*   Observe "Finalizing..." -> Content Loads.
