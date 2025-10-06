<script lang="ts">
  import { onMount } from 'svelte';
  import type { Smol, MixtapeTrack } from '../../types/domain';
  import SmolCard from './SmolCard.svelte';
  import BarAudioPlayer from '../audio/BarAudioPlayer.svelte';
  import { audioState, selectSong } from '../../stores/audio.svelte';
  import { mixtapeDraftState, mixtapeModeState, addTrack } from '../../stores/mixtape.svelte';
  import { userState } from '../../stores/user.svelte';
  import { fetchLikedSmols } from '../../services/api/smols';

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
  let visibleCards = $state(new Set<string>());
  let cursor = $state(initialCursor);
  let hasMore = $state(initialHasMore);
  let loadingMore = $state(false);
  let likes = $state<string[]>([]);
  let scrollTrigger = $state<HTMLDivElement | null>(null);

  function observeVisibility(node: HTMLElement, smolId: string) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleCards.add(smolId);
          } else {
            visibleCards.delete(smolId);
          }
        });
      },
      {
        rootMargin: '200px',
        threshold: 0.01,
      }
    );

    observer.observe(node);

    return {
      destroy() {
        observer.disconnect();
      },
    };
  }

  $effect(() => {
    const contractId = userState.contractId;
    if (contractId) {
      fetchLikedSmols().then((likedIds) => {
        likes = likedIds;
        results = results.map((smol) => ({
          ...smol,
          Liked: likedIds.some((id) => id === smol.Id),
        }));
      });
    }
  });

  onMount(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const currentIndex = results.findIndex((s) => s.Id === audioState.currentSong?.Id);
        if (currentIndex > 0) {
          selectSong(results[currentIndex - 1]);
        } else if (results.length > 0) {
          selectSong(results[results.length - 1]);
        }
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        songNext();
      });
    }

    if (playlist) {
      localStorage.setItem('smol:playlist', playlist);
    }

    // Infinite scroll observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && hasMore && !loadingMore) {
            loadMore();
          }
        });
      },
      {
        rootMargin: '400px',
        threshold: 0,
      }
    );

    if (scrollTrigger) {
      observer.observe(scrollTrigger);
    }

    return () => {
      observer.disconnect();
    };
  });

  $effect(() => {
    const song = audioState.currentSong;
    if ('mediaSession' in navigator && song) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.Title,
        artist: 'Smol',
        album: 'Smol',
        artwork: [
          {
            src: `${import.meta.env.PUBLIC_API_URL}/image/${song.Id}.png?scale=8`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      });
    } else if ('mediaSession' in navigator && !song) {
      navigator.mediaSession.metadata = null;
    }
  });

  function songNext() {
    if (results.length === 0) return;
    const currentId = audioState.currentSong?.Id;
    let nextIndex = 0;

    if (currentId) {
      const currentIndex = results.findIndex((smol) => smol.Id === currentId);
      if (currentIndex !== -1 && currentIndex < results.length - 1) {
        nextIndex = currentIndex + 1;
      }
    }
    selectSong(results[nextIndex]);
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
        isVisible={visibleCards.has(smol.Id)}
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
