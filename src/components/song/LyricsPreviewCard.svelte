<script lang="ts">
  import { isLyricSectionTag } from '../../utils/lyrics';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    rawLyrics: string;
    onOpen: () => void;
    onCopy: () => void;
  }

  let { rawLyrics, onOpen, onCopy }: Props = $props();

  const nonEmptyLines = $derived(
    rawLyrics
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );
  const contentLineCount = $derived(
    nonEmptyLines.filter((line) => !isLyricSectionTag(line)).length || nonEmptyLines.length
  );
  const previewLimit = $derived(
    nonEmptyLines.length > 0 && isLyricSectionTag(nonEmptyLines[0]) ? 5 : 4
  );
  const previewLines = $derived(nonEmptyLines.slice(0, previewLimit));
  const hasMoreLines = $derived(nonEmptyLines.length > previewLines.length);
</script>

<section
  id="song-lyrics"
  aria-labelledby="song-lyrics-heading"
  class="rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line sm:p-5"
>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-baseline gap-2">
      <h2 id="song-lyrics-heading" class="text-base font-semibold text-ink-1">
        Lyrics
      </h2>
      <span class="tabular text-xs text-ink-3">
        {contentLineCount} {contentLineCount === 1 ? 'line' : 'lines'}
      </span>
    </div>

    <div class="flex items-center gap-1">
      <Button variant="ghost" size="sm" class="min-h-11" onclick={onCopy}>
        <Icon name="copy" size={15} />
        <span>Copy</span>
      </Button>
      <Button variant="secondary" size="sm" class="min-h-11" onclick={onOpen}>
        <Icon name="lyrics" size={15} />
        <span>Read lyrics</span>
      </Button>
    </div>
  </div>

  <button
    type="button"
    onclick={onOpen}
    aria-label="Open full lyrics"
    class="focus-ring group relative block w-full rounded-[calc(var(--radius-control)-2px)] text-left"
  >
    <div class="max-w-[65ch] space-y-1 text-sm leading-relaxed sm:text-base">
      {#each previewLines as line, index (index)}
        {#if isLyricSectionTag(line)}
          <p class="text-xs font-semibold tracking-wide text-ink-3">
            {line.slice(1, -1)}
          </p>
        {:else}
          <p class="truncate text-ink-1/90 transition-colors group-hover:text-ink-1">
            {line}
          </p>
        {/if}
      {/each}
    </div>

    {#if hasMoreLines}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-1 to-transparent"
      ></div>
    {/if}
  </button>
</section>
