<script lang="ts">
  import { untrack } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import type { MusicProvider, Smol, SmolDetailResponse } from '../../types/domain';
  import { player, playQueue, setTrackLiked, toggle, updateTrack } from '../../stores/audio.svelte';
  import { userState } from '../../stores/user.svelte';
  import { mixtapeTrackIds, toggleDraftTrack } from '../../stores/mixtape.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { toTrack, type Track } from '../../utils/track';
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
  import GenerationFailure from '../create/GenerationFailure.svelte';
  import SongDetailsPanel from '../song/SongDetailsPanel.svelte';
  import LyricsPreviewCard from '../song/LyricsPreviewCard.svelte';
  import LyricsSheet from '../song/LyricsSheet.svelte';

  interface Props {
    id: string | null;
    d1?: SmolDetailResponse['d1'];
    kv_do?: SmolDetailResponse['kv_do'];
    liked?: boolean;
    bestSong?: string;
    showGenerationLoader: boolean;
    failed?: boolean;
    isPolling?: boolean;
    playlist?: string | null;
    retryError?: string | null;
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
    onRetry?: (overrideProvider?: MusicProvider) => void;
    onEditPrompt?: () => void;
    onRemovePlaylist?: () => void;
  }

  let {
    id,
    d1,
    kv_do,
    liked,
    bestSong = $bindable(),
    showGenerationLoader,
    failed = false,
    isPolling = false,
    playlist = null,
    retryError = null,
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
    onRetry = () => {},
    onEditPrompt = () => {},
    onRemovePlaylist = () => {},
  }: Props = $props();

  let moreOpen = $state(false);
  let lyricsOpen = $state(false);
  let tagsExpanded = $state(false);

  $effect(() => {
    id;
    moreOpen = false;
    lyricsOpen = false;
    tagsExpanded = false;
  });

  const detail = $derived<SmolDetailResponse>({ d1, kv_do, liked });
  const activeProvider = $derived(providerOf(detail));
  const fallback = $derived(isFallbackGeneration(detail));
  const providerLabel = $derived(PROVIDER_META[activeProvider].label);

  const isPublished = $derived(Boolean(d1?.Id));
  const isPrivate = $derived(
    d1 ? d1.Public === 0 : kv_do?.payload?.public === false
  );
  const isInstrumental = $derived(
    Boolean(kv_do?.payload?.instrumental || d1?.Instrumental)
  );
  const isSafetyUnknown = $derived(Boolean(kv_do?.nsfw?.unknown));
  const isUnsafe = $derived(Boolean(kv_do?.nsfw && kv_do.nsfw.safe === false && !kv_do.nsfw.unknown));
  const isRestricted = $derived(isUnsafe || isSafetyUnknown);
  const hasCoverArt = $derived(Boolean(kv_do?.image || d1?.Id));

  const title = $derived.by(() => {
    const resolved = kv_do?.lyrics?.title || d1?.Title;
    if (resolved) return resolved;
    if (showGenerationLoader) return 'Creating your song…';
    if (failed) return 'Unfinished song';
    return kv_do?.description || 'Untitled Smol';
  });

  const artistName = $derived(
    d1?.Creator ?? d1?.Username ?? d1?.artist ?? d1?.author ?? shortenAddress(d1?.Address)
  );

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

  // Track whichever take of THIS song is currently active in the player so Take 2 stays pauseable from hero & lyrics drawer (S2).
  const activeSongTrack = $derived.by(() => {
    const currentKey = player.track?.key;
    if (currentKey) {
      const matched = takes.find((t) => t !== null && t.key === currentKey);
      if (matched) return matched;
    }
    return primaryTrack;
  });

  const isSongPlaying = $derived(
    Boolean(
      activeSongTrack &&
        player.track?.key === activeSongTrack.key &&
        (player.status === 'playing' || player.status === 'loading')
    )
  );

  const isInMixtape = $derived(Boolean(id && mixtapeTrackIds.current.has(id)));
  const rawLyrics = $derived(kv_do?.lyrics?.lyrics?.trim() ?? '');
  const hasLyrics = $derived(!isInstrumental && rawLyrics.length > 0);

  const styleTags = $derived.by(() => {
    const raw = kv_do?.lyrics?.style ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      const trimmed = item?.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  });
  const visibleTags = $derived(tagsExpanded ? styleTags : styleTags.slice(0, 8));
  const hiddenTagCount = $derived(Math.max(0, styleTags.length - visibleTags.length));

  const showOwnerPrivateBanner = $derived(
    isOwner && isPublished && isPrivate && !isRestricted && !failed && !showGenerationLoader
  );
  const canAddToMixtape = $derived(
    Boolean(userState.contractId && isPublished && !isPrivate && !isRestricted)
  );
  // D5: Private unminted songs require publishing first (owners get a "Publish to mint" card; visitors don't see Mint on private songs).
  const showCollectibleSection = $derived(
    !failed &&
      !showGenerationLoader &&
      !isRestricted &&
      (minted || (isPublished && (!isPrivate || isOwner)))
  );
  const showActionRow = $derived(
    Boolean(activeSongTrack || hasLyrics || isPublished)
  );
  const playlistTag = $derived(d1?.Playlist ?? kv_do?.payload?.playlist ?? null);

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
    if (!activeSongTrack) return;
    playTake(activeSongTrack);
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
    if (!smol || isPrivate || isRestricted) return;
    toggleDraftTrack({ ...smol, Public: d1?.Public === 0 ? 0 : d1?.Public === 1 ? 1 : undefined });
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

