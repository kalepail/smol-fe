<script lang="ts">
  import type { MixtapeDetail, OwnedMixtape } from '../../services/api/mixtapes';
  import { hiddenReasonHeadline, isMatchReason, mergePreview } from '../../utils/mixtapeCoaching';
  import { mixtapeAdvice, type MixtapeHiddenReason } from '../../utils/mixtapeVisibility';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import '../ui/ownerIcons';
  import MixtapeCollage from '../ui/MixtapeCollage.svelte';

  /**
   * Owner-only "why is this hidden" callout (Report 24 §5.3). Persistent, not
   * urgent → a labelled <section>, never role="alert". Rendered only through
   * MixtapeHeader's `ownerBanner` slot, only for the creator, only when the
   * mixtape is hidden from the Mixtapes page.
   */
  interface Props {
    mixtape: MixtapeDetail;
    /** The matching listed mixtape from GET /mixtapes/mine, when loaded. */
    match?: OwnedMixtape | null;
    onEdit: () => void;
    onAddSongs: () => void;
    onMerge: (targetId: string) => void;
    onDelete: () => void;
  }

  let { mixtape, match = null, onEdit, onAddSongs, onMerge, onDelete }: Props = $props();

  const reason = $derived(mixtape.hiddenReason ?? null);
  const relatedId = $derived(mixtape.relatedMixtapeId ?? null);
  const relatedTitle = $derived(mixtape.relatedMixtapeTitle ?? match?.title ?? null);
  const total = $derived(mixtape.publicTrackCount ?? mixtape.trackCount);
  // The live API sends the exact reason + fix as `Advice`; fall back to the shared (identical) copy.
  const advice = $derived(
    mixtape.advice ?? mixtapeAdvice((reason as MixtapeHiddenReason | null) ?? null, relatedTitle) ?? null
  );
  // Most advice strings already state WHY. Only the count-based / unknown reasons need a lead-in.
  const why = $derived(
    reason === 'too_few' || !advice ? hiddenReasonHeadline(reason, relatedTitle, total) : null
  );
  const isMatch = $derived(isMatchReason(reason) && Boolean(relatedId));
  const isCopy = $derived(reason === 'duplicate' || reason === 'superseded');
  const mergeAdds = $derived(
    match ? mergePreview(mixtape.tracks.map((track) => track.Id), match.trackIds).added.length : null
  );
  const needsSongs = $derived(reason === 'too_few' || reason === 'empty');
  const titleId = $derived(`owner-callout-title-${mixtape.id}`);
</script>

<section
  aria-labelledby={titleId}
  data-owner-callout
  class="flex flex-col gap-3 rounded-[var(--radius-control)] bg-warning/12 p-3.5 ring-1 ring-inset ring-warning/35 sm:p-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6"
>
  <div class="flex min-w-0 flex-col gap-2.5">
    <h2 id={titleId} class="flex items-center gap-2 text-sm font-semibold text-ink-1">
      <Icon name="eye-off" size={18} class="text-warning" />
      <span>Hidden from the Mixtapes page</span>
    </h2>
    {#if why}
      <p class="text-sm leading-relaxed text-ink-2" data-owner-callout-why>{why}</p>
    {/if}
    {#if advice}
      <p class="text-sm leading-relaxed text-ink-2" data-owner-callout-advice>{advice}</p>
    {/if}

    {#if isMatch && relatedId}
      <a
        href={`/mixtapes/${encodeURIComponent(relatedId)}`}
        class="focus-ring flex min-h-11 min-w-0 max-w-md items-center gap-3 rounded-[var(--radius-control)] bg-canvas/50 p-2 ring-1 ring-inset ring-line hover:bg-surface-2"
      >
        {#if match}
          <div class="w-10 shrink-0"><MixtapeCollage coverUrls={match.coverUrls} alt="" /></div>
        {:else}
          <span class="flex size-10 shrink-0 items-center justify-center rounded bg-surface-2 text-ink-2">
            <Icon name="mixtapes" size={18} />
          </span>
        {/if}
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-ink-1">{relatedTitle ?? 'Your other mixtape'}</span>
          <span class="tabular block text-xs text-ink-2">
            {match ? `${match.trackCount} ${match.trackCount === 1 ? 'song' : 'songs'} · Listed` : 'Listed'}
          </span>
        </span>
        <Icon name="chevron-right" size={16} class="text-ink-3" />
      </a>
    {/if}

    <p class="text-xs text-ink-3">Only you can see this note.</p>
  </div>

  <div class="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
    {#if needsSongs}
      <Button variant="primary" size="sm" class="min-h-11" onclick={onAddSongs}>
        <Icon name="plus" size={16} />
        <span>Add songs</span>
      </Button>
    {:else}
      {#if isMatch && relatedId && mergeAdds !== 0}
        <Button variant={isCopy ? 'secondary' : 'primary'} size="sm" class="min-h-11" onclick={() => onMerge(relatedId)}>
          <Icon name="merge" size={16} />
          <span class="max-w-[14rem] truncate">Merge into "{relatedTitle}"</span>
        </Button>
      {/if}
      <Button variant="secondary" size="sm" class="min-h-11" onclick={onEdit}>
        <Icon name="pencil" size={16} />
        <span>Edit</span>
      </Button>
    {/if}
    <Button variant="danger" size="sm" class="min-h-11" onclick={onDelete}>
      <Icon name="trash" size={16} />
      <span>{isMatch ? 'Delete this copy' : 'Delete mixtape'}</span>
    </Button>
  </div>
</section>
