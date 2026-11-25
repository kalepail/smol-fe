<script lang="ts">
  import { onMount } from 'svelte';
  import { attach, next, player, previous, seek, setTrackLiked, toggle } from '../../stores/audio.svelte';
  import CoverArt from '../ui/CoverArt.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import Loader from '../ui/Loader.svelte';
  import { formatTime } from '../../utils/time';

  let element: HTMLAudioElement;
  let sheetOpen = $state(false);
  let openWithLyrics = $state(false);

  function openSheet(withLyrics = false) {
    openWithLyrics = withLyrics;
    sheetOpen = true;
  }
  let NowPlayingSheetComp = $state<typeof import('./NowPlayingSheet.svelte').default | null>(null);
  let scrub = $state<{ key: string; seconds: number } | null>(null);

  onMount(() => attach(element));

  $effect(() => {
    if (sheetOpen && !NowPlayingSheetComp) {
      void import('./NowPlayingSheet.svelte').then((mod) => {
        NowPlayingSheetComp = mod.default;
      });
    }
  });

  const track = $derived(player.track);
  const position = $derived(track && scrub?.key === track.key ? scrub.seconds : player.currentTime);
  const progress = $derived(player.duration > 0 ? Math.min(1, position / player.duration) : 0);
  const loading = $derived(player.status === 'loading' || player.buffering);
  const playing = $derived(player.status === 'playing');
  const failed = $derived(player.status === 'error');
  const actionLabel = $derived(failed ? 'Retry' : playing || loading ? 'Pause' : 'Play');
  const hasQueueNav = $derived(player.queue.length > 1);

  $effect(() => {
    if (!player.track && sheetOpen) {
      sheetOpen = false;
    }
  });
</script>

