# Client-Side Data Fetching Migration

## Overview

This document tracks the migration from server-side data fetching to client-side data fetching across all pages. The goal is to simplify the architecture by having the server ONLY provide authentication tokens (contractId and keyId from JWT), while all other data is fetched client-side.

## Principles

1. **Server-Side**: ONLY `contractId`, `keyId`, and user `balance` (for Header) from JWT cookie
2. **Client-Side**: ALL other data (smols, mixtapes, balances, likes, etc.)
3. **SPA Behavior**: Only Header and MixtapeBuilderOverlay persist across navigation
4. **Clean State**: Each page component manages its own data fetching and loading states

---

## Current State Analysis

### Components with `transition:persist` (SPA-like behavior)

✅ **Keep These:**
- `Header.svelte` - `transition:persist="header"`
- `MixtapeBuilderOverlay.svelte` - `transition:persist="mixtape-overlay"`

❌ **Do NOT Persist:**
- `BarAudioPlayer.svelte` - Should reset per page (currently correct)

### Server-Side Data Fetching Inventory

#### Layout.astro (applies to all pages)
```astro
✅ KEEP: _kid (keyId from JWT)
✅ KEEP: _cid (contractId from JWT)
✅ KEEP: _balance (user's Kale token balance)
```

#### Page-Specific Fetching (ALL TO BE REMOVED)

**1. index.astro** (Home page)
```astro
❌ REMOVE: results - Initial smols list
❌ REMOVE: initialCursor - Pagination cursor
❌ REMOVE: hasMore - Pagination flag
❌ REMOVE: likedTrackIds - User's liked tracks
```

**2. liked.astro**
```astro
❌ REMOVE: results - Liked smols
❌ REMOVE: initialCursor
❌ REMOVE: hasMore
❌ REMOVE: likedTrackIds
```

**3. created.astro**
```astro
❌ REMOVE: results - User's created smols
❌ REMOVE: initialCursor
❌ REMOVE: hasMore
❌ REMOVE: likedTrackIds
```

**4. playlist/[playlist].astro**
```astro
❌ REMOVE: results - Playlist smols
❌ REMOVE: users - Leaderboard data
❌ REMOVE: initialCursor
❌ REMOVE: hasMore
```

**5. mixtapes/[id].astro**
```astro
❌ REMOVE: mixtape - Mixtape details
❌ REMOVE: trackBalances - User's token balances for tracks
❌ REMOVE: likedTrackIds - User's liked tracks
```

**6. [id].astro** (Single smol detail)
```astro
❌ REMOVE: data - Smol details (d1, kv_do, wf, liked)
❌ REMOVE: _mintBalance - User's mint token balance
```

**7. create.astro**
```astro
✅ Already client-only (no changes needed)
```

**8. account.astro**
```astro
✅ Already client-only (no changes needed)
```

**9. mixtapes/index.astro**
```astro
✅ Already client-only (no changes needed)
```

---

## Migration Plan

### Phase 1: Update Svelte Components

#### 1.1 Home.svelte
**File**: `src/components/Home.svelte`

**Current Props:**
```typescript
interface Props {
  results: Smol[];
  playlist?: string | null;
  initialCursor?: string | null;
  hasMore?: boolean;
  endpoint?: string;
  likedTrackIds?: string[];
}
```

**New Props:**
```typescript
interface Props {
  playlist?: string | null;
  endpoint?: string; // "" = home, "liked", "created", "playlist/{name}"
}
```

**Changes:**
- Remove all data props
- Component becomes a simple wrapper for SmolGrid
- SmolGrid handles all data fetching

---

#### 1.2 SmolGrid.svelte
**File**: `src/components/smol/SmolGrid.svelte`

**Current Props:**
```typescript
interface Props {
  results: Smol[];
  playlist: string | null;
  initialCursor?: string | null;
  hasMore?: boolean;
  endpoint?: string;
  likedTrackIds?: string[];
}
```

**New Props:**
```typescript
interface Props {
  playlist?: string | null;
  endpoint?: string;
}
```

**New Internal State:**
```typescript
let results = $state<Smol[]>([]);
let cursor = $state<string | null>(null);
let hasMore = $state(false);
let loading = $state(true);
let error = $state<string | null>(null);
let likedTrackIds = $state<string[]>([]);
```

