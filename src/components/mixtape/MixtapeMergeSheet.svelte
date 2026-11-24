<script lang="ts" module>
  export interface MergeSource {
    id: string;
    title: string;
    trackIds: string[];
    coverUrls: (string | null)[];
    /** Stored songs incl. private ones (BE merges the STORED list). */
    storedTrackCount?: number;
  }
</script>

<script lang="ts">
  import { MAX_MIXTAPE_TRACKS, MixtapeActionError, type OwnedMixtape } from '../../services/api/mixtapes';
  import { MERGE_REASSURANCE, mergeMixtapes, reviewMergeInEditor } from '../../services/mixtapeActions';
  import { mergePreview } from '../../utils/mixtapeCoaching';
  import { loadMyMixtapes } from '../../stores/myMixtapes.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import MixtapeCollage from '../ui/MixtapeCollage.svelte';

  /**
   * Merge one of the owner's mixtapes into another (Report 24 §5.5, Savee
   * "one outcome sentence" pattern). Preview math mirrors the backend merge:
   * target keeps its order, the source's missing songs are appended in source
   * order, and >100 songs is blocked before the request.
   */
  interface Props {
    open: boolean;
    source: MergeSource | null;
    /** The owner's other mixtapes (merge targets). */
    candidates: OwnedMixtape[];
    initialTargetId?: string | null;
    /** Where to go after a successful merge (detail page → the target). */
    navigateToTarget?: boolean;
    onClose: () => void;
  }

  let { open, source, candidates, initialTargetId = null, navigateToTarget = false, onClose }: Props = $props();

  let selectedId = $state<string | null>(null);
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let reviewing = $state(false);
  /**
   * After the server rejects a merge (>100, revision conflict, gone), the preview
   * is stale: we refetch, and submit stays disabled until the owner has seen the
   * refreshed counts for the SAME pair at a NEWER fingerprint (25d P2-4).
   */
  let rejected = $state<{ key: string; fingerprint: string } | null>(null);
  let refreshing = $state(false);

  const targets = $derived(candidates.filter((item) => item.id !== source?.id));
  const target = $derived(targets.find((item) => item.id === selectedId) ?? null);

  // (Re)initialise the selection whenever the sheet opens for a source.
  let openedFor = '';
  $effect(() => {
    const key = open && source ? `${source.id}:${initialTargetId ?? ''}` : '';
    if (key === openedFor) return;
    openedFor = key;
    if (!key) return;
    error = null;
    submitting = false;
    rejected = null;
    selectedId = initialTargetId && targets.some((item) => item.id === initialTargetId) ? initialTargetId : targets.length === 1 ? targets[0].id : null;
  });

  const preview = $derived(target && source ? mergePreview(source.trackIds, target.trackIds) : null);
  // Backend merges STORED lists: before = target's stored songs (incl. private), after = before + appended.
  const before = $derived(target ? Math.max(target.storedTrackCount, target.trackIds.length) : 0);
  const total = $derived(target && preview ? before + preview.added.length : 0);
  const tooMany = $derived(total > MAX_MIXTAPE_TRACKS);
  const targetPrivate = $derived(target ? Math.max(0, target.storedTrackCount - target.trackIds.length) : 0);
  const sourcePrivate = $derived(source ? Math.max(0, (source.storedTrackCount ?? source.trackIds.length) - source.trackIds.length) : 0);
  const pairKey = $derived(source && target ? `${source.id}→${target.id}` : '');
  const fingerprint = $derived(target && source ? `${target.revision}:${target.storedTrackCount}:${source.trackIds.join(',')}` : '');
  const needsReview = $derived(Boolean(rejected && rejected.key === pairKey && rejected.fingerprint === fingerprint));
  const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

  const outcome = $derived.by(() => {
    if (!target || !preview || !source) return null;
    const added = preview.added.length;
    const head =
      added === 0
        ? `Every song is already in "${target.title}", so nothing new is added.`
        : `${songs(added)} will be added to the end of "${target.title}".`;
    const already = preview.already > 0 && added > 0 ? ` ${preview.already} ${preview.already === 1 ? 'is' : 'are'} already there.` : '';
    return `${head}${already} Then "${source.title}" is removed and its link opens "${target.title}".`;
  });

  const title = $derived(target ? `Merge into "${target.title}"?` : 'Merge into another mixtape');

  async function handleMerge() {
    if (!source || !target || tooMany || submitting || needsReview || refreshing) return;
    submitting = true;
    error = null;
    try {
      await mergeMixtapes(
        { id: source.id, title: source.title },
        { id: target.id, title: target.title },
        { navigateTo: navigateToTarget ? `/mixtapes/${encodeURIComponent(target.id)}` : undefined }
      );
      onClose();
    } catch (err) {
      error = err instanceof MixtapeActionError ? err.message : 'Couldn’t merge right now. Please try again.';
      const stale =
        err instanceof MixtapeActionError &&
        ['too_many_tracks', 'revision_conflict', 'not_found', 'merged'].includes(err.kind);
      if (stale && source && target) {
        // Freeze this preview, then show the server's current state before any retry.
        rejected = { key: pairKey, fingerprint };
        refreshing = true;
        try {
          await loadMyMixtapes({ force: true });
        } finally {
          refreshing = false;
        }
        if (!targets.some((item) => item.id === target.id)) selectedId = null;
      }
    } finally {
      submitting = false;
    }
  }

  async function handleReviewInEditor() {
    if (!source || !target) return;
    reviewing = true;
    try {
      const started = await reviewMergeInEditor({ id: source.id, title: source.title }, target.id);
      if (started) onClose();
    } finally {
      reviewing = false;
    }
  }