{#if track}
  <section
    id="audio-player"
    aria-label="Audio player"
    class="fixed left-[max(0.5rem,env(safe-area-inset-left,0px))] right-[max(0.5rem,env(safe-area-inset-right,0px))] bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px)+8px)] z-30 overflow-hidden rounded-[var(--radius-control)] bg-surface-2/92 ring-1 ring-inset ring-line-strong backdrop-blur-xl lg:left-0 lg:right-0 lg:bottom-0 lg:rounded-none lg:border-t lg:border-line lg:ring-0 lg:bg-surface-2/95"
  >
    <div class="mx-auto flex h-16 max-w-[var(--content-max)] items-center gap-2 px-2.5 lg:grid lg:h-[72px] lg:grid-cols-[minmax(0,1fr)_minmax(280px,460px)_minmax(0,1fr)] lg:gap-4 lg:pl-[max(2rem,env(safe-area-inset-left,0px))] lg:pr-[max(2rem,env(safe-area-inset-right,0px))]">
      <!-- Track info: tapping opens NowPlayingSheet on mobile; title links directly on desktop -->
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onclick={() => openSheet(false)}
          aria-label={`Open now playing for ${track.title}`}
          class="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-media)] text-left lg:flex-initial"
        >
          <CoverArt src={track.coverUrl} alt="" scale={4} class="size-11 shrink-0 lg:size-12" />
          <div class="min-w-0 flex-1 lg:hidden">
            <div class="truncate text-[15px] font-medium leading-tight text-ink-1">
              {track.title}
            </div>
            <div class="mt-0.5 truncate text-xs text-ink-2">
              {failed ? player.message : player.status === 'loading' ? 'Loading audio…' : player.buffering ? 'Buffering…' : track.artist || 'SMOL'}
            </div>
          </div>
        </button>

        <div class="hidden min-w-0 flex-1 lg:block">
          <a
            href={`/${track.smolId}`}
            class="focus-ring flex min-h-11 flex-col justify-center rounded"
          >
            <span class="block truncate text-sm font-medium text-ink-1 hover:underline">
              {track.title}
            </span>
            <span class="block truncate text-xs text-ink-2">
              {track.artist || 'SMOL'}
            </span>
          </a>
        </div>

        <div class="hidden lg:block">
          <LikeButton
            smolId={track.smolId}
            liked={track.liked}
            onLikeChanged={(liked) => setTrackLiked(track.smolId, liked)}
          />
        </div>
      </div>

      <!-- Center transport + desktop scrubber -->
      <div class="flex shrink-0 items-center gap-1 lg:flex-col lg:justify-center lg:gap-1">
        <div class="flex items-center gap-1 lg:gap-2">
          <div class="hidden lg:block">
            <IconButton label="Previous track" disabled={!hasQueueNav} onclick={previous}>
              <Icon name="prev" size={18} />
            </IconButton>
          </div>

          <div class="lg:hidden">
            <LikeButton
              smolId={track.smolId}
              liked={track.liked}
              onLikeChanged={(liked) => setTrackLiked(track.smolId, liked)}
            />
          </div>

          <button
            type="button"
            onclick={toggle}
            disabled={!player.ready}
            aria-label={actionLabel}
            class={`focus-ring inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${
              failed
                ? 'bg-danger/20 px-3 text-sm font-medium text-danger'
                : 'bg-accent text-on-accent hover:bg-accent-press lg:size-10'
            }`}
          >
            {#if failed}
              <span>Retry</span>
            {:else if loading}
              <Loader classNames="size-5" textColor="text-on-accent" />
            {:else if playing}
              <Icon name="pause" size={20} />
            {:else}
              <Icon name="play" size={20} class="translate-x-0.5" />
            {/if}
          </button>

          {#if hasQueueNav}
            <IconButton label="Next track" onclick={next}>
              <Icon name="next" size={18} />
            </IconButton>
          {/if}
        </div>

        {#if player.seekable}
          <div class="hidden w-full items-center gap-2 text-[11px] text-ink-2 tabular lg:flex">
            <span>{formatTime(position)}</span>
            <input
              type="range"
              aria-label="Seek audio"
              min="0"
              max={player.duration}
              step="any"
              value={position}
              oninput={(event) => {
                scrub = { key: track.key, seconds: event.currentTarget.valueAsNumber };
              }}
              onchange={(event) => {
                seek(event.currentTarget.valueAsNumber);
                scrub = null;
              }}
              onpointercancel={() => {
                scrub = null;
              }}
              onblur={() => {
                scrub = null;
              }}
              class="h-4 w-full cursor-pointer accent-accent"
            />
            <span>{formatTime(player.duration)}</span>
          </div>
        {/if}
      </div>

      <!-- Desktop right: Lyrics shortcut + Expand player -->
      <div class="hidden items-center justify-end gap-1 lg:flex">
        <IconButton label="Lyrics" onclick={() => openSheet(true)}>
          <Icon name="lyrics" size={18} />
        </IconButton>
        <IconButton label="Expand player" onclick={() => openSheet(false)}>
          <Icon name="arrow-up" size={18} />
        </IconButton>
      </div>
    </div>

    <!-- Single live status region for screen readers and playback feedback -->
    <div role="status" class="sr-only">
      {#if failed}
        {player.message}
      {:else if player.status === 'loading'}
        Loading audio…
      {:else if player.buffering}
        Buffering…
      {/if}
    </div>

    <!-- 2px edge progress bar on mobile -->
    <div class="h-0.5 w-full bg-line lg:hidden" aria-hidden="true">
      <div
        class="h-full bg-accent"
        style={`width: ${(progress * 100).toFixed(2)}%`}
      ></div>
    </div>
  </section>
{/if}

{#if NowPlayingSheetComp}
  <NowPlayingSheetComp open={sheetOpen} initialLyricsOpen={openWithLyrics} onClose={() => { sheetOpen = false; openWithLyrics = false; }} />
{/if}

<!-- Single persistent audio element for the entire application -->
<audio preload="auto" bind:this={element}></audio>