**Fetch Logic:**
```typescript
async function fetchInitialData() {
  loading = true;
  error = null;

  try {
    // Fetch smols
    const url = endpoint
      ? `${import.meta.env.PUBLIC_API_URL}/${endpoint}?limit=100`
      : `${import.meta.env.PUBLIC_API_URL}?limit=100`;

    const response = await fetch(url, { credentials: 'include' });
    const data = await response.json();

    results = data.smols || [];
    cursor = data.pagination?.nextCursor || null;
    hasMore = data.pagination?.hasMore || false;

    // Fetch likes if user is authenticated (check userState.contractId)
    if (userState.contractId) {
      const likedResponse = await fetch(`${import.meta.env.PUBLIC_API_URL}/liked/ids`, {
        credentials: 'include'
      });
      if (likedResponse.ok) {
        likedTrackIds = await likedResponse.json();
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    loading = false;
  }
}

onMount(() => {
  fetchInitialData();
});
```

---

#### 1.3 Smol.svelte
**File**: `src/components/Smol.svelte`

**Current Props:**
```typescript
interface Props {
  id: string | null;
  data: SmolDetailResponse | null;
  initialMintBalance: string | null;
}
```

**New Props:**
```typescript
interface Props {
  id?: string | null;
}
```

**New Internal State:**
```typescript
let data = $state<SmolDetailResponse | null>(null);
let mintBalance = $state<bigint>(0n);
let loading = $state(false);
let error = $state<string | null>(null);
```

**Fetch Logic:**
```typescript
async function fetchSmolData(smolId: string) {
  loading = true;
  error = null;

  try {
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${smolId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load smol');
    }

    data = await response.json();

    // Fetch mint balance if user is authenticated and token exists
    if (userState.contractId && data?.d1?.Mint_Token) {
      const client = sac.getSACClient(data.d1.Mint_Token);
      mintBalance = await getTokenBalance(client, userState.contractId);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    loading = false;
  }
}

$effect(() => {
  if (id) {
    fetchSmolData(id);
  }
});
```

---

#### 1.4 MixtapeDetailView.svelte
**File**: `src/components/mixtape/MixtapeDetailView.svelte`

**Current Props:**
```typescript
interface Props {
  mixtape: MixtapeDetail | null;
  trackBalances?: Record<string, string>;
  likedTrackIds?: string[];
}
```

**New Props:**
```typescript
interface Props {
  id: string;
}
```

**New Internal State:**
```typescript
let mixtape = $state<MixtapeDetail | null>(null);
let trackBalances = $state<Record<string, bigint>>({});
let likedTrackIds = $state<string[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
```

**Fetch Logic:**
```typescript
async function fetchMixtapeData(mixtapeId: string) {
  loading = true;
  error = null;

  try {
    // Fetch mixtape
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/mixtapes/${mixtapeId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load mixtape');
    }

    const data = await response.json();

    // Transform to MixtapeDetail
    mixtape = {
      id: data.Id,
      title: data.Title,
      description: data.Desc,
      trackCount: data.Smols?.length || 0,
      coverUrls: generateCoverUrls(data.Smols),
      updatedAt: data.Created_At,
      creator: data.Address,
      tracks: data.Smols || [],
    };

    // Fetch likes if authenticated
    if (userState.contractId) {
      const likedResponse = await fetch(`${import.meta.env.PUBLIC_API_URL}/liked/ids`, {
        credentials: 'include'
      });
      if (likedResponse.ok) {
        likedTrackIds = await likedResponse.json();
      }

      // Fetch track balances
      trackBalances = await fetchTrackBalances(mixtape.tracks, userState.contractId);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    loading = false;
  }
}

$effect(() => {
  if (id) {
    fetchMixtapeData(id);
  }
});
```

---

#### 1.5 Leaderboard.svelte
**File**: `src/components/Leaderboard.svelte`

**Current Props:**
```typescript
interface Props {
  smols: Smol[];
  users: any[];
}
```

**New Props:**
```typescript
interface Props {
  playlist: string;
}
```

**New Internal State:**
```typescript
let smols = $state<Smol[]>([]);
let users = $state<any[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
```

**Fetch Logic:**
```typescript
async function fetchLeaderboard(playlistName: string) {
  loading = true;
  error = null;

  try {
    const response = await fetch(
      `${import.meta.env.PUBLIC_API_URL}/playlist/${playlistName}?limit=100`
    );

    if (!response.ok) {
      throw new Error('Failed to load leaderboard');
    }

    const data = await response.json();
    smols = data.smols || [];
    users = data.users || [];
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load';
  } finally {
    loading = false;
  }
}

onMount(() => {
  if (playlist) {
    fetchLeaderboard(playlist);
  }
});
```

---

### Phase 2: Simplify .astro Pages

#### 2.1 index.astro
**Before:**
```astro
const response = await fetch(...);
const results = response.smols || [];
const likedTrackIds = await fetchLikedTracksServerSide(...);
// ... etc

<Home {results} {initialCursor} {hasMore} {likedTrackIds} />
```

