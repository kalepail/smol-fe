<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { MixtapeTrack, Smol } from '../../../types/domain';
  import type { TrackIssueKind } from '../../../hooks/useMixtapePublishing';
  import { fetchWithTimeout } from '../../../services/api/fetch';
  import { mixtapeTrackIds, toggleDraftTrack } from '../../../stores/mixtape.svelte';
  import MixtapeTrackListItem from '../MixtapeTrackListItem.svelte';
  import Button from '../../ui/Button.svelte';
  import CoverArt from '../../ui/CoverArt.svelte';
  import Icon from '../../ui/Icon.svelte';

  interface Props {
    tracks: MixtapeTrack[];
    trackIssues?: Record<string, TrackIssueKind>;
    announcement?: string;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onMove: (index: number, direction: 'up' | 'down') => void;
    onRemove: (index: number) => void;
    onOpenPicker: () => void;
  }

  let {
    tracks,
    trackIssues = {},
    announcement = '',
    onReorder,
    onMove,
    onRemove,
    onOpenPicker,
  }: Props = $props();

  let suggestions = $state<Smol[]>([]);
  let listEl = $state<HTMLUListElement | null>(null);
  let draggingTrackId = $state<string | null>(null);
  let activePointerId: number | null = null;

  function stopDragListeners() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerEnd);
    window.removeEventListener('pointercancel', handlePointerEnd);
    activePointerId = null;
    draggingTrackId = null;
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId || !draggingTrackId || !listEl) return;
    const currentIndex = tracks.findIndex((t) => t.id === draggingTrackId);
    if (currentIndex === -1) return;

    const rows = Array.from(listEl.querySelectorAll<HTMLLIElement>('[data-mixtape-track-id]'));
    if (rows.length < 2) return;

    let targetIndex = currentIndex;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (event.clientY < midpoint) {
        targetIndex = i;
        break;
      }
      targetIndex = i;
    }

    if (targetIndex !== currentIndex) {
      onReorder(currentIndex, targetIndex);
    }
  }

  function handlePointerEnd(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    stopDragListeners();
  }

  function startHandleDrag(event: PointerEvent, trackId: string) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    stopDragListeners();

    draggingTrackId = trackId;
    activePointerId = event.pointerId;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      stopDragListeners();
    }
  });

  onMount(() => {
    const apiUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '');
    if (!apiUrl) return;
    void fetchWithTimeout(`${apiUrl}/?limit=6`, { credentials: 'include', timeout: 8_000 })
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        if (!raw) return;
        const list = Array.isArray(raw) ? (raw as Smol[]) : Array.isArray(raw.smols) ? (raw.smols as Smol[]) : [];
        suggestions = list.filter((s) => s?.Id && s.Public !== 0).slice(0, 4);
      })
      .catch(() => {
        // Optional suggestions; ignore failure.
      });
  });
</script>

<section class="flex min-w-0 flex-col gap-3 rounded-[var(--radius-control)] bg-surface-1 p-3.5 ring-1 ring-inset ring-line">
  <header class="flex min-w-0 items-center justify-between gap-2">
    <span class="tabular text-xs font-medium text-ink-2">
      {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} selected
    </span>
    <Button variant="secondary" size="sm" class="min-h-11" onclick={onOpenPicker}>
      <Icon name="plus" size={16} />
      <span>Add songs</span>
    </Button>
  </header>

  <div role="status" aria-live="polite" class="sr-only">
    {announcement}
  </div>

  {#if tracks.length === 0}
    <div class="flex flex-col gap-4 py-4">
      <div class="text-center">
        <p class="text-sm font-medium text-ink-1">Start your mixtape</p>
        <p class="mt-1 text-xs text-ink-2">
          Search or browse songs right here, or pick from suggestions below.
        </p>
      </div>

      {#if suggestions.length > 0}
        <ul class="flex min-w-0 flex-col gap-2" aria-label="Suggested songs">
          {#each suggestions as smol (smol.Id)}
            {@const inDraft = mixtapeTrackIds.current.has(smol.Id)}
            <li class="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] bg-surface-2 p-2 ring-1 ring-inset ring-line">
              <CoverArt id={smol.Id} alt="" scale={4} class="size-10 shrink-0" />
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">
                {smol.Title || 'Untitled Smol'}
              </span>
              <button
                type="button"
                aria-label={inDraft ? `Remove ${smol.Title || 'song'} from mixtape` : `Add ${smol.Title || 'song'} to mixtape`}
                onclick={() => toggleDraftTrack(smol, { silent: true })}
                class="focus-ring inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-surface-1 text-ink-1 ring-1 ring-inset ring-line-strong hover:bg-surface-3"
              >
                <Icon name={inDraft ? 'check' : 'plus'} size={16} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    <ul bind:this={listEl} class="flex min-h-[120px] min-w-0 flex-col gap-2">
      {#each tracks as track, index (track.id)}
        <MixtapeTrackListItem
          {track}
          {index}
          total={tracks.length}
          isDragging={draggingTrackId === track.id}
          issue={trackIssues[track.id]}
          onStartDrag={(event) => startHandleDrag(event, track.id)}
          onMove={(direction) => onMove(index, direction)}
          onRemove={() => onRemove(index)}
        />
      {/each}
    </ul>
  {/if}
</section>