<article class="app-container space-y-5 py-6 sm:py-8">
  <!-- Status banners above the grid (matches MixtapeHeader; avoids wedging banners between cover and title on mobile) -->
  {#if showOwnerPrivateBanner}
    <div
      role="status"
      class="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-surface-1 px-4 py-3 ring-1 ring-inset ring-line"
    >
      <div class="flex min-w-0 items-center gap-2.5 text-sm text-ink-2">
        <Icon name="lock" size={16} class="shrink-0 text-ink-3" />
        <span>Private · Hidden from feeds and search. Anyone with the link can listen.</span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        class="min-h-11 shrink-0"
        onclick={onMakeSongPublic}
      >
        <Icon name="globe" size={15} />
        <span>Publish to feed</span>
      </Button>
    </div>
  {/if}

  {#if isUnsafe}
    <div
      role="status"
      class="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-danger/15 px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/35"
    >
      <Icon name="warning" size={18} class="mt-0.5 shrink-0" />
      <span>
        Flagged for sensitive content{kv_do?.nsfw?.categories?.length ? ` (${kv_do.nsfw.categories.join(', ')})` : ''}. Kept private from public feeds and cannot be published or minted.
      </span>
    </div>
  {:else if isSafetyUnknown}
    <div
      role="status"
      class="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-warning/15 px-4 py-3 text-sm text-warning ring-1 ring-inset ring-warning/35"
    >
      <Icon name="info" size={18} class="mt-0.5 shrink-0" />
      <span>
        Safety check didn't complete. Kept private from public feeds.
      </span>
    </div>
  {/if}

  <!-- D6: Two-column grid starts at md (224px cover matching MixtapeHeader), expands to 320px left rail with Details under cover at lg -->
  <div
    class="grid grid-cols-1 gap-6 md:grid-cols-[224px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:items-start md:gap-x-7 md:gap-y-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-x-10"
  >
    <!-- Cover art -->
    <div class="mx-auto w-full max-w-[min(240px,30dvh)] md:col-start-1 md:row-start-1 md:mx-0 md:max-w-none">
      {#if hasCoverArt}
        <CoverArt
          id={id}
          alt=""
          scale={8}
          loading="eager"
        />
      {:else if showGenerationLoader}
        <div
          aria-label="Generating cover art"
          class="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-media)] bg-surface-1 p-6 text-center ring-1 ring-inset ring-line"
        >
          <Loader classNames="size-6" textColor="text-accent" />
          <p class="text-xs font-medium text-ink-2">
            {kv_do?.lyrics?.title ? 'Painting pixel cover art…' : 'Artwork queued…'}
          </p>
        </div>
      {:else if failed}
        <div
          aria-label="No cover art generated"
          class="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-media)] bg-surface-1 p-6 text-center ring-1 ring-inset ring-line"
        >
          <Icon name="warning" size={28} class="text-warning/80" />
          <p class="text-xs text-ink-3">No artwork generated</p>
        </div>
      {:else}
        <CoverArt id={null} alt="" />
      {/if}
    </div>

    <!-- Main column -->
    <div class="min-w-0 space-y-5 md:col-start-2 md:row-start-1 lg:row-span-2">
      <!-- Hero header -->
      <header class="space-y-2.5">
        <h1 class="[overflow-wrap:anywhere] text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl lg:text-4xl">
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
          {#if isPrivate && !showOwnerPrivateBanner && !isRestricted}
            <Chip tone="neutral">Private</Chip>
          {/if}
          {#if showGenerationLoader}
            <Chip tone="accent">Generating</Chip>
          {/if}
        </div>

        {#if fallback}
          <p class="flex items-center gap-2 text-sm text-ink-2">
            <Icon name="info" size={16} class="shrink-0 text-ink-3" />
            <span>Made with ElevenLabs — Classic was unavailable.</span>
          </p>
        {/if}
      </header>

      <!-- S1: Single-row action bar down to 320px (Add to mixtape & Share live in More below sm; Lyrics label hides below 360px) -->
      {#if showActionRow}
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2" data-song-actions>
          {#if activeSongTrack}
            <Button
              variant="primary"
              disabled={!player.ready}
              onclick={handlePrimaryPlay}
              class="min-w-[96px] rounded-full px-4 min-[360px]:min-w-[104px] sm:min-w-[136px] sm:px-6"
            >
              {#if isSongPlaying}
                <Icon name="pause" size={18} />
                <span>Pause</span>
              {:else}
                <Icon name="play" size={18} />
                <span>Play</span>
              {/if}
            </Button>
          {/if}

          {#if hasLyrics}
            <Button
              variant="secondary"
              size="md"
              title="Lyrics"
              class="min-w-11 rounded-full px-3 min-[360px]:px-3.5 sm:px-4"
              onclick={() => (lyricsOpen = true)}
            >
              <Icon name="lyrics" size={18} />
              <span class="sr-only min-[360px]:not-sr-only">Lyrics</span>
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

          {#if canAddToMixtape}
            <div class="hidden sm:inline-flex">
              <IconButton
                label={isInMixtape ? 'Remove from mixtape' : 'Add to mixtape'}
                variant="surface"
                onclick={handleAddToMixtape}
              >
                <Icon
                  name={isInMixtape ? 'check' : 'plus-circle'}
                  size={20}
                  class={isInMixtape ? 'text-accent' : ''}
                />
              </IconButton>
            </div>
          {/if}

          {#if isPublished && !isRestricted}
            <div class="hidden sm:inline-flex">
              <IconButton
                label="Share song"
                variant="surface"
                onclick={handleShare}
              >
                <Icon name="share" size={20} />
              </IconButton>
            </div>
          {/if}

          {#if isPublished}
            <IconButton label="More options" variant="surface" onclick={() => (moreOpen = true)}>
              <Icon name="ellipsis" size={20} />
            </IconButton>
          {/if}
        </div>
      {/if}

      <!-- Stateful media slot: Failure recovery OR Generation progress OR 2-take switcher -->
      {#if failed}
        <GenerationFailure
          {isPolling}
          failure={kv_do?.failure}
          provider={activeProvider}
          {playlist}
          {retryError}
          canManage={isOwner}
          {onRetry}
          {onEditPrompt}
          {onRemovePlaylist}
        />
      {:else}
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
      {/if}

      <!-- Collectible / Mint & Trade surface (D5: private unminted songs require publishing first) -->
      {#if showCollectibleSection}
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
                {tradeReady
                  ? 'Buy or sell this song token with KALE.'
                  : 'Mint confirmed on Stellar — market indexing…'}
              </p>
            {:else if isPrivate}
              <h2 class="text-sm font-semibold text-ink-1">Publish to mint</h2>
              <p class="mt-1 text-xs text-ink-2">
                Publish this song to the feed before minting it as a collectible for 100 KALE.
              </p>
            {:else}
              <h2 class="text-sm font-semibold text-ink-1">Make it a collectible</h2>
              <p class="mt-1 text-xs text-ink-2">
                {minting
                  ? 'Minting on Stellar… usually under 30 seconds.'
                  : 'Mint for 100 KALE to enable trading and earn creator fees.'}
              </p>
            {/if}
          </div>

          {#if minted && tradeReady}
            <Button variant="secondary" onclick={onOpenTradeModal}>
              <span>Trade</span>
            </Button>
          {:else if !minted && !isPrivate}
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

      <!-- Prompt & Style tags (S5a: hide Remix prompt while generating) -->
      {#if kv_do?.payload?.prompt || styleTags.length > 0}
        <section class="space-y-3 border-t border-line pt-5">
          {#if kv_do?.payload?.prompt}
            <div class="flex flex-wrap items-center justify-between gap-2">
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
                {#if !failed && !showGenerationLoader}
                  <Button variant="secondary" size="sm" class="min-h-11" onclick={handleRemixPrompt}>
                    <Icon name="sparkles" size={15} />
                    <span>Remix prompt</span>
                  </Button>
                {/if}
              </div>
            </div>
            <p class="max-w-[65ch] [overflow-wrap:anywhere] text-sm leading-relaxed text-ink-2">
              {kv_do.payload.prompt}
            </p>
          {/if}

          {#if styleTags.length > 0}
            <div class="flex flex-wrap items-center gap-1.5 pt-1" aria-label="Style tags">
              {#each visibleTags as tag (tag)}
                <Chip tone="neutral">{tag}</Chip>
              {/each}
              {#if hiddenTagCount > 0}
                <button
                  type="button"
                  aria-expanded={false}
                  onclick={() => (tagsExpanded = true)}
                  class="focus-ring inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium text-ink-2 hover:bg-white/8 hover:text-ink-1"
                >
                  +{hiddenTagCount} more
                </button>
              {:else if tagsExpanded && styleTags.length > 8}
                <button
                  type="button"
                  aria-expanded={true}
                  onclick={() => (tagsExpanded = false)}
                  class="focus-ring inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium text-ink-2 hover:bg-white/8 hover:text-ink-1"
                >
                  Show fewer
                </button>
              {/if}
            </div>
          {/if}
        </section>
      {/if}

      <!-- D3: Minimal Lyrics preview card (lines + single "Show all N lines" control when truncated) -->
      {#if hasLyrics}
        <LyricsPreviewCard
          {rawLyrics}
          onOpen={() => (lyricsOpen = true)}
        />
      {/if}
    </div>

    <!-- Details panel (disclosure spanning width below lg; docked directly under Cover Art at lg+) -->
    <SongDetailsPanel
      {id}
      description={kv_do?.description ?? null}
      {providerLabel}
      wasFallback={fallback}
      {isPrivate}
      plays={d1?.Plays ?? null}
      nsfw={kv_do?.nsfw ?? null}
      {playlistTag}
      onCopyId={() => id && void copyText(id, 'Song ID')}
      class="md:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-2"
    />
  </div>
</article>

<!-- Focused Lyrics drawer / sheet -->
{#if hasLyrics}
  <LyricsSheet
    open={lyricsOpen}
    {title}
    artistName={d1?.Address ? artistName : null}
    coverId={hasCoverArt ? id : null}
    {rawLyrics}
    isGenerating={showGenerationLoader}
    activeTrack={activeSongTrack}
    isPlaying={isSongPlaying}
    playerReady={player.ready}
    onPlayToggle={handlePrimaryPlay}
    onCopy={() => void copyText(rawLyrics, 'Lyrics')}
    onClose={() => (lyricsOpen = false)}
  />
{/if}

<!-- Overflow menu sheet -->
<Sheet open={moreOpen} title={title} maxWidth="sm" onClose={() => (moreOpen = false)}>
  <div class="divide-y divide-line rounded-[var(--radius-control)] bg-surface-1 ring-1 ring-inset ring-line">
    {#if isOwner && isPublished && !isRestricted && (isPrivate || !minted)}
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

    {#if canAddToMixtape}
      <button
        type="button"
        onclick={() => {
          moreOpen = false;
          handleAddToMixtape();
        }}
        class="focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
      >
        <Icon
          name={isInMixtape ? 'check' : 'plus-circle'}
          size={18}
          class={isInMixtape ? 'text-accent' : 'text-ink-2'}
        />
        <span>{isInMixtape ? 'Remove from mixtape' : 'Add to mixtape'}</span>
      </button>
    {/if}

    {#if id && isPublished && !isRestricted}
      <button
        type="button"
        onclick={() => {
          moreOpen = false;
          void handleShare();
        }}
        class="focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
      >
        <Icon name="share" size={18} class="text-ink-2" />
        <span>Share song</span>
      </button>

      <button
        type="button"
        onclick={() => {
          moreOpen = false;
          void copyText(`${window.location.origin}/${id}`, 'Song link');
        }}
        class="focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
      >
        <Icon name="copy" size={18} class="text-ink-2" />
        <span>Copy song link</span>
      </button>
    {/if}

    {#if kv_do?.payload?.prompt && !showGenerationLoader}
      <button
        type="button"
        onclick={() => {
          moreOpen = false;
          handleRemixPrompt();
        }}
        class="focus-ring flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
      >
        <Icon name="sparkles" size={18} class="text-ink-2" />
        <span>Remix prompt</span>
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

    {#if isOwner && isPublished}
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
