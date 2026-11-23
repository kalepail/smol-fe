<script lang="ts">
  import { untrack } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import type { Smol, SmolDetailResponse } from '../../types/domain';
  import { player, playQueue, setTrackLiked, toggle, updateTrack } from '../../stores/audio.svelte';
  import { userState } from '../../stores/user.svelte';
  import { addTrack, enterMixtapeMode, mixtapeTrackIds, openMixtapeSheet } from '../../stores/mixtape.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { toMixtapeTrack, toTrack, type Track } from '../../utils/track';
  import { shortenAddress } from '../../utils/address';
  import {
    PROVIDER_META,
    providerOf,
    wasFallback as isFallbackGeneration,
  } from '../../utils/takes';
  import CoverArt from '../ui/CoverArt.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Icon from '../ui/Icon.svelte';
  import Chip from '../ui/Chip.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import TokenBalancePill from '../ui/TokenBalancePill.svelte';
  import Loader from '../ui/Loader.svelte';
  import TakeSwitcher from '../song/TakeSwitcher.svelte';

  interface Props {
    id: string | null;
    d1?: SmolDetailResponse['d1'];
    kv_do?: SmolDetailResponse['kv_do'];
    liked?: boolean;
    bestSong?: string;
    showGenerationLoader: boolean;
    minting: boolean;
    minted: boolean;
    tradeReady: boolean;
    tradeMintBalance: bigint;
    isOwner: boolean;
    savingBest?: boolean;
    onMakeSongPublic: () => void;
    onDeleteSong: () => void;
    onSelectBestSong: (songId: string) => void;
    onTriggerMint: () => void;
    onOpenTradeModal: () => void;
    onLikeChanged: (liked: boolean) => void;
  }

  let {
    id,
    d1,
    kv_do,
    liked,
    bestSong = $bindable(),
    showGenerationLoader,
    minting,
    minted,
    tradeReady,
    tradeMintBalance,
    isOwner,
    savingBest = false,
    onMakeSongPublic,
    onDeleteSong,
    onSelectBestSong,
    onTriggerMint,
    onOpenTradeModal,
    onLikeChanged,
  }: Props = $props();

  let moreOpen = $state(false);
  let lyricsExpanded = $state(false);
  let lyricsHeading = $state<HTMLHeadingElement | null>(null);

  const detail = $derived<SmolDetailResponse>({ d1, kv_do, liked });
  const activeProvider = $derived(providerOf(detail));
  const fallback = $derived(isFallbackGeneration(detail));
  const providerLabel = $derived(PROVIDER_META[activeProvider].label);

  const title = $derived(
    kv_do?.lyrics?.title || d1?.Title || kv_do?.description || 'Untitled Smol'
  );
  const artistName = $derived(
    d1?.Creator ?? d1?.Username ?? d1?.artist ?? d1?.author ?? shortenAddress(d1?.Address)
  );
  const isInstrumental = $derived(
    Boolean(kv_do?.payload?.instrumental || d1?.Instrumental)
  );
  const isPrivate = $derived(d1?.Public === 0);
  const isUnsafe = $derived(kv_do?.nsfw?.safe === false);

  const smol = $derived<Smol | null>(
    id
      ? {
          ...d1,
          Id: id,
          Title: title,
          Liked: liked,
        }
      : null
  );

  const songs = $derived(kv_do?.songs ?? []);
  const takes = $derived.by(() => {
    const trackSmol = smol;
    if (!trackSmol) return [] as (Track | null)[];
    if (!songs.length) return [toTrack(trackSmol)];
    return songs.map((song) => toTrack(trackSmol, song));
  });

  const primaryTrack = $derived.by(() => {
    const playable = takes.filter((t): t is Track => t !== null);
    if (!playable.length) return null;
    if (bestSong) {
      const idx = songs.findIndex((s) => s.music_id === bestSong);
      if (idx >= 0 && takes[idx]) return takes[idx];
    }
    return playable[0];
  });

  const isPrimaryPlaying = $derived(
    Boolean(
      primaryTrack &&
        player.track?.key === primaryTrack.key &&
        (player.status === 'playing' || player.status === 'loading')
    )
  );

  const isInMixtape = $derived(Boolean(id && mixtapeTrackIds.current.has(id)));
  const rawLyrics = $derived(kv_do?.lyrics?.lyrics?.trim() ?? '');
  const hasLyrics = $derived(!isInstrumental && rawLyrics.length > 0);
  const lyricLines = $derived(hasLyrics ? rawLyrics.split('\n') : []);
  const lyricsTruncated = $derived(!lyricsExpanded && lyricLines.length > 10);
  const displayedLyrics = $derived(
    lyricsTruncated ? lyricLines.slice(0, 10).join('\n') : rawLyrics
  );

  function scrollToLyrics() {
    if (!lyricsHeading) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    lyricsHeading.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    lyricsHeading.focus({ preventScroll: true });
  }

  const formattedCreatedAt = $derived.by(() => {
    if (!d1?.Created_At) return null;
    const date = new Date(d1.Created_At);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  });

  $effect(() => {
    const tracks = takes;
    untrack(() => {
      for (const track of tracks) if (track) updateTrack(track);
    });
  });

  function playTake(track: Track) {
    if (player.track?.key === track.key) toggle();
    else playQueue([track], 0);
  }

  function handlePrimaryPlay() {
    if (!primaryTrack) return;
    playTake(primaryTrack);
  }

  function handleLikeChanged(nextLiked: boolean) {
    if (id) setTrackLiked(id, nextLiked);
    onLikeChanged(nextLiked);
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function handleShare() {
    if (!id) return;
    const url = `${window.location.origin}/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await copyText(url, 'Song link');
      }
    } catch {
      // User cancelled native share.
    }
  }

  function handleAddToMixtape() {
    if (!smol || isPrivate) return;
    addTrack(toMixtapeTrack(smol));
    enterMixtapeMode(false);
    toast.success(`Added "${title}" to mixtape draft.`, {
      tag: 'mixtape-add',
      actionLabel: 'Open draft',
      onAction: openMixtapeSheet,
    });
  }

  function handleRemixPrompt() {
    const promptText = kv_do?.payload?.prompt;
    if (!promptText) return;
    try {
      sessionStorage.setItem(
        'smol:remixDraft',
        JSON.stringify({
          prompt: promptText,
          instrumental: isInstrumental,
          provider: activeProvider,
        })
      );
    } catch {
      // Ignore storage failures.
    }
    void navigate('/create');
  }
</script>

<article class="app-container py-6 sm:py-8">
  <div class="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-10">
    <!-- Left column: crisp square cover art -->
    <div class="mx-auto w-full max-w-[360px] lg:sticky lg:top-20">
      <CoverArt
        id={kv_do?.image || d1?.Id ? id : null}
        alt=""
        scale={8}
        loading="eager"
      />
    </div>

    <!-- Right column: song details, actions, takes, lyrics, about -->
    <div class="min-w-0 space-y-6">
      <!-- Hero header -->
      <header class="space-y-3">
        <h1 class="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-ink-1">
          {title}
        </h1>

        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-ink-2">
          {#if d1?.Address}
            <a
              href={`/artists/${encodeURIComponent(d1.Address)}`}
              class="focus-ring rounded font-medium text-ink-1 hover:underline"
            >
              {artistName}
            </a>
            <span aria-hidden="true">·</span>
          {/if}
          {#if formattedCreatedAt}
            <span>{formattedCreatedAt}</span>
            <span aria-hidden="true">·</span>
          {/if}
          <Chip tone="neutral">{providerLabel}</Chip>
          {#if isInstrumental}
            <Chip tone="neutral">Instrumental</Chip>
          {/if}
          {#if isPrivate}
            <Chip tone="neutral">Private</Chip>
          {/if}
        </div>

        {#if fallback}
          <p class="flex items-center gap-2 text-sm text-ink-2">
            <Icon name="info" size={16} class="text-ink-3" />
            <span>Made with ElevenLabs — Classic was unavailable.</span>
          </p>
        {/if}

        {#if isUnsafe}
          <div
            role="status"
            class="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-danger/15 px-3.5 py-2.5 text-sm text-danger ring-1 ring-inset ring-danger/35"
          >
            <Icon name="warning" size={18} class="mt-0.5 shrink-0" />
            <span>
              Flagged for sensitive content{kv_do?.nsfw?.categories?.length ? ` (${kv_do.nsfw.categories.join(', ')})` : ''}. Kept private from public feeds.
            </span>
          </div>
        {/if}
      </header>

      <!-- Action row: one primary lime Play button + round secondary controls -->
      <div class="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!primaryTrack || !player.ready}
          onclick={handlePrimaryPlay}
          class="min-w-[140px] rounded-full px-6"
        >
          {#if isPrimaryPlaying}
            <Icon name="pause" size={18} />
            <span>Pause</span>
          {:else}
            <Icon name="play" size={18} />
            <span>{showGenerationLoader && !primaryTrack ? 'Generating…' : 'Play'}</span>
          {/if}
        </Button>

        {#if hasLyrics}
          <Button
            variant="secondary"
            size="md"
            class="rounded-full"
            onclick={scrollToLyrics}
          >
            <Icon name="lyrics" size={18} />
            <span>Lyrics</span>
          </Button>
        {/if}

        {#if d1?.Id}
          <LikeButton
            smolId={d1.Id}
            {liked}
            classNames="bg-surface-2 ring-1 ring-inset ring-line-strong"
            onLikeChanged={handleLikeChanged}
          />
        {/if}

        {#if userState.contractId && d1?.Id && !isPrivate}
          <IconButton
            label={isInMixtape ? 'In mixtape draft' : 'Add to mixtape'}
            variant="surface"
            onclick={handleAddToMixtape}
          >
            <Icon name={isInMixtape ? 'check' : 'plus-circle'} size={20} class={isInMixtape ? 'text-accent' : ''} />
          </IconButton>
        {/if}

        <IconButton label="Share song" variant="surface" onclick={handleShare}>
          <Icon name="share" size={20} />
        </IconButton>

        <IconButton label="More options" variant="surface" onclick={() => (moreOpen = true)}>
          <Icon name="ellipsis" size={20} />
        </IconButton>
      </div>

      <!-- Takes (generating slots, 2-take Classic switcher, or cleanly omitted for 1-take ElevenLabs) -->
      <TakeSwitcher
        provider={activeProvider}
        wasFallback={fallback}
        {songs}
        {takes}
        {bestSong}
        {isOwner}
        {showGenerationLoader}
        kvDo={kv_do}
        {savingBest}
        onPlayTake={playTake}
        {onSelectBestSong}
      />

      <!-- Lyrics section (prominently lifted above Collectible for vocal songs; strictly omitted for instrumentals) -->
      {#if hasLyrics}
        <section
          id="song-lyrics"
          aria-labelledby="song-lyrics-heading"
          class="scroll-mt-20 rounded-[var(--radius-control)] bg-surface-1 p-4 sm:p-5 ring-1 ring-inset ring-line"
        >
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2
              id="song-lyrics-heading"
              bind:this={lyricsHeading}
              tabindex="-1"
              class="focus-ring rounded text-base font-semibold text-ink-1"
            >
              Lyrics
            </h2>
            <Button variant="ghost" size="sm" class="min-h-11" onclick={() => copyText(rawLyrics, 'Lyrics')}>
              <Icon name="copy" size={15} />
              <span>Copy</span>
            </Button>
          </div>

          <p class="max-w-[65ch] whitespace-pre-wrap text-base leading-relaxed text-ink-1/90">
            {displayedLyrics}
          </p>

          {#if lyricLines.length > 10}
            <button
              type="button"
              class="focus-ring mt-3 inline-flex min-h-11 items-center rounded text-sm font-medium text-ink-2 hover:text-ink-1"
              onclick={() => (lyricsExpanded = !lyricsExpanded)}
            >
              {lyricsExpanded ? 'Show less' : `Show all ${lyricLines.length} lines`}
            </button>
          {/if}
        </section>
      {/if}

      <!-- Style tags -->
      {#if kv_do?.lyrics?.style?.length}
        <div class="flex flex-wrap gap-1.5" aria-label="Style tags">
          {#each kv_do.lyrics.style as tag (tag)}
            <Chip tone="neutral">{tag}</Chip>
          {/each}
        </div>
      {/if}

      <!-- Collectible / Mint & Trade surface -->
      {#if kv_do?.nsfw?.safe !== false && (d1?.Id || minted)}
        <section
          aria-label="Collectible"
          class="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line"
        >
          <div class="min-w-0 flex-1">
            {#if minted}
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-semibold text-ink-1">Collectible</h2>
                <Chip tone="success">Minted</Chip>
                <TokenBalancePill balance={tradeMintBalance} />
              </div>
              <p class="mt-1 text-xs text-ink-2">
                Buy or sell this song token with KALE.
              </p>
            {:else}
              <h2 class="text-sm font-semibold text-ink-1">Make it a collectible</h2>
              <p class="mt-1 text-xs text-ink-2">
                {minting ? 'Minting on Stellar… usually under 30 seconds.' : 'Mint for 100 KALE to enable trading and earn creator fees.'}
              </p>
            {/if}
          </div>

          {#if minted && tradeReady}
            <Button variant="secondary" onclick={onOpenTradeModal}>
              <span>Trade</span>
            </Button>
          {:else if !minted}
            <Button
              variant="secondary"
              loading={minting}
              disabled={minting}
              onclick={onTriggerMint}
            >
              <span>{minting ? 'Minting…' : 'Mint'}</span>
            </Button>
          {/if}
        </section>
      {/if}

      <!-- Prompt section -->
      {#if kv_do?.payload?.prompt}
        <section class="border-t border-line pt-5">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-base font-semibold text-ink-1">Prompt</h2>
            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                class="min-h-11"
                onclick={() => copyText(kv_do.payload!.prompt!, 'Prompt')}
              >
                <Icon name="copy" size={15} />
                <span>Copy</span>
              </Button>
              <Button variant="secondary" size="sm" class="min-h-11" onclick={handleRemixPrompt}>
                <Icon name="sparkles" size={15} />
                <span>Remix prompt</span>
              </Button>
            </div>
          </div>
          <p class="max-w-[65ch] text-sm leading-relaxed text-ink-2">
            {kv_do.payload.prompt}
          </p>
        </section>
      {/if}

      <!-- About / Details metadata (moves ID & safety out of the hero) -->
      <section class="border-t border-line pt-5 space-y-4">
        <h2 class="text-base font-semibold text-ink-1">Details</h2>

        {#if kv_do?.description}
          <p class="max-w-[65ch] text-sm leading-relaxed text-ink-2">
            {kv_do.description}
          </p>
        {/if}

        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-xs text-ink-3">Model</dt>
            <dd class="mt-0.5 text-ink-1">{providerLabel}</dd>
          </div>
          <div>
            <dt class="text-xs text-ink-3">Visibility</dt>
            <dd class="mt-0.5 text-ink-1">{isPrivate ? 'Private' : 'Public'}</dd>
          </div>
          {#if kv_do?.nsfw}
            <div>
              <dt class="text-xs text-ink-3">Safety</dt>
              <dd class="mt-0.5 text-ink-1">{isUnsafe ? 'Flagged' : 'Safe'}</dd>
            </div>
          {/if}
          {#if id}
            <div class="col-span-2 sm:col-span-3">
              <dt class="text-xs text-ink-3">Song ID</dt>
              <dd class="mt-1 flex items-center gap-2">
                <code class="min-w-0 truncate font-mono text-xs text-ink-2">{id}</code>
                <button
                  type="button"
                  onclick={() => copyText(id, 'Song ID')}
                  class="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-2.5 text-xs font-medium text-ink-2 hover:bg-white/10 hover:text-ink-1"
                >
                  <Icon name="copy" size={14} />
                  <span>Copy</span>
                </button>
              </dd>
            </div>
          {/if}
        </dl>
      </section>
    </div>
  </div>
</article>

<!-- Overflow menu sheet -->
<Sheet open={moreOpen} title={title} maxWidth="sm" onClose={() => (moreOpen = false)}>
  <div class="divide-y divide-line rounded-[var(--radius-control)] bg-surface-1 ring-1 ring-inset ring-line">
    {#if isOwner && kv_do?.nsfw?.safe !== false}
      <button
        type="button"
        onclick={() => {
          moreOpen = false;
          onMakeSongPublic();
        }}
        class="focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
      >
        <Icon name={d1?.Public ? 'lock' : 'globe'} size={18} class="text-ink-2" />
        <span>{d1?.Public ? 'Make private' : 'Publish to feed'}</span>
      </button>
    {/if}

    {#if id}
      <button
        type="button"
        onclick={() => {
          moreOpen = false;
          void copyText(id, 'Song ID');
        }}
        class="focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
      >
        <Icon name="copy" size={18} class="text-ink-2" />
        <span>Copy song ID</span>
      </button>
    {/if}

    {#if isOwner}
      <button
        type="button"
        onclick={() => {
          moreOpen = false;
          onDeleteSong();
        }}
        class="focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-danger hover:bg-danger/10"
      >
        <Icon name="trash" size={18} />
        <span>Delete song</span>
      </button>
    {/if}
  </div>
</Sheet>
