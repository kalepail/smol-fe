<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import type { Smol, MixtapeTrack } from "../../types/domain";
  import SmolCard from "./SmolCard.svelte";
  import {
    audioState,
    selectSong,
    registerSongNextCallback,
    setPlaylistContext,
  } from "../../stores/audio.svelte.ts";
  import {
    mixtapeDraftState,
    mixtapeModeState,
    addTrack,
  } from "../../stores/mixtape.svelte.ts";
  import { userState } from "../../stores/user.svelte.ts";
  import { fetchLikedSmols, getFullSnapshot } from "../../services/api/smols";
  import { useVisibilityTracking } from "../../hooks/useVisibilityTracking";
  import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
  import { useGridMediaSession } from "../../hooks/useGridMediaSession";
  import { preferences } from "../../stores/preferences.svelte.ts";

  interface Props {
    playlist?: string | null;
    endpoint?: string;
    initialSmols?: Smol[];
    profileMode?: boolean;
    filterValue?: string;
    onSmolClick?: (smol: Smol) => void;
  }

  let {
    playlist = null,
    endpoint = "",
    initialSmols = undefined,
    profileMode = false,
    filterValue = "",
    onSmolClick,
  }: Props = $props();

  const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

  let results = $state<Smol[]>([]);
  let cursor = $state<string | null>(null);
  let hasMore = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let likes = $state<string[]>([]);
  let draggingId = $state<string | null>(null);
  let visibleCards = $state<Record<string, boolean>>({});
  let loadingMore = $state(false);
  let scrollTrigger = $state<HTMLDivElement | null>(null);
  let displayLimit = $state(50); // Start with 50 items for speed
  let preloadedImageIds = new Set<string>(); // Track preloaded images to prevent duplicates

  // Profile mode tab state
  let activeTab = $state<"discography" | "minted" | "collection">(
    endpoint === "collected" ? "collection" : "discography",
  );

  // Derived matching results (FULL LIST matched by filters)
  let filteredResults = $derived.by(() => {
    if (!profileMode || !filterValue) {
      return results; // No filtering for homepage
    }

    const fv = filterValue.toLowerCase();

    if (activeTab === "discography") {
      return results.filter(
        (s) =>
          (s.Creator || "").toLowerCase() === fv ||
          (s.Address || "").toLowerCase() === fv,
      );
    } else if (activeTab === "minted") {
      return results.filter(
        (s) =>
          ((s.Creator || "").toLowerCase() === fv ||
            (s.Address || "").toLowerCase() === fv) &&
          !!s.Mint_Token,
      );
    } else if (activeTab === "collection") {
      return results.filter(
        (s) =>
          (s.Minted_By || "").toLowerCase() === fv &&
          (s.Creator || "").toLowerCase() !== fv &&
          (s.Address || "").toLowerCase() !== fv,
      );
    }

    return results;
  });

  // Rendered results (PAGINATED subset of matched results)
  let visibleResults = $derived(filteredResults.slice(0, displayLimit));

  // Combined "Has More" check for both API and Local Pagination
  let canLoadMore = $derived(hasMore || filteredResults.length > displayLimit);

  const visibilityHook = useVisibilityTracking();
  const scrollHook = useInfiniteScroll();
  const mediaHook = useGridMediaSession();

  const observeVisibility = visibilityHook.createVisibilityObserver(
    (id) => {
      visibleCards[id] = true;
    },
    (id) => {
      visibleCards[id] = false;
    },
  );

  async function fetchInitialData() {
    loading = true;
    error = null;

    try {
      // If initialSmols provided (e.g., from Artist page), use them directly
      if (initialSmols && initialSmols.length > 0) {
        results = initialSmols;
        hasMore = false;
        cursor = null;
      } else if (endpoint === "collected") {
        // COLLECTED: Use snapshot directly (backend-independent)
        // This ensures Collected works even if backend /collected endpoint fails
        const snapshot = await getFullSnapshot();
        const myAddr = userState.contractId?.toLowerCase() || "";

        if (myAddr) {
          results = snapshot.filter(
            (s) =>
              (s.Minted_By || "").toLowerCase() === myAddr &&
              (s.Creator || "").toLowerCase() !== myAddr &&
              (s.Address || "").toLowerCase() !== myAddr,
          );
        } else {
          results = [];
        }
        hasMore = false;
        cursor = null;
      } else {
        // Fetch smols from API for other endpoints
        const baseUrl = endpoint ? `${API_URL}/${endpoint}` : API_URL;
        const url = new URL(baseUrl, window.location.origin);
        // Use higher limit for /created endpoint to handle users with many songs
        const fetchLimit = endpoint === "created" ? "1000" : "100";
        url.searchParams.set("limit", fetchLimit);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch(url, {
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(
            `[SmolGrid] Live fetch failed (${response.status}), falling back to snapshot`,
          );
          results = await getFullSnapshot();
          cursor = null;
          hasMore = false;
        } else {
          const data = await response.json();
          results = data.smols || [];
          cursor = data.pagination?.nextCursor || null;
          hasMore = data.pagination?.hasMore || false;

          console.log(
            `[SmolGrid] Initial fetch for ${endpoint || "home"}: ${results.length} items, hasMore: ${hasMore}, cursor: ${cursor ? "present" : "null"}`,
          );

          if (!results || results.length === 0) {
            console.warn(
              "[SmolGrid] Live results empty, falling back to snapshot",
            );
            results = await getFullSnapshot();
            cursor = null;
            hasMore = false;
          }
        }
      }

      // Fetch likes if user is authenticated
      if (userState.contractId) {
        const likedIds = await fetchLikedSmols();
        likes = likedIds;

        // Apply liked state to results
        results = results.map((smol) => ({
          ...smol,
          Liked: likedIds.some((id) => id === smol.Id),
        }));
      }
    } catch (err) {
      console.warn(
        "Live fetch failed (CORS/API error), falling back to snapshot",
        err,
      );
      try {
        results = await getFullSnapshot();
        cursor = null;
        hasMore = false;
        error = null; // Clear error to show content
      } catch (snapshotErr) {
        console.error("Snapshot fallback also failed:", snapshotErr);
        error = err instanceof Error ? err.message : "Failed to load";
      }
    } finally {
      loading = false;
    }
  }

  /**
   * Background hydration: Fetch recent songs individually when bulk API fails.
   * This catches new mints that aren't in the snapshot yet.
   */
  async function hydrateLiveSongs() {
    // Only run for homepage (no endpoint) and if we have snapshot data
    if (endpoint || !results.length) return;

    try {
      // Fetch the most recent song IDs from the API root (small request)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_URL}?limit=10`, {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return;

      const data = await response.json();
      const liveSongs = data.smols || data || [];

      if (!Array.isArray(liveSongs) || liveSongs.length === 0) return;

      // Find songs in live that aren't in snapshot
      const existingIds = new Set(results.map((s) => s.Id));
      const newSongs = liveSongs.filter((s: Smol) => !existingIds.has(s.Id));

      if (newSongs.length > 0) {
        // Prepend new songs to results
        results = [...newSongs, ...results];
      }
    } catch (e) {
      // Silently fail - snapshot is already showing
      console.debug("[SmolGrid] Live hydration skipped:", e);
    }
  }

  onMount(() => {
    fetchInitialData().then(() => {
      // Background hydration after initial load
      hydrateLiveSongs();
    });

    // Register the songNext callback for this page
    registerSongNextCallback(songNext);

    const cleanupMedia = mediaHook.setupMediaSessionHandlers(
      () => {
        const previous = mediaHook.findPreviousSong(
          results,
          audioState.currentSong?.Id,
        );
        if (previous) selectSong(previous);
      },
      () => {
        songNext();
      },
    );

    if (playlist) {
      localStorage.setItem("smol:playlist", playlist);
    }

    return () => {
      cleanupMedia();
    };
  });

  onDestroy(() => {
    // Unregister the callback when this component is destroyed
    registerSongNextCallback(null);
  });

  // Store playlist context for fallback playback when navigating to pages without playlists
  $effect(() => {
    if (results.length > 0) {
      const currentIndex = audioState.currentSong
        ? results.findIndex((s) => s.Id === audioState.currentSong?.Id)
        : 0;
      setPlaylistContext(results, Math.max(0, currentIndex));
    }
  });

  // Infinite scroll observer - set up when scrollTrigger is available
  $effect(() => {
    if (!scrollTrigger) return;

    const scrollObserver = scrollHook.createScrollObserver(() => {
      if (canLoadMore && !loadingMore && !loading) {
        loadMore();
      }
    });

    scrollObserver.observe(scrollTrigger);

    return () => {
      scrollObserver.disconnect();
    };
  });

  $effect(() => {
    const song = audioState.currentSong;
    mediaHook.updateMediaMetadata(song, API_URL);
  });

  // Speculative Image Preloading: Load images for the NEXT page of results
  // This ensures that when the user scrolls down, images are already cached
  // DISABLED IN FAST MODE to save memory
  // MEMORY FIX: Track preloaded IDs to prevent creating duplicate Image objects
  $effect(() => {
    if (preferences.renderMode !== "thinking") return;

    const nextLimit = displayLimit + 50;
    const nextBatch = filteredResults.slice(displayLimit, nextLimit);

    if (nextBatch.length > 0) {
      // Use requestIdleCallback if available to avoid blocking main thread
      const preload = () => {
        nextBatch.forEach((smol) => {
          if (!preloadedImageIds.has(smol.Id)) {
            preloadedImageIds.add(smol.Id);
            const img = new Image();
            img.src = `${API_URL}/image/${smol.Id}.png`;
          }
        });
      };

      if ("requestIdleCallback" in window) {
        requestIdleCallback(preload);
      } else {
        setTimeout(preload, 1000);
      }
    }
  });

  function songNext() {
    const next = mediaHook.findNextSong(results, audioState.currentSong?.Id);
    if (next) selectSong(next);
  }

  function buildTrackPayload(smol: Smol): MixtapeTrack {
    return {
      id: smol.Id,
      title: smol.Title ?? "Untitled Smol",
      creator:
        smol.Creator ?? smol.Username ?? smol.artist ?? smol.author ?? null,
      coverUrl: `${API_URL}/image/${smol.Id}.png`,
    };
  }

  function addToMixtape(smol: Smol) {
    addTrack(buildTrackPayload(smol));
  }

  function handleDragStart(event: DragEvent, smol: Smol) {
    if (!mixtapeModeState.active) return;

    const payload = {
      type: "smol" as const,
      track: buildTrackPayload(smol),
    };

    draggingId = smol.Id;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/json", JSON.stringify(payload));
      event.dataTransfer.setData("text/plain", payload.track.title);
    }
  }

  function handleDragEnd() {
    draggingId = null;
  }

  function handleLikeChanged(smol: Smol, liked: boolean) {
    // PERFORMANCE FIX: Direct mutation instead of array.map() spread
    // With Svelte 5 $state, direct mutation triggers reactivity without copying entire array
    const item = results.find((s) => s.Id === smol.Id);
    if (item) {
      item.Liked = liked;
    }
  }

  async function loadMore() {
    if (loadingMore || !canLoadMore) return;

    // 1. Local Pagination (Snapshot Mode or Cached Data)
    if (filteredResults.length > displayLimit) {
      loadingMore = true;
      // Small artificial delay to allow UI update if needed, or just immediate
      await new Promise((r) => setTimeout(r, 10));
      displayLimit += 50;
      loadingMore = false;
      return;
    }

    // 2. API Pagination (Live Mode)
    if (!cursor) return;

    loadingMore = true;

    try {
      const baseUrl = endpoint
        ? `${import.meta.env.PUBLIC_API_URL}/${endpoint}`
        : import.meta.env.PUBLIC_API_URL;
      const url = new URL(baseUrl, window.location.origin);
      // Use higher limit for /created endpoint to handle users with many songs
      const fetchLimit = endpoint === "created" ? "1000" : "100";
      url.searchParams.set("limit", fetchLimit);
      url.searchParams.set("cursor", cursor);

      const response = await fetch(url, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const newSmols = data.smols || [];

        // Map likes to new smols
        const smolsWithLikes = newSmols.map((smol: Smol) => ({
          ...smol,
          Liked: likes.some((id) => id === smol.Id),
        }));

        results = [...results, ...smolsWithLikes];
        cursor = data.pagination?.nextCursor || null;
        hasMore = data.pagination?.hasMore || false;

        console.log(
          `[SmolGrid] Loaded ${newSmols.length} more items. Total: ${results.length}, hasMore: ${hasMore}`,
        );
      } else {
        console.error(
          `[SmolGrid] Load more failed with status ${response.status}`,
        );
      }
    } catch (error) {
      console.error("[SmolGrid] Failed to load more smols:", error);
    } finally {
      loadingMore = false;
    }
  }
