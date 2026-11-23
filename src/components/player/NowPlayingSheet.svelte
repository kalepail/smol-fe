<script lang="ts">
  import { navigate } from 'astro:transitions/client';
  import { next, player, previous, seek, setTrackLiked, toggle } from '../../stores/audio.svelte';
  import { userState } from '../../stores/user.svelte';
  import { mixtapeTrackIds, toggleDraftTrack } from '../../stores/mixtape.svelte';
  import { toast } from '../../stores/toast.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import CoverArt from '../ui/CoverArt.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Button from '../ui/Button.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let scrub = $state<{ key: string; seconds: number } | null>(null);
  let lyricsExpanded = $state(false);
  let lyricsText = $state<string | null>(null);
  let lyricsIsInstrumental = $state(false);
  let lyricsLoading = $state(false);
  let loadedLyricsSmolId = $state<string | null>(null);

  const track = $derived(player.track);
  const position = $derived(track && scrub?.key === track.key ? scrub.seconds : player.currentTime);
  const remaining = $derived(Math.max(0, player.duration - position));
  const loading = $derived(player.status === 'loading' || player.buffering);
  const playing = $derived(player.status === 'playing');
  const failed = $derived(player.status === 'error');
  const hasQueueNav = $derived(player.queue.length > 1);
  const isInMixtape = $derived(Boolean(track && mixtapeTrackIds.current.has(track.smolId)));
  const isPrivateTrack = $derived(track?.public === 0);

  $effect(() => {
    const id = track?.smolId ?? null;
    if (id !== loadedLyricsSmolId) {
      lyricsExpanded = false;
      lyricsText = null;
      lyricsIsInstrumental = false;
      loadedLyricsSmolId = null;
    }
  });

  function formatTime(seconds: number) {
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const minutes = Math.floor(safe / 60);
    const remainder = Math.floor(safe % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  async function toggleLyrics() {
    if (!track) return;
    lyricsExpanded = !lyricsExpanded;
    if (!lyricsExpanded || loadedLyricsSmolId === track.smolId) return;

    lyricsLoading = true;
    try {
      const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/${track.smolId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const instrumental = Boolean(data?.kv_do?.payload?.instrumental || data?.d1?.Instrumental);
        lyricsIsInstrumental = instrumental;
        lyricsText = instrumental ? null : (data?.kv_do?.lyrics?.lyrics?.trim() || null);
      }
      loadedLyricsSmolId = track.smolId;
    } catch {
      lyricsText = null;
    } finally {
      lyricsLoading = false;
    }
  }

  async function handleShare() {
    if (!track) return;
    const url = `${window.location.origin}/${track.smolId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: track.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Song link copied.');
      }
    } catch {
      // User dismissed share sheet.
    }
  }

  function handleAddToMixtape() {
    if (!track || isPrivateTrack) return;
    toggleDraftTrack(
      {
        id: track.smolId,
        title: track.title,
        coverUrl: track.coverUrl,
        creator: track.artist ?? null,
        public: track.public === 0 || track.public === 1 ? track.public : undefined,
      },
      { onOpen: onClose }
    );
  }

  function handleOpenSongPage() {
    if (!track) return;
    const href = `/${track.smolId}`;
    onClose();
    void navigate(href);
  }
</script>

<Sheet
  open={open && Boolean(track)}
  title="Now playing"
  fullHeight
  maxWidth="md"
  {onClose}
>
  {#if track}
    <div class="relative flex flex-col gap-6 pb-4">
      <!-- Subtle cover tint behind artwork -->
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -inset-4 -z-10 overflow-hidden opacity-20"
      >
        <img
          src={`${track.coverUrl}?scale=2`}
          alt=""
          class="h-full w-full scale-110 object-cover blur-3xl"
        />
      </div>

      <!-- Large cover art -->
      <div class="mx-auto w-full max-w-[340px]">
        <CoverArt src={track.coverUrl} alt="" scale={8} loading="eager" />
      </div>

      <!-- Title + artist + like -->
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <a
            href={`/${track.smolId}`}
            onclick={onClose}
            class="focus-ring flex min-h-11 flex-col justify-center rounded"
          >
            <span class="block truncate text-2xl font-semibold text-ink-1 hover:underline">
              {track.title}
            </span>
            <span class="mt-0.5 block truncate text-sm text-ink-2">
              {track.artist || 'SMOL'}
            </span>
          </a>
        </div>
        <LikeButton
          smolId={track.smolId}
          liked={track.liked}
          iconSize={22}
          onLikeChanged={(liked) => setTrackLiked(track.smolId, liked)}
        />
      </div>

      <!-- Scrubber -->
      <div class="space-y-1.5">
        <input
          type="range"
          aria-label="Seek audio position"
          min="0"
          max={player.duration || 1}
          step="any"
          value={position}
          disabled={!player.seekable}
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
          class="h-11 w-full cursor-pointer accent-accent disabled:opacity-40"
        />
        <div class="tabular flex items-center justify-between text-xs text-ink-2">
          <span>{formatTime(position)}</span>
          <span>-{formatTime(remaining)}</span>
        </div>
      </div>

      <!-- Transport controls -->
      <div class="flex items-center justify-center gap-6">
        <IconButton
          label="Previous track"
          size="lg"
          disabled={!hasQueueNav}
          onclick={previous}
        >
          <Icon name="prev" size={26} />
        </IconButton>

        <button
          type="button"
          onclick={toggle}
          disabled={!player.ready}
          aria-label={failed ? 'Retry playback' : playing || loading ? 'Pause playback' : 'Play'}
          class="focus-ring flex size-16 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-press disabled:opacity-50"
        >
          {#if failed}
            <Icon name="refresh" size={28} />
          {:else if loading}
            <Loader classNames="size-7" textColor="text-on-accent" />
          {:else if playing}
            <Icon name="pause" size={28} />
          {:else}
            <Icon name="play" size={28} class="translate-x-0.5" />
          {/if}
        </button>

        <IconButton
          label="Next track"
          size="lg"
          disabled={!hasQueueNav}
          onclick={next}
        >
          <Icon name="next" size={26} />
        </IconButton>
      </div>

      {#if failed}
        <div class="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-danger/15 px-3.5 py-2.5 text-sm text-danger ring-1 ring-inset ring-danger/35">
          <span>{player.message || 'Playback could not continue.'}</span>
          <Button variant="secondary" size="md" onclick={toggle}>Retry</Button>
        </div>
      {/if}

      <!-- Secondary actions -->
      <div class="flex flex-wrap items-center justify-center gap-1.5">
        <Button variant="ghost" size="sm" class="min-h-11" onclick={toggleLyrics}>
          <Icon name="lyrics" size={16} />
          <span>{lyricsExpanded ? 'Hide lyrics' : 'Lyrics'}</span>
        </Button>

        <Button variant="ghost" size="sm" class="min-h-11" onclick={handleShare}>
          <Icon name="share" size={16} />
          <span>Share</span>
        </Button>

        {#if userState.contractId && !isPrivateTrack}
          <Button variant="ghost" size="sm" class="min-h-11" onclick={handleAddToMixtape}>
            <Icon
              name={isInMixtape ? 'check' : 'plus-circle'}
              size={16}
              class={isInMixtape ? 'text-accent' : ''}
            />
            <span>{isInMixtape ? 'In mixtape' : 'Add to mixtape'}</span>
          </Button>
        {/if}

        <Button variant="ghost" size="sm" class="min-h-11" onclick={handleOpenSongPage}>
          <Icon name="external" size={16} />
          <span>Song details</span>
        </Button>
      </div>

      <!-- Expandable static lyrics card -->
      {#if lyricsExpanded}
        <div class="rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-ink-1">Lyrics</h3>
            {#if lyricsText}
              <Button
                variant="ghost"
                size="sm"
                class="min-h-11"
                onclick={async () => {
                  if (!lyricsText) return;
                  await navigator.clipboard.writeText(lyricsText);
                  toast.success('Lyrics copied.');
                }}
              >
                <Icon name="copy" size={14} />
                <span>Copy</span>
              </Button>
            {/if}
          </div>
          {#if lyricsLoading}
            <div class="flex justify-center py-6">
              <Loader classNames="size-5" textColor="text-ink-2" />
            </div>
          {:else if lyricsText}
            <p class="whitespace-pre-wrap text-base leading-relaxed text-ink-1/90">
              {lyricsText}
            </p>
          {:else}
            <p class="text-sm text-ink-2">
              {lyricsIsInstrumental ? 'This is an instrumental track.' : 'No lyrics available for this song.'}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</Sheet>
