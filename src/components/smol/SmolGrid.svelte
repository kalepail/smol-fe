<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { Smol, MixtapeTrack } from '../../types/domain';
  import SmolCard from './SmolCard.svelte';
  import BarAudioPlayer from '../audio/BarAudioPlayer.svelte';
  import { audioState, selectSong } from '../../stores/audio.svelte';
  import { mixtapeDraftState, mixtapeModeState, addTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';
  import { fetchLikedSmols } from '../../services/api/smols';
  import { useVisibilityTracking } from '../../hooks/useVisibilityTracking';
  import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
  import { useGridMediaSession } from '../../hooks/useGridMediaSession';

  interface Props {
    results: Smol[];
    playlist: string | null;
    initialCursor?: string | null;
    hasMore?: boolean;
    endpoint?: string;
  }

  let {
    results = $bindable(),
    playlist,
    initialCursor = null,
    hasMore: initialHasMore = false,
    endpoint = ''
  }: Props = $props();

  let draggingId = $state<string | null>(null);
  let visibleCards = $state<Record<string, boolean>>({});
  let cursor = $state(initialCursor);
  let hasMore = $state(initialHasMore);
  let loadingMore = $state(false);
  let likes = $state<string[]>([]);
  let likesLoaded = $state(false);
  let scrollTrigger = $state<HTMLDivElement | null>(null);

  const visibilityHook = useVisibilityTracking();
  const scrollHook = useInfiniteScroll();
  const mediaHook = useGridMediaSession();

  const observeVisibility = visibilityHook.createVisibilityObserver(
    (id) => {
      visibleCards[id] = true;
    },
    (id) => {
      visibleCards[id] = false;
    }
  );

  $effect(() => {
    const contractId = userState.contractId;
    if (contractId && !likesLoaded) {
      untrack(() => {
        likesLoaded = true;
        fetchLikedSmols().then((likedIds) => {
          untrack(() => {
            likes = likedIds;
            results = results.map((smol) => ({
              ...smol,
              Liked: likedIds.some((id) => id === smol.Id),
            }));
          });
        });
      });
    } else if (!contractId && likesLoaded) {
      untrack(() => {
        likesLoaded = false;
        likes = [];
      });
    }
  });

  onMount(() => {
    const cleanupMedia = mediaHook.setupMediaSessionHandlers(
      () => {
        const previous = mediaHook.findPreviousSong(results, audioState.currentSong?.Id);
        if (previous) selectSong(previous);
      },
      () => {
        songNext();
      }
    );

    if (playlist) {
      localStorage.setItem('smol:playlist', playlist);
    }

    // Infinite scroll observer
    const scrollObserver = scrollHook.createScrollObserver(() => {
      if (hasMore && !loadingMore) {
        loadMore();
      }
    });

    if (scrollTrigger) {
      scrollObserver.observe(scrollTrigger);
    }

    return () => {
      cleanupMedia();
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
      title: smol.Title ?? 'Untitled Smol',
      creator: smol.Creator ?? smol.Username ?? smol.artist ?? smol.author ?? null,
      coverUrl: `${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`,
    };
  }

  function addToMixtape(smol: Smol) {
    addTrack(buildTrackPayload(smol));
  }

  function handleDragStart(event: DragEvent, smol: Smol) {
    if (!mixtapeModeState.active) return;

    const payload = {
      type: 'smol' as const,
      track: buildTrackPayload(smol),
    };

    draggingId = smol.Id;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/json', JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', payload.track.title);
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
      url.searchParams.set('limit', '100');
      url.searchParams.set('cursor', cursor);

      const response = await fetch(url, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        const newSmols = data.smols || [];

        // Map likes to new smols
        const smolsWithLikes = newSmols.map((smol: Smol) => ({
          ...smol,
          Liked: likes.some((id) => id === smol.Id)
        }));

        results = [...results, ...smolsWithLikes];
        cursor = data.pagination?.nextCursor || null;
        hasMore = data.pagination?.hasMore || false;
      }
    } catch (error) {
      console.error('Failed to load more smols:', error);
    } finally {
      loadingMore = false;
    }
  }
</script>

<div
  class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2 pb-10"
>
  {#each results as smol (smol.Id)}
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

{#if hasMore || loadingMore}
  <div bind:this={scrollTrigger} class="flex justify-center mb-20 py-8">
    {#if loadingMore}
      <div class="text-lime-500">Loading...</div>
    {/if}
  </div>
{/if}

<BarAudioPlayer
  classNames="fixed z-30 p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
  {songNext}
/>
