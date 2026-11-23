<script lang="ts">
  import type { MusicProvider, SmolDetailResponse } from '../../types/domain';
  import { PROVIDER_META, otherProviderOf } from '../../utils/takes';
  import Button from '../ui/Button.svelte';
  import Chip from '../ui/Chip.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    isPolling: boolean;
    failure?: NonNullable<SmolDetailResponse['kv_do']>['failure'];
    provider: MusicProvider;
    playlist: string | null;
    retryError?: string | null;
    canManage?: boolean;
    onRetry: (overrideProvider?: MusicProvider) => void;
    onEditPrompt: () => void;
    onRemovePlaylist: () => void;
  }

  let {
    isPolling,
    failure,
    provider,
    playlist,
    retryError = null,
    canManage = true,
    onRetry,
    onEditPrompt,
    onRemovePlaylist,
  }: Props = $props();

  // Catch internal env var identifiers (UPPER_SNAKE_CASE) and infrastructure/gateway error strings.
  const INTERNAL_ERROR_RE =
    /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b(?:BYOK|R2 storage|gateway|quota enforcement|service binding|binding|wrangler|Durable Object|HTTP \d{3})\b/i;

  const retryable = $derived(failure ? failure.retryable : true);
  const alternateProvider = $derived(otherProviderOf(provider));
  const alternateLabel = $derived(PROVIDER_META[alternateProvider].label);

  const safeTitle = $derived(failure?.title ?? 'Generation did not finish');
  const safeMessage = $derived.by(() => {
    const raw = failure?.message?.trim();
    if (!raw || INTERNAL_ERROR_RE.test(raw)) {
      switch (failure?.code) {
        case 'content_policy':
          return 'Adjust the prompt or lyrics before creating this song.';
        case 'generation_timeout':
          return `${PROVIDER_META[provider].label} took too long to finish. Try again or switch to ${alternateLabel}.`;
        case 'provider_unavailable':
          return `${PROVIDER_META[provider].label} is temporarily unavailable right now. Try switching to ${alternateLabel} or try again shortly.`;
        case 'terminated':
          return 'This generation was stopped before it could finish. You can try again or edit the prompt.';
        default:
          return `${PROVIDER_META[provider].label} is temporarily unavailable right now. Try switching to ${alternateLabel} or try again shortly.`;
      }
    }
    return raw;
  });
</script>

<section
  role="alert"
  aria-label="Generation failed"
  class="rounded-[var(--radius-control)] bg-surface-1 p-5 ring-1 ring-inset ring-warning/35"
>
  <div class="flex items-start gap-3">
    <div class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
      <Icon name="warning" size={20} />
    </div>
    <div class="min-w-0 flex-1">
      <h2 class="text-base font-semibold text-ink-1">
        {safeTitle}
      </h2>
      <p class="mt-1 max-w-[65ch] [overflow-wrap:anywhere] text-sm leading-relaxed text-ink-2">
        {safeMessage}
      </p>

      {#if playlist}
        <div class="mt-3">
          <Chip tone="accent" removable removeLabel="Remove playlist" onRemove={onRemovePlaylist}>
            {playlist}
          </Chip>
        </div>
      {/if}

      {#if retryError}
        <p
          role="alert"
          class="mt-3 rounded-[var(--radius-control)] bg-danger/15 px-3 py-2 text-xs leading-relaxed text-danger ring-1 ring-inset ring-danger/35"
        >
          {retryError}
        </p>
      {/if}

      {#if canManage}
        <div class="mt-4 flex flex-wrap items-center gap-2.5">
          {#if retryable}
            <Button
              variant="primary"
              loading={isPolling}
              disabled={isPolling}
              onclick={() => onRetry()}
            >
              <Icon name="refresh" size={16} />
              <span>Try again</span>
            </Button>

            <Button
              variant="secondary"
              disabled={isPolling}
              onclick={() => onRetry(alternateProvider)}
            >
              <span>Try with {alternateLabel}</span>
            </Button>

            <Button
              variant="ghost"
              disabled={isPolling}
              onclick={onEditPrompt}
            >
              <span>Edit prompt</span>
            </Button>
          {:else}
            <Button variant="primary" onclick={onEditPrompt}>
              <span>Edit prompt</span>
            </Button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</section>
