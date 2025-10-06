# Svelte 5 & Astro Anti-Patterns Audit

**Date:** 2025-10-06
**Auditor:** Claude Code
**Scope:** Comprehensive review of Svelte 5 runes and Astro best practices violations

---

## Executive Summary

This audit identifies anti-patterns and areas for improvement across the smol-fe codebase related to Svelte 5 runes and Astro framework usage. The primary issues found involve improper use of `$effect` for state synchronization, which should be replaced with `$derived`, and potential performance concerns with Astro view transitions.

**Severity Levels:**
- 🔴 **Critical**: Breaks reactivity or causes bugs
- 🟡 **Warning**: Works but violates best practices
- 🔵 **Info**: Improvement opportunities

---

## Table of Contents

1. [Svelte 5 Runes Anti-Patterns](#svelte-5-runes-anti-patterns)
2. [Astro Integration Issues](#astro-integration-issues)
3. [Store Architecture Concerns](#store-architecture-concerns)
4. [Recommendations](#recommendations)

---

## Svelte 5 Runes Anti-Patterns

### 1. Using `$effect` for State Synchronization 🟡

**Anti-Pattern:** Using `$effect` to copy prop values to local state.

#### Locations Found:

##### `src/components/ui/LikeButton.svelte:29-31`
```svelte
// ❌ ANTI-PATTERN
$effect(() => {
    localLiked = liked;
});
```

**Fix:**
```svelte
// ✅ CORRECT
let localLiked = $derived(liked);
```

**Rationale:** Per Svelte 5 docs: "In general, `$effect` is best considered something of an escape hatch." Use `$derived` for simple reactive transformations.

---

##### `src/components/MintTradeModal.svelte:76-83`
```svelte
// ❌ ANTI-PATTERN
$effect(() => {
    const contractId = userState.contractId;
    const keyId = userState.keyId;
    untrack(() => {
        currentContractId = contractId;
        currentKeyId = keyId;
    });
});
```

**Fix:**
```svelte
// ✅ CORRECT
let currentContractId = $derived(userState.contractId);
let currentKeyId = $derived(userState.keyId);
```

**Impact:** Unnecessary effect, adds complexity. `$derived` is simpler and more idiomatic.

---

##### `src/components/Smol.svelte:64-68`
```svelte
// ❌ ANTI-PATTERN
$effect(() => {
    if (d1?.Song_1 && !best_song) {
        best_song = d1.Song_1;
    }
});
```

**Fix:**
```svelte
// ✅ CORRECT
let best_song = $derived(d1?.Song_1 ?? best_song);
```

**Note:** This might need a more sophisticated fix depending on the intended behavior. If `best_song` should only be set once, consider using a flag or `onMount`.

---

##### `src/components/mixtape/builder/MixtapeBuilder.svelte:205-209`
```svelte
// ❌ ANTI-PATTERN
$effect(() => {
    if (!isDraggingTracks) {
        tracksForDnd = mixtapeDraftState.tracks;
    }
});
```

**Fix Options:**

**Option 1 - $derived (if tracksForDnd is read-only during drag):**
```svelte
// ✅ CORRECT
let tracksForDnd = $derived(isDraggingTracks ? tracksForDnd : mixtapeDraftState.tracks);
```

**Option 2 - Keep $effect if tracksForDnd is mutated during drag:**
```svelte
// ✅ ACCEPTABLE (if truly needed)
// This is a valid use case if tracksForDnd needs to maintain
// its own state during drag operations
$effect(() => {
    if (!isDraggingTracks) {
        tracksForDnd = mixtapeDraftState.tracks;
    }
});
```

**Action Required:** Review the drag-and-drop logic to determine the correct approach.

---

### 2. Valid `$effect` Usage ✅

The following `$effect` usages are **acceptable** as they perform side effects (DOM manipulation, API calls, event handlers):

#### ✅ DOM Manipulation
- `src/components/mixtape/builder/MixtapeBuilder.svelte:186-197` - Managing body padding
- `src/components/mixtape/builder/MixtapeTrackList.svelte:31-35` - Element binding

#### ✅ Media/Audio Synchronization
- `src/components/audio/BarAudioPlayer.svelte:23-47` - Audio element control
- `src/components/audio/BarAudioPlayer.svelte:49-67` - Play/pause synchronization
- `src/components/smol/SmolGrid.svelte:103-106` - Media metadata updates

#### ✅ Data Fetching
- `src/components/smol/SmolGrid.svelte:48-60` - Fetching liked smols
- `src/components/mixtape/MixtapeDetailView.svelte:117-130` - Updating track likes

#### ✅ Complex State Coordination
- `src/components/Smol.svelte:70-78` - Post-mint cleanup and balance update
- `src/components/Smol.svelte:80-94` - Polling for mint status
- `src/components/MintTradeModal.svelte:270-277` - Resetting form on mode change

---

### 3. State Destructuring Issues 🔵

**Concern:** Per Svelte 5 docs: "if you destructure a reactive value, the references are not reactive"

#### Review Required:
Check for any destructuring of reactive state that might break reactivity:

```svelte
// ⚠️ POTENTIAL ISSUE
let { done, text } = todos[0];
todos[0].done = !todos[0].done; // `done` won't update
```

**Action:** Search codebase for reactive state destructuring patterns.

---

### 4. Exported State from Modules 🔵

**Current Implementation Review:**

#### `src/stores/*.svelte.ts` files
All stores correctly **do not export reassignable state directly**. They use the pattern:

```typescript
// ✅ CORRECT PATTERN
export const userState = $state({
  contractId: null,
  keyId: null,
});

// Export functions, not direct assignments
export function setContractId(id: string | null) {
  userState.contractId = id;
}
```

**Status:** ✅ No issues found.

---

## Astro Integration Issues

### 1. View Transitions with Persisted Components 🟡

**Issue:** Mixing `transition:persist` with Svelte reactive stores causes state staleness.

#### Location: `src/layouts/Layout.astro:99-100`
```astro
<Header {_kid} {_cid} _balance={_balance} client:load transition:persist="header" />
<MixtapeBuilderOverlay client:idle transition:persist="mixtape-overlay" />
```

**Problem:**
- When components persist across navigation, Svelte stores retain old values
- Server-rendered props change, but persisted component state doesn't update
- This caused the balance flash issue (4,600 KALE → 3,800 KALE)

**Fix Applied in `UserMenu.svelte:30-33`:**
```svelte
// Always sync server balance to prevent stale persisted state
if (initialBalance !== null) {
  balanceState.balance = BigInt(initialBalance);
}
```

**Recommendation:** Consider whether `transition:persist` is necessary for these components, or if a different state management approach would be cleaner.

---

### 2. Client Directive Usage 🔵

**Current Usage Pattern:**
```astro
client:load     - 5 instances (Account, Header, Smol, MixtapeDetailLoader)
client:visible  - 6 instances (Home, MixtapesIndex, Leaderboard)
client:idle     - 1 instance (MixtapeBuilderOverlay)
```

**Recommendations:**
- ✅ `client:idle` for MixtapeBuilderOverlay is optimal (non-critical overlay)
- ✅ `client:visible` for infinite scroll lists is correct
- 🔵 Review `client:load` usage - could some be `client:idle` for better performance?
  - Example: Header could potentially be `client:idle` since it's not immediately interactive

---

### 3. Missing Astro View Transitions Best Practices 🔵

**Current State:**
- ✅ Uses `<ClientRouter fallback="swap" />` in Layout.astro
- ✅ Components use `transition:persist` for state continuity
- 🔵 Missing: Explicit `transition:animate` directives for custom animations
- 🔵 No accessibility considerations documented (prefers-reduced-motion)

**Recommendations:**
1. Add accessibility meta tags for view transitions
2. Consider using `@view-transition` CSS at-rule for zero-JS transitions
3. Document transition behavior expectations

---

## Store Architecture Concerns

### 1. Store Pattern Consistency ✅

**Analysis:** All stores follow a consistent, good pattern:

```typescript
// ✅ GOOD PATTERN
export const [name]State = $state({ ... });

export function update[Name](...) {
  [name]State.property = value;
}

export function get[Name]() {
  return [name]State.property;
}
```

**Examples:**
- `src/stores/user.svelte.ts` ✅
- `src/stores/audio.svelte.ts` ✅
- `src/stores/balance.svelte.ts` ✅
- `src/stores/mixtape/state.svelte.ts` ✅

**Status:** No anti-patterns found.

---

### 2. Computed Properties Pattern 🔵

**Current Pattern in `mixtape/state.svelte.ts:29-43`:**
```typescript
export const mixtapeDraftHasContent = {
  get value() {
    return Boolean(
      mixtapeDraftState.title ||
      mixtapeDraftState.description ||
      mixtapeDraftState.tracks.length > 0
    );
  }
};
```

**Alternative (More Idiomatic):**
```typescript
// Could use $derived for direct reactive access
export const mixtapeDraftHasContent = $derived(
  Boolean(
    mixtapeDraftState.title ||
    mixtapeDraftState.description ||
    mixtapeDraftState.tracks.length > 0
  )
);
```

**Note:** Current pattern works, but requires `.value` access. Consider if direct `$derived` is cleaner.

---

### 3. Side Effects in Stores 🔵

**Current Implementation:**
Stores are pure - no side effects like localStorage, API calls, etc. Side effects are handled in:
- Dedicated modules (`mixtape/persistence.ts`)
- Component hooks (`useAuthentication`, `useMintPolling`)

**Status:** ✅ Good separation of concerns.

---

## Recommendations

### High Priority 🔴

1. **Fix `$effect` → `$derived` anti-patterns**
   - Files: `LikeButton.svelte`, `MintTradeModal.svelte`, `Smol.svelte`
   - Impact: Code clarity, potential performance improvement
   - Effort: Low (30 minutes)

2. **Review MixtapeBuilder drag-and-drop state**
   - Determine if `$effect` is necessary or can be simplified
   - Effort: Medium (1 hour)

### Medium Priority 🟡

3. **Optimize client directives**
   - Review which `client:load` can be `client:idle`
   - Impact: Initial page load performance
   - Effort: Low (15 minutes)

4. **Document view transitions behavior**
   - Add comments explaining `transition:persist` usage
   - Document why certain components persist
   - Effort: Low (30 minutes)

### Low Priority 🔵

5. **Add accessibility for view transitions**
   - Add `prefers-reduced-motion` handling
   - Consider route announcer for screen readers
   - Effort: Medium (1-2 hours)

6. **Review store computed property pattern**
   - Consider migrating `.value` getters to direct `$derived`
   - Impact: API consistency
   - Effort: Low (30 minutes)

7. **Audit for state destructuring**
   - Search for destructuring patterns that might break reactivity
   - Effort: Low (15 minutes)

---

## Svelte 5 Best Practices Checklist

### ✅ Following Best Practices

- [x] Stores export state objects, not reassignable primitives
- [x] Side effects separated from pure state management
- [x] Valid `$effect` usage for DOM manipulation and external APIs
- [x] No direct mutation of props
- [x] Proper use of `untrack` to prevent infinite loops

### ⚠️ Areas for Improvement

- [ ] Replace `$effect` state syncing with `$derived`
- [ ] Review destructuring patterns for reactivity issues
- [ ] Optimize Astro client directives
- [ ] Add accessibility considerations for view transitions
- [ ] Document `transition:persist` behavior

---

## Astro Best Practices Checklist

### ✅ Following Best Practices

- [x] Using ClientRouter for view transitions
- [x] Appropriate use of `client:visible` for below-fold content
- [x] Server-side rendering for initial page load
- [x] Proper integration with Svelte components

### ⚠️ Areas for Improvement

- [ ] Consider `client:idle` over `client:load` where appropriate
- [ ] Add `prefers-reduced-motion` support
- [ ] Document transition persistence strategy
- [ ] Consider zero-JS view transitions with `@view-transition`

---

## Testing Recommendations

1. **Test balance flash fix**
   - Hard reload pages with authentication
   - Navigate between pages with view transitions
   - Verify no balance flashing

2. **Test after `$derived` refactoring**
   - Like/unlike functionality (LikeButton)
   - Modal state changes (MintTradeModal)
   - Song selection (Smol component)
   - Drag-and-drop (MixtapeBuilder)

3. **Performance testing**
   - Measure page load times before/after client directive changes
   - Test view transition smoothness
   - Check for any reactivity regressions

---

## Conclusion

The codebase is generally well-structured and follows most Svelte 5 and Astro best practices. The main areas for improvement are:

1. **Replace `$effect` with `$derived`** where appropriate (4 instances)
2. **Optimize Astro client directives** for better initial load performance
3. **Add accessibility features** for view transitions

These changes are low-effort but will improve code quality, performance, and accessibility.

---

## References

- [Svelte 5 Runes Documentation](https://svelte.dev/docs/svelte/what-are-runes)
- [Svelte 5 $effect Documentation](https://svelte.dev/docs/svelte/$effect)
- [Svelte 5 $derived Documentation](https://svelte.dev/docs/svelte/$derived)
- [Astro View Transitions Guide](https://docs.astro.build/en/guides/view-transitions/)
- [Astro Client Directives](https://docs.astro.build/en/reference/directives-reference/#client-directives)