</script>

<Sheet {open} {title} maxWidth="md" dismissible={!submitting} {onClose}>
  {#if source}
    <div class="flex flex-col gap-4" data-mixtape-merge>
      {#if targets.length === 0}
        <p class="text-sm leading-relaxed text-ink-2">
          You need another mixtape to merge into. Make one first, then come back.
        </p>
      {:else}
        {#if !initialTargetId || targets.length > 1}
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-2 text-sm font-medium text-ink-2">Merge "{source.title}" into</legend>
            <div class="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
              {#each targets as item (item.id)}
                <label
                  class={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 ring-1 ring-inset ${
                    selectedId === item.id ? 'bg-accent/10 ring-accent/50' : 'bg-surface-1 ring-line hover:bg-surface-2'
                  }`}
                >
                  <input type="radio" name="merge-target" value={item.id} bind:group={selectedId} class="accent-[var(--color-accent)]" />
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">{item.title}</span>
                  <span class="tabular shrink-0 text-xs text-ink-2">{songs(item.trackCount)}</span>
                </label>
              {/each}
            </div>
          </fieldset>
        {/if}

        {#if target && preview}
          <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5">
            <div class="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] bg-surface-1 p-2.5 ring-1 ring-inset ring-line">
              <div class="w-11 shrink-0"><MixtapeCollage coverUrls={source.coverUrls} alt="" /></div>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-ink-1">This mixtape</p>
                <p class="tabular text-xs text-ink-2">{songs(source.trackIds.length)}</p>
              </div>
            </div>
            <Icon name="chevron-right" size={18} class="text-ink-3" />
            <div class="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] bg-surface-1 p-2.5 ring-1 ring-inset ring-line">
              <div class="w-11 shrink-0"><MixtapeCollage coverUrls={target.coverUrls} alt="" /></div>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-ink-1">{target.title}</p>
                <p class="tabular text-xs text-ink-2" data-merge-total>
                  {before} → {total} songs
                </p>
              </div>
            </div>
          </div>

          <p class="text-sm leading-relaxed text-ink-1" data-merge-outcome>{outcome}</p>

          {#if targetPrivate > 0 || sourcePrivate > 0}
            <p class="text-xs leading-relaxed text-ink-2" data-merge-private>
              {#if targetPrivate > 0}
                "{target.title}" also keeps {targetPrivate} {targetPrivate === 1 ? 'song that isn’t' : 'songs that aren’t'} public right now (counted above).
              {/if}
              {#if sourcePrivate > 0}
                {sourcePrivate} {sourcePrivate === 1 ? 'song in this mixtape isn’t' : 'songs in this mixtape aren’t'} public right now; merging needs {sourcePrivate === 1 ? 'it' : 'them'} public or already in "{target.title}".
              {/if}
            </p>
          {/if}

          {#if tooMany}
            <p role="alert" class="rounded-[var(--radius-control)] bg-warning/15 px-3 py-2.5 text-sm leading-relaxed text-ink-1 ring-1 ring-inset ring-warning/30">
              "{target.title}" can hold {MAX_MIXTAPE_TRACKS} songs. {total - MAX_MIXTAPE_TRACKS}
              {total - MAX_MIXTAPE_TRACKS === 1 ? 'song won’t' : 'songs won’t'} fit — review in the editor to choose which songs to keep.
            </p>
          {/if}
        {/if}

        <p class="flex gap-2 text-xs leading-relaxed text-ink-2">
          <Icon name="info" size={16} class="mt-px text-ink-2" />
          <span>{MERGE_REASSURANCE}</span>
        </p>

        {#if error}
          <div role="alert" class="rounded-[var(--radius-control)] bg-danger/15 px-3 py-2.5 text-sm leading-relaxed text-danger ring-1 ring-inset ring-danger/35">
            <p>{error}</p>
            {#if refreshing}
              <p class="mt-1 text-xs text-ink-2">Refreshing your mixtapes…</p>
            {:else if needsReview}
              <p class="mt-1 text-xs text-ink-2" data-merge-needs-review>
                These counts are the latest we have. Review the songs in the editor first, or pick another mixtape.
              </p>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <div class="flex flex-wrap items-center justify-end gap-2">
      <Button variant="ghost" disabled={submitting} onclick={onClose}>Cancel</Button>
      <Button
        variant="secondary"
        loading={reviewing}
        disabled={!target || submitting || reviewing}
        onclick={() => void handleReviewInEditor()}
      >
        Review in editor first
      </Button>
      <Button
        variant="primary"
        loading={submitting}
        disabled={!target || tooMany || submitting || refreshing || needsReview}
        onclick={() => void handleMerge()}
      >
        {submitting ? 'Merging…' : 'Merge & delete copy'}
      </Button>
    </div>
  {/snippet}
</Sheet>