**After:**
```astro
<Layout title="Smol">
  <Home endpoint="" client:visible={{rootMargin: "200px"}} />
</Layout>
```

---

#### 2.2 liked.astro
**After:**
```astro
<Layout title="Smol – Liked">
  <Home endpoint="liked" client:visible={{rootMargin: "200px"}} />
</Layout>
```

---

#### 2.3 created.astro
**After:**
```astro
<Layout title="Smol – Created">
  <Home endpoint="created" client:visible={{rootMargin: "200px"}} />
</Layout>
```

---

#### 2.4 playlist/[playlist].astro
**Before:**
```astro
const response = await fetch(...);
const results = response.smols || [];
const users = response.users || [];

<Leaderboard smols={results} {users} />
<Home {results} {initialCursor} {hasMore} playlist={...} />
```

**After:**
```astro
const { playlist } = Astro.params;

<Layout title={`Smol – ${playlist}`}>
  <Leaderboard {playlist} client:visible={{rootMargin: "200px"}} />
  <Home {playlist} endpoint={`playlist/${playlist}`} client:visible={{rootMargin: "200px"}} />
</Layout>
```

---

#### 2.5 mixtapes/[id].astro
**Before:**
```astro
// ~150 lines of server-side fetching
const mixtape = ...;
const trackBalances = ...;
const likedTrackIds = ...;

<MixtapeDetailView {mixtape} {trackBalances} {likedTrackIds} />
```

**After:**
```astro
const { id } = Astro.params;

<Layout title="Smol – Mixtape">
  <MixtapeDetailView id={id} client:load />
</Layout>
```

---

#### 2.6 [id].astro
**Before:**
```astro
const data = await fetch(...);
const _mintBalance = ...;

<Smol client:load id={id} data={data} initialMintBalance={_mintBalance} />
```

**After:**
```astro
const { id } = Astro.params;

<Layout>
  <Smol id={id} client:load />
</Layout>
```

---

### Phase 3: API Endpoint Requirements

Ensure these endpoints exist and return proper data:

1. `GET /` - List smols with pagination
2. `GET /liked` - User's liked smols (requires auth)
3. `GET /created` - User's created smols (requires auth)
4. `GET /liked/ids` - **NEW** - Just array of liked track IDs (faster)
5. `GET /playlist/{name}` - Playlist smols + leaderboard
6. `GET /mixtapes/{id}` - Mixtape details
7. `GET /{id}` - Single smol details

---

### Phase 4: Testing Checklist

- [ ] Home page loads and displays smols
- [ ] Liked page loads (when authenticated)
- [ ] Created page loads (when authenticated)
- [ ] Playlist page loads with leaderboard
- [ ] Mixtape detail page loads
- [ ] Single smol page loads
- [ ] Infinite scroll works on all grid pages
- [ ] Likes display correctly
- [ ] Balances display correctly
- [ ] Loading states show properly
- [ ] Error states handled gracefully
- [ ] Navigation between pages works (SPA transitions)
- [ ] Header persists across navigation
- [ ] MixtapeBuilder overlay persists
- [ ] AudioPlayer correctly resets per page

---

## Implementation Order

1. ✅ Create this documentation
2. ✅ Update SmolGrid.svelte (used by most pages)
3. ✅ Update Home.svelte (simple wrapper)
4. ✅ Simplify index.astro, liked.astro, created.astro
5. ✅ Update Leaderboard.svelte
6. ✅ Simplify playlist/[playlist].astro
7. ✅ Update Smol.svelte
8. ✅ Simplify [id].astro
9. ✅ Update MixtapeDetailView.svelte
10. ✅ Simplify mixtapes/[id].astro
11. [ ] Test all pages thoroughly

---

## Files to Modify

### Svelte Components
- ✅ `src/components/Home.svelte`
- ✅ `src/components/smol/SmolGrid.svelte`
- ✅ `src/components/Smol.svelte`
- ✅ `src/components/mixtape/MixtapeDetailView.svelte`
- ✅ `src/components/Leaderboard.svelte`

### Astro Pages
- ✅ `src/pages/index.astro`
- ✅ `src/pages/liked.astro`
- ✅ `src/pages/created.astro`
- ✅ `src/pages/playlist/[playlist].astro`
- ✅ `src/pages/mixtapes/[id].astro`
- ✅ `src/pages/[id].astro`

### Utilities (might need new helper)
- [ ] Consider creating `src/utils/client/fetch.ts` for common fetch patterns

---

## Notes

- All components should show a loading state during initial data fetch
- Use `credentials: 'include'` for all fetch requests to send cookies
- Handle errors gracefully with user-friendly messages
- Consider skeleton loaders for better UX
- Track loading states to prevent double-fetching
- Use $effect to re-fetch when URL params change
