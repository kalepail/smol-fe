<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Dev, Product
- NATURE: Audit / Backlog
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [Product Trace | State Trace]
-->
# Core Product UX Audit (Music Site)

| Status | PR ID | Focus | Source |
| :--- | :--- | :--- | :--- |
| ✅ **EXECUTED** | PR-01 | Buffering state + play gating | [`audio.svelte.ts`](../src/stores/audio.svelte.ts) |
| ⏳ PENDING | PR-02 | Detail loading resilience | `SmolResults.svelte` |
| ⏳ PENDING | PR-03 | MediaSession consolidation | `BarAudioPlayer.svelte` |
| ⏳ PENDING | PR-04 | List-hover prefetching | `SmolCard.svelte` |

---

## Playback + Navigation State Machine (text)
```
STATE: IDLE
  - on USER_SELECT_TRACK -> LOADING_SOURCE
  - on ROUTE_CHANGE (to detail) -> LOADING_DETAIL

STATE: LOADING_SOURCE
  - on SOURCE_SET -> WAITING_METADATA
  - on ERROR -> ERROR

STATE: WAITING_METADATA
  - on METADATA_LOADED -> READY
  - on BUFFERING -> BUFFERING
  - on ERROR -> ERROR

STATE: READY
  - on USER_PLAY -> PLAYING
  - on USER_SEEK -> SEEKING (then READY)
  - on ROUTE_CHANGE -> READY (continue playback)

STATE: PLAYING
  - on USER_PAUSE -> READY
  - on TRACK_END + REPEAT=one -> PLAYING (loop)
  - on TRACK_END + REPEAT=once -> PLAYING (loop once, set REPEAT=off)
  - on TRACK_END + REPEAT=off -> READY + PLAY_NEXT
  - on BUFFERING -> BUFFERING
  - on ROUTE_CHANGE -> PLAYING (continue playback)

STATE: BUFFERING
  - on CAN_PLAY -> PLAYING (or READY if paused)
  - on USER_PAUSE -> READY
  - on ERROR -> ERROR

STATE: LOADING_DETAIL
  - on DETAIL_READY -> READY
  - on DETAIL_404 -> RETRYING
  - on RETRY_EXHAUSTED -> ERROR

STATE: ERROR
  - on USER_RETRY -> LOADING_SOURCE or LOADING_DETAIL
```

### Mismatches / Missing Transitions
- **No explicit BUFFERING state in UI** → “dead air” when `play()` is called and audio isn’t ready.
- **Multiple `play()` calls** can be triggered from different effects (source change, playingId change, onloadeddata), causing race conditions.
- **Playback intent vs actual playback** is conflated (using `playingId` for both) which makes “autoplay blocked” and “loading” difficult to represent distinctly.

## Findings Table
| Issue | Evidence (file/function) | Why it matters | Fix (small diff) | Risk | Test steps |
|---|---|---|---|---|---|
| Duplicate `play()` triggers (race conditions on rapid switches) | `BarAudioPlayer.svelte` (play/pause effect + onloadeddata `play()`), `AudioManager` restores time on load | iOS glitches and rejected play promises; perceived flakiness | Add a `playIntentId` + `isBuffering` state in store; gate `play()` to a single effect | Low | Navigate quickly across songs; spam play/pause; ensure no console errors |
| No buffering UI | `BarAudioPlayer.svelte` uses audio events but no `waiting`/`stalled` UI, `SmolResults` uses loading but playback has no buffering indication | Users see “dead air” during slow network or initial load | Track `isBuffering` from audio events and show a subtle spinner in player | Low | Simulate slow 3G; play a song and confirm spinner appears |
| Immediate 404 after create not fully handled | `SmolResults.svelte` polls but the first 404 results in “Song not found” unless polling starts; `fetchData` has immediate 404 logic but error path can still win | Newly created tracks feel broken | Add exponential backoff + “pending” banner with retry button; prefer polling until partial data | Low | Create song and navigate to detail instantly; confirm it recovers |
| Metadata/seek mismatch | `BarAudioPlayer.svelte` seeks from progress % in onloadeddata; progress is stored even when duration is 0 | Can seek to wrong position or do extra work | Gate seek restore until `duration > 0` and metadata loaded | Low | Reload page mid-track, verify resume matches |
| MediaSession handlers are set in multiple places | `AudioManager.svelte` and `BarAudioPlayer.svelte` both set action handlers | Conflicting handlers can cause inconsistent play/pause/next | Centralize MediaSession in one component | Low | Use OS media controls; verify play/pause works |
| Prefetching limited to next track only | `AudioManager.svelte` prefetches next audio only from playlist | Clicking from list to detail still feels slow | Add list-hover prefetch (detail + audio) with low priority | Low | Hover/click from list; verify faster transition |

## Patch Plan (small PRs)
**PR-01: Add buffering state + gating for `play()`**
- Add `isBuffering` + `playIntentId` to `audioState`.
- Update `BarAudioPlayer` to set `isBuffering` on `waiting/stalled/playing`.
- Gate `play()` so only one call occurs per intent.
- Acceptance: rapid play switching has no console errors; buffering indicator visible.

**PR-02: Stabilize detail loading for newly created tracks**
- In `SmolResults`, add retry/backoff that treats initial 404s as pending.
- Add “Still generating…” message with retry button.
- Acceptance: opening track immediately after creation eventually loads without manual refresh.

**PR-03: MediaSession consolidation**
- Move MediaSession action handlers into a single component (likely `BarAudioPlayer`).
- Remove duplicate handlers to avoid conflicts.
- Acceptance: lock-screen controls work consistently.

**PR-04: Prefetch detail + audio on list hover**
- Add a lightweight prefetch function to list cards (home grid), using `fetch()` with `{ priority: 'low' }` and `link rel=prefetch`.
- Acceptance: click-through from list has less delay on first play.

## Quick Wins (no refactor)
1. Add `waiting`/`stalled` listeners to show a small buffering indicator.
2. Add a 1–2 second optimistic skeleton on detail page before showing “not found.”
3. Preload art + audio on list hover.
4. Add `preload="metadata"` for audio to ensure duration is available quickly.
5. Gate `play()` to once per intent to reduce iOS glitches.
