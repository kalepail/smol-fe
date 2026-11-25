<script lang="ts">
  import type { Track } from '../../utils/track';
  import { parseLyricBlocks } from '../../utils/lyrics';
  import Sheet from '../ui/Sheet.svelte';
  import CoverArt from '../ui/CoverArt.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    open: boolean;
    title: string;
    artistName?: string | null;
    coverId?: string | null;
    rawLyrics: string;
    isGenerating?: boolean;
    activeTrack: Track | null;
    isPlaying: boolean;
    playerReady: boolean;
    onPlayToggle: () => void;
    onCopy: () => void;
    onClose: () => void;
  }

  let {
    open,
    title,
    artistName = null,
    coverId = null,
    rawLyrics,
    isGenerating = false,
    activeTrack,
    isPlaying,
    playerReady,
    onPlayToggle,
    onCopy,
    onClose,
  }: Props = $props();

  const blocks = $derived(parseLyricBlocks(rawLyrics));
</script>

<Sheet
  {open}
  title="Lyrics"
  placement="right"
  fullHeight
  maxWidth="md"
  {onClose}
>
  {#snippet headerExtra()}
    <Button variant="ghost" size="sm" class="min-h-11" onclick={onCopy}>
      <Icon name="copy" size={15} />
      <span>Copy</span>
    </Button>
  {/snippet}

  <div class="space-y-4">
    {#if isGenerating}
      <div
        role="status"
        class="flex items-center gap-2.5 rounded-[var(--radius-control)] bg-surface-1 px-3.5 py-2.5 text-xs text-ink-2 ring-1 ring-inset ring-line"
      >
        <Loader classNames="size-3.5" textColor="text-accent" />
        <span>Audio is still recording — you can read along while it finishes.</span>
      </div>
    {/if}

    <div class="max-w-[65ch] pb-4" data-lyrics-body>
      {#each blocks as block (block.key)}
        {#if block.kind === 'section'}
          <p class="mt-5 mb-1.5 text-xs font-semibold tracking-wide text-ink-3 first:mt-0">
            {block.text}
          </p>
        {:else if block.kind === 'break'}
          <div class="h-3.5" aria-hidden="true"></div>
        {:else}
          <p class="[overflow-wrap:anywhere] text-base leading-[1.75] text-ink-1/95 sm:text-[17px]">
            {block.text}
          </p>
        {/if}
      {/each}
    </div>
  </div>

  {#snippet footer()}
    {#if activeTrack}
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <div class="size-10 shrink-0">
            <CoverArt id={coverId} alt="" scale={4} />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-ink-1">{title}</p>
            {#if artistName}
              <p class="truncate text-xs text-ink-2">{artistName}</p>
            {/if}
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={!playerReady}
          onclick={onPlayToggle}
          class="min-h-11 shrink-0 rounded-full px-4"
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </Button>
      </div>
    {/if}
  {/snippet}
</Sheet>
