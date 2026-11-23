<script lang="ts">
  import {
    PROVIDER_META,
    maxPromptLength,
    type MusicProvider,
  } from '../../utils/takes';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import ModelToggle from '../create/ModelToggle.svelte';
  import Switch from '../ui/Switch.svelte';
  import Button from '../ui/Button.svelte';
  import Chip from '../ui/Chip.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    prompt: string;
    isPublic: boolean;
    isInstrumental: boolean;
    provider: MusicProvider;
    playlist: string | null;
    isGenerating: boolean;
    isAuthenticated: boolean;
    onSubmit: () => void;
    onRemovePlaylist: () => void;
  }

  let {
    prompt = $bindable(),
    isPublic = $bindable(),
    isInstrumental = $bindable(),
    provider = $bindable(),
    playlist,
    isGenerating,
    isAuthenticated,
    onSubmit,
    onRemovePlaylist,
  }: Props = $props();

  const EXAMPLE_PROMPTS = [
    {
      label: 'Lo-fi study beat',
      prompt: 'Dreamy late-night lo-fi study beat with warm piano and vinyl crackle',
    },
    {
      label: '80s arcade synthwave',
      prompt: 'Midnight arcade synthwave with pulsing bass and nostalgic leads',
    },
    {
      label: 'Rainy piano ballad',
      prompt: 'Warm acoustic guitar and rainy-day piano ballad',
    },
    {
      label: 'Chiptune boss fight',
      prompt: 'Upbeat 8-bit chiptune boss battle anthem',
    },
  ];

  const limit = $derived(maxPromptLength(isInstrumental));
  const charCount = $derived(prompt.length);
  const overBy = $derived(Math.max(0, charCount - limit));
  const nearLimit = $derived(overBy === 0 && charCount >= Math.floor(limit * 0.9));
  const canSubmit = $derived(
    isAuthenticated && !isGenerating && prompt.trim().length > 0 && overBy === 0
  );
  const providerMeta = $derived(PROVIDER_META[provider]);

  const submitLabel = $derived.by(() => {
    if (!isAuthenticated) return 'Sign in to create';
    if (isGenerating) return 'Creating…';
    if (overBy > 0) return `Shorten prompt (${overBy} over)`;
    return 'Create song';
  });

  function handleFormSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!isAuthenticated) {
      openAuthSheet('signin', 'Sign in to generate and save songs.');
      return;
    }
    if (!canSubmit) return;
    onSubmit();
  }
</script>

<section class="app-container py-5 sm:py-8">
  <div class="mx-auto max-w-xl">
    <header class="mb-4">
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">
        Create a song
      </h1>
      <p class="mt-1 text-sm text-ink-2">
        Describe the sound, mood, or story. SMOL composes and paints pixel cover art.
      </p>
    </header>

    <form class="space-y-4" onsubmit={handleFormSubmit}>
      <!-- Prompt input with non-truncating character counter -->
      <div class="space-y-2">
        <label for="song-prompt" class="sr-only">Song prompt</label>
        <div
          class={`relative rounded-[var(--radius-control)] bg-surface-1 ring-1 ring-inset ${
            overBy > 0 ? 'ring-danger/60' : 'ring-line-strong'
          }`}
        >
          <textarea
            id="song-prompt"
            name="prompt"
            rows="4"
            disabled={!isAuthenticated || isGenerating}
            placeholder="Describe a song: genre, mood, or story"
            bind:value={prompt}
            class="input-ring block w-full resize-y rounded-[var(--radius-control)] bg-transparent px-4 pt-3 pb-9 text-base leading-relaxed text-ink-1 placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
          ></textarea>
          <div
            aria-live="polite"
            class={`tabular pointer-events-none absolute right-3 bottom-2.5 text-xs font-medium ${
              overBy > 0
                ? 'text-danger'
                : nearLimit
                  ? 'text-warning'
                  : 'text-ink-3'
            }`}
          >
            {charCount} / {limit}
          </div>
        </div>

        {#if overBy > 0}
          <p role="alert" class="text-xs text-danger">
            Prompt is {overBy} character{overBy === 1 ? '' : 's'} over the {isInstrumental ? 'instrumental' : 'lyrical'} limit. Your text was kept so nothing is lost.
          </p>
        {/if}

        <!-- Example prompt chips when empty -->
        {#if isAuthenticated && !prompt.trim()}
          <div class="flex gap-2 overflow-x-auto pb-0.5">
            {#each EXAMPLE_PROMPTS as example (example.label)}
              <Chip class="min-h-11" onclick={() => (prompt = example.prompt)}>
                {example.label}
              </Chip>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Music model selector -->
      <ModelToggle
        bind:provider
        disabled={!isAuthenticated || isGenerating}
      />

      <!-- Options switches -->
      <div class="divide-y divide-line rounded-[var(--radius-control)] bg-surface-1 px-4 ring-1 ring-inset ring-line">
        <Switch
          id="create-instrumental"
          label="Instrumental"
          description="No vocals or lyrics"
          bind:checked={isInstrumental}
          disabled={!isAuthenticated || isGenerating}
        />
        <Switch
          id="create-public"
          label="Public"
          description="Show in the feed and search"
          bind:checked={isPublic}
          disabled={!isAuthenticated || isGenerating}
        />
      </div>

      {#if playlist}
        <div class="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-1 px-4 py-2.5 ring-1 ring-inset ring-line">
          <span class="text-sm text-ink-2">Adding to playlist</span>
          <Chip
            tone="accent"
            removable
            removeLabel="Remove playlist"
            onRemove={onRemovePlaylist}
          >
            {playlist}
          </Chip>
        </div>
      {/if}

      <!-- Primary submit CTA -->
      <div class="space-y-2.5 pt-1">
        {#if !isAuthenticated}
          <Button
            type="button"
            variant="primary"
            fullWidth
            class="min-h-12 text-base"
            onclick={() => openAuthSheet('signin', 'Sign in to create songs on SMOL.')}
          >
            Sign in to create
          </Button>
        {:else}
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={isGenerating}
            disabled={!canSubmit}
            class="min-h-12 text-base"
          >
            {#if !isGenerating && overBy === 0}
              <Icon name="sparkles" size={18} />
            {/if}
            <span>{submitLabel}</span>
          </Button>
        {/if}

        <p class="text-center text-xs leading-relaxed text-ink-2">
          {providerMeta.etaCopy}
        </p>
      </div>
    </form>
  </div>
</section>
