<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import type { Smol, MixtapeTrack } from "../../types/domain";
  import SmolCard from "./SmolCard.svelte";
  import {
    audioState,
    selectSong,
    registerSongNextCallback,
  } from "../../stores/audio.svelte";
  import {
    mixtapeDraftState,
    mixtapeModeState,
    addTrack,
  } from "../../stores/mixtape.svelte";
  import { userState } from "../../stores/user.svelte";
  import { fetchLikedSmols } from "../../services/api/smols";
  import { useVisibilityTracking } from "../../hooks/useVisibilityTracking";
  import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
  import { useGridMediaSession } from "../../hooks/useGridMediaSession";

  interface Props {
    playlist?: string | null;
    endpoint?: string;
    initialSmols?: Smol[];
    profileMode?: boolean;
    filterValue?: string;
  }

  let {
    playlist = null,
    endpoint = "",
    initialSmols = undefined,
    profileMode = false,
    filterValue = "",
  }: Props = $props();

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

  // Profile mode tab state
  let activeTab = $state<"discography" | "minted" | "collection">(
    endpoint === "collected" ? "collection" : "discography",
  );

  // Derived displayed results - filters based on profileMode and activeTab
  let displayedResults = $derived.by(() => {
    if (!profileMode || !filterValue) {
      return results; // No filtering for homepage
    }

    const fv = filterValue.toLowerCase();

    if (activeTab === "discography") {
      // Songs I published (Creator/Address matches me)
      return results.filter(
        (s) =>
          (s.Creator || "").toLowerCase() === fv ||
          (s.Address || "").toLowerCase() === fv,
      );
    } else if (activeTab === "minted") {
      // Songs I published AND are minted
      return results.filter(
        (s) =>
          ((s.Creator || "").toLowerCase() === fv ||
            (s.Address || "").toLowerCase() === fv) &&
          !!s.Mint_Token,
      );
    } else if (activeTab === "collection") {
      // Songs I own (minted by me) but didn't publish (Creator/Address != me)
      return results.filter(
        (s) =>
          (s.Minted_By || "").toLowerCase() === fv &&
          (s.Creator || "").toLowerCase() !== fv &&
          (s.Address || "").toLowerCase() !== fv,
      );
    }

    return results;
  });

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
      } else {
        // Fetch smols from API
        const baseUrl = endpoint
          ? `${import.meta.env.PUBLIC_API_URL}/${endpoint}`
          : import.meta.env.PUBLIC_API_URL;
        const url = new URL(baseUrl, window.location.origin);
        url.searchParams.set("limit", "100");

        const response = await fetch(url, { credentials: "include" });

        if (!response.ok) {
          throw new Error("Failed to load smols");
        }

        const data = await response.json();
        results = data.smols || [];
        cursor = data.pagination?.nextCursor || null;
        hasMore = data.pagination?.hasMore || false;
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

      // Handle local filtering for 'collected' since backend lacks Minted_By support
      if (endpoint === "collected" && userState.contractId) {
        const myAddr = userState.contractId.toLowerCase();
        results = results.filter(
          (s) =>
            (s.Minted_By || "").toLowerCase() === myAddr &&
            (s.Creator || "").toLowerCase() !== myAddr &&
            (s.Address || "").toLowerCase() !== myAddr,
        );
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load";
      console.error("Failed to fetch initial data:", err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchInitialData();

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

  // Infinite scroll observer - set up when scrollTrigger is available
  $effect(() => {
    if (!scrollTrigger) return;

    const scrollObserver = scrollHook.createScrollObserver(() => {
      if (hasMore && !loadingMore && !loading) {
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
    mediaHook.updateMediaMetadata(song, import.meta.env.PUBLIC_API_URL);
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
      coverUrl: `${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`,
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
    const foundSmol = results.find((s) => s.Id === smol.Id);
    if (foundSmol) {
      foundSmol.Liked = liked;
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore || !cursor) return;

    loadingMore = true;

    try {
      const baseUrl = endpoint
        ? `${import.meta.env.PUBLIC_API_URL}/${endpoint}`
        : import.meta.env.PUBLIC_API_URL;
      const url = new URL(baseUrl, window.location.origin);
      url.searchParams.set("limit", "100");
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
      }
    } catch (error) {
      console.error("Failed to load more smols:", error);
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
    {#each displayedResults as smol (smol.Id)}
      <div use:observeVisibility={smol.Id}>
        <SmolCard
          {smol}
          isVisible={!!visibleCards[smol.Id]}
          onLikeChanged={(liked) => handleLikeChanged(smol, liked)}
          onAddToMixtape={() => addToMixtape(smol)}
          onDragStart={(e) => handleDragStart(e, smol)}
          onDragEnd={handleDragEnd}
          isDragging={draggingId === smol.Id}
        />
      </div>
    {/each}
  </div>
{/if}

{#if hasMore || loadingMore}
  <div bind:this={scrollTrigger} class="flex justify-center mb-20 py-8">
    {#if loadingMore}
      <div class="text-lime-500">Loading...</div>
    {/if}
  </div>
{/if}