</script>

{#if loading}
  <div class="flex justify-center items-center py-20">
    <div class="text-lime-500">Loading...</div>
  </div>
{:else if error}
  <div class="flex justify-center items-center py-20">
    <div class="text-red-500">{error}</div>
  </div>
{:else}
  {#if profileMode}
    <div class="flex gap-2 mb-4 mx-2">
      <button
        class={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "discography" ? "bg-lime-500 text-slate-950" : "bg-slate-700 text-white hover:bg-slate-600"}`}
        onclick={() => (activeTab = "discography")}
      >
        DISCOGRAPHY
      </button>
      <button
        class={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "minted" ? "bg-lime-500 text-slate-950" : "bg-slate-700 text-white hover:bg-slate-600"}`}
        onclick={() => (activeTab = "minted")}
      >
        MINTED
      </button>
      <button
        class={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "collection" ? "bg-lime-500 text-slate-950" : "bg-slate-700 text-white hover:bg-slate-600"}`}
        onclick={() => (activeTab = "collection")}
      >
        COLLECTION
      </button>
    </div>
  {/if}
  <div
    class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2 pb-10"
  >
    {#each visibleResults as smol (smol.Id)}
      <div use:observeVisibility={smol.Id}>
        <SmolCard
          {smol}
          isVisible={!!visibleCards[smol.Id]}
          onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
          onAddToMixtape={() => addToMixtape(smol)}
          onDragStart={(e) => handleDragStart(e, smol)}
          onDragEnd={handleDragEnd}
          isDragging={draggingId === smol.Id}
          {onSmolClick}
        />
      </div>
    {/each}
  </div>
{/if}

{#if canLoadMore || loadingMore}
  <div bind:this={scrollTrigger} class="flex justify-center mb-20 py-8">
    {#if loadingMore}
      <div class="text-lime-500">Loading...</div>
    {/if}
  </div>
{/if}
