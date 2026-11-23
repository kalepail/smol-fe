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
    onRetry,
    onEditPrompt,
    onRemovePlaylist,
  }: Props = $props();

  const retryable = $derived(failure ? failure.retryable : true);
  const alternateProvider = $derived(otherProviderOf(provider));
  const alternateLabel = $derived(PROVIDER_META[alternateProvider].label);
</script>

<div
  role="alert"
  class="rounded-[var(--radius-control)] bg-surface-1 p-5 ring-1 ring-inset ring-warning/35"
>
  <div class="flex items-start gap-3">
    <div class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
      <Icon name="warning" size={20} />
    </div>
    <div class="min-w-0 flex-1">
      <h2 class="text-base font-semibold text-ink-1">
        {failure?.title ?? 'Generation did not finish'}
      </h2>
      <p class="mt-1 text-sm leading-relaxed text-ink-2">
        {failure?.message ?? 'Something interrupted this song before it could complete. You can try again.'}
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
        {:else}
          <Button variant="primary" onclick={onEditPrompt}>
            <span>Edit prompt</span>
          </Button>
        {/if}
      </div>
    </div>
  </div>
</div>
