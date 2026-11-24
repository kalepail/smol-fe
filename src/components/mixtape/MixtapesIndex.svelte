<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import MixtapeCardsGrid from './MixtapeCardsGrid.svelte';
  import MixtapeCard from './MixtapeCard.svelte';
  import MixtapeMergeSheet, { type MergeSource } from './MixtapeMergeSheet.svelte';
  import type { OwnerMenuItem } from './MixtapeOwnerMenu.svelte';
  import Skeleton from '../ui/Skeleton.svelte';
  import StateFeedback from '../ui/StateFeedback.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import '../ui/ownerIcons';
  import { userState } from '../../stores/user.svelte';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import { toast } from '../../stores/toast.svelte';
  import {
    openMixtapeSheet,
    mixtapeDraftState,
    mixtapeDraftHasContent,
    mixtapeEditState,
  } from '../../stores/mixtape.svelte';
  import {
    loadMyMixtapes,
    mixtapeChangeSignal,
    myMixtapesFocus,
    myMixtapesState,
    seedMyMixtapes,
  } from '../../stores/myMixtapes.svelte';
  import { listMixtapes, type MixtapeSummary, type OwnedMixtape } from '../../services/api/mixtapes';
  import { deleteMixtapeWithUndo, openMixtapeEditor } from '../../services/mixtapeActions';
  import { isMatchReason } from '../../utils/mixtapeCoaching';
  import { createLatestGate } from '../../utils/latestRequest';
  import { logger } from '../../utils/logger';

  type View = 'all' | 'yours';

  interface Props {
    initialMixtapes?: MixtapeSummary[] | null;
    initialView?: View;
    /** SSR seed of GET /mixtapes/mine (view=yours with a session cookie). */
    initialMine?: OwnedMixtape[] | null;
    initialMineOwner?: string | null;
  }

  let { initialMixtapes = null, initialView = 'all', initialMine = null, initialMineOwner = null }: Props = $props();

  let mixtapes = $state<MixtapeSummary[]>(initialMixtapes ?? []);
  let loading = $state(initialMixtapes === null && initialView === 'all');
  let error = $state<string | null>(null);
  let view = $state<View>(initialView);

  // Before the shell syncs `userState` from the cookie, trust the SSR session subject so the
  // All | Yours chips render server-side (no flash); afterwards follow the live user state.
  let shellSynced = $state(false);
  $effect(() => {
    if (userState.contractId) shellSynced = true;
  });
  const sessionOwner = $derived(userState.contractId ?? (shellSynced ? null : initialMineOwner));
  const signedIn = $derived(Boolean(sessionOwner));

  // Device-local state (drafts in localStorage) only after mount, so SSR and hydration render the same tree.
  let mounted = $state(false);
  const draftCount = $derived(mounted ? mixtapeDraftState.tracks.length : 0);
  const hasDraft = $derived(mounted && mixtapeDraftHasContent.current);
  const editSession = $derived(mounted ? mixtapeEditState.session : null);

  // Seed the owner store synchronously on the CLIENT (25d P2-6). Never on the server: module
  // state is shared across SSR requests, so SSR renders straight from the `initialMine` prop.
  if (typeof window !== 'undefined' && initialMine && initialMineOwner) {
    seedMyMixtapes(initialMine, initialMineOwner);
  }

  const storeReady = $derived(
    Boolean(sessionOwner) && myMixtapesState.status === 'ready' && myMixtapesState.owner === sessionOwner
  );
  const ssrMine = $derived(initialMine && initialMineOwner && sessionOwner === initialMineOwner ? initialMine : null);
  const mineReady = $derived(storeReady || ssrMine !== null);
  const mine = $derived(storeReady ? myMixtapesState.items : (ssrMine ?? []));
  const listed = $derived(mine.filter((item) => item.visibility !== 'owner'));
  const hidden = $derived(mine.filter((item) => item.visibility === 'owner'));
  const hiddenCount = $derived(hidden.length);

  let mergeSource = $state<MergeSource | null>(null);
  let mergeTargetId = $state<string | null>(null);

  // Strictly monotonic All reads (25d pass 2 P2-3): an older response (e.g. the refresh after a
  // delete, finishing after the one after its Undo) can never reinstate stale cards.
  const allReads = createLatestGate();

  async function loadMixtapes() {
    const run = allReads.begin();
    loading = true;
    error = null;
    try {
      const list = await listMixtapes();
      if (allReads.isCurrent(run)) mixtapes = list;
    } catch (err) {
      if (allReads.isCurrent(run)) error = err instanceof Error ? err.message : 'Could not load mixtapes.';
    } finally {
      if (allReads.isCurrent(run)) loading = false;
    }
  }

  /** Quiet refetch of the public list after any owner write (25d P2-5). */
  async function refreshAll() {
    const run = allReads.begin();
    try {
      const list = await listMixtapes({ fresh: true });
      if (!allReads.isCurrent(run)) return;
      mixtapes = list;
      error = null;
      loading = false;
    } catch (err) {
      // 25d pass 3 P2-4: the NEWEST read is terminal — never leave All on placeholders. Keep cards
      // we already show; with nothing to show, surface the error with Retry.
      if (!allReads.isCurrent(run)) return;
      loading = false;
      if (mixtapes.length === 0) error = 'Couldn’t load mixtapes right now. Check your connection and try again.';
      else logger.warn('mixtape', 'All refresh failed; keeping the current list', err);
    }
  }

  let seenChange = mixtapeChangeSignal.version;
  $effect(() => {
    const version = mixtapeChangeSignal.version;
    if (version === seenChange) return;
    seenChange = version;
    if (view === 'all') untrack(() => void refreshAll());
  });

  // After Undo, put focus on the restored card once it is back in the list (Report 24 §7).
  $effect(() => {
    const id = myMixtapesFocus.id;
    if (!id || view !== 'yours' || !mine.some((item) => item.id === id)) return;
    untrack(() => {
      void tick().then(() => {
        const link = document.querySelector<HTMLAnchorElement>(`[data-mixtape-card="${CSS.escape(id)}"] a`);
        if (!link) return;
        link.focus();
        link.scrollIntoView({ block: 'nearest' });
        myMixtapesFocus.id = null;
      });
    });
  });

  onMount(() => {
    mounted = true;
    const owner = userState.contractId ?? initialMineOwner;
    if (view === 'yours') {
      if (!owner) {
        // Signed out: fall back to the public view and offer sign-in.
        view = 'all';
        history.replaceState(history.state, '', '/mixtapes');
        openAuthSheet('signin', 'Sign in to see your mixtapes.');
      }
    }
    if (view === 'all' && initialMixtapes === null) void loadMixtapes();
  });

  // Owner list: load for the Yours view, and quietly for the amber "hidden" dot.
  $effect(() => {
    if (userState.contractId) void loadMyMixtapes();
  });

  function ownerMenu(item: OwnedMixtape): OwnerMenuItem[] {
    const others = mine.filter((other) => other.id !== item.id);
    const isCopy = item.hiddenReason === 'duplicate' || item.hiddenReason === 'superseded';
    const matchTarget =
      item.visibility === 'owner' && isMatchReason(item.hiddenReason) && item.relatedMixtapeId
        ? others.find((other) => other.id === item.relatedMixtapeId)
        : undefined;
    const items: OwnerMenuItem[] = [
      { label: 'Edit', icon: 'pencil', onSelect: () => void openMixtapeEditor(item.id) },
    ];
    if (others.length > 0) {
      items.push({
        label: matchTarget ? `Merge into "${matchTarget.title}"` : 'Merge into another mixtape',
        icon: 'merge',
        onSelect: () => {
          mergeTargetId = matchTarget?.id ?? null;
          mergeSource = {
            id: item.id,
            title: item.title,
            trackIds: item.trackIds,
            coverUrls: item.coverUrls,
            storedTrackCount: item.storedTrackCount,
          };
        },
      });
    }
    if (item.visibility !== 'owner') {
      items.push({ label: 'Copy link', icon: 'copy', onSelect: () => void copyLink(item) });
    }
    items.push({
      label: isCopy ? 'Delete this copy' : 'Delete mixtape',
      icon: 'trash',
      tone: 'danger',
      onSelect: () => void deleteMixtapeWithUndo({ id: item.id, title: item.title, hiddenReason: item.hiddenReason }),
    });
    return items;
  }

  async function copyLink(item: OwnedMixtape) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/mixtapes/${item.id}`);
      toast.success('Link copied.', { tag: 'mixtape-lifecycle' });
    } catch {
      toast.error('Couldn’t copy the link.', { tag: 'mixtape-lifecycle' });
    }
  }
</script>

<section class="app-container py-5 sm:py-6 space-y-6">
  <header class="flex flex-col gap-3.5">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">Mixtapes</h1>
      {#if userState.contractId}
        <div class="lg:hidden">
          <Button variant="secondary" size="sm" class="min-h-11" onclick={() => openMixtapeSheet('builder')}>
            <Icon name="plus" size={16} />
            <span>
              {#if editSession}
                Continue editing
              {:else if draftCount > 0}
                Open draft ({draftCount})
              {:else if hasDraft}
                Open draft
              {:else}
                New mixtape
              {/if}
            </span>
          </Button>
        </div>
      {:else}
        <Button
          variant="secondary"
          size="sm"
          class="min-h-11"
          onclick={() => openAuthSheet('signin', 'Sign in to create and publish mixtapes.')}
        >
          <Icon name="plus" size={16} />
          <span>Make a mixtape</span>
        </Button>
      {/if}
    </div>

    {#if signedIn}
      <nav aria-label="Mixtape views" class="flex items-center gap-2">
        {#each [{ id: 'all', label: 'All', href: '/mixtapes' }, { id: 'yours', label: 'Yours', href: '/mixtapes?view=yours' }] as chip (chip.id)}
          {@const selected = view === chip.id}
          <a
            href={chip.href}
            aria-current={selected ? 'page' : undefined}
            class={`focus-ring relative inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap ${
              selected ? 'bg-ink-1 text-canvas' : 'bg-surface-2 text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-3 hover:text-ink-1'
            }`}
          >
            <span>{chip.label}</span>
            {#if chip.id === 'yours' && mineReady && mine.length > 0}
              <span class="tabular text-xs opacity-75">{mine.length}</span>
            {/if}
            {#if chip.id === 'yours' && hiddenCount > 0}
              <span class="size-2 rounded-full bg-warning" aria-hidden="true"></span>
              <span class="sr-only">({hiddenCount} hidden)</span>
            {/if}
          </a>
        {/each}
      </nav>
    {/if}
  </header>

  {#if view === 'all'}
    {#if loading}
      <Skeleton variant="card" count={8} />
    {:else if error}
      <StateFeedback
        kind="error"
        title="Could not load mixtapes"
        message={error}
        actionLabel="Try again"
        onAction={() => void loadMixtapes()}
      />
    {:else}
      <MixtapeCardsGrid {mixtapes} />
    {/if}
  {:else if !mineReady && (myMixtapesState.status === 'loading' || myMixtapesState.status === 'idle')}
    <Skeleton variant="card" count={4} />
  {:else if !mineReady}
    <StateFeedback
      kind="error"
      title="Couldn’t load your mixtapes"
      message={myMixtapesState.error ?? 'Check your connection and try again.'}
      actionLabel="Try again"
      onAction={() => void loadMyMixtapes({ force: true })}
    />
  {:else if mine.length === 0 && !hasDraft && !editSession}
    <StateFeedback
      kind="empty"
      icon="mixtapes"
      title="You haven’t made a mixtape yet"
      message="Collect your favorite SMOL songs into a playlist anyone can play."
      actionLabel="Start a mixtape"
      onAction={() => openMixtapeSheet('builder')}
    />
  {:else}
    <div class="space-y-9">
      {#if editSession || hasDraft || listed.length > 0}
        <section aria-labelledby="mixtapes-listed-heading" class="space-y-3.5">
          <div class="space-y-0.5">
            <h2 id="mixtapes-listed-heading" class="text-lg font-semibold text-ink-1">
              Listed <span class="tabular text-ink-3">({listed.length})</span>
            </h2>
            <p class="text-sm text-ink-2">On the Mixtapes page. Anyone can find and play these.</p>
          </div>
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {#if editSession || hasDraft}
              <button
                type="button"
                onclick={() => openMixtapeSheet('builder')}
                class="focus-ring flex aspect-square min-w-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-media)] border-2 border-dashed border-line-strong bg-surface-1/60 p-3 text-center hover:bg-surface-2"
              >
                <span class="flex size-11 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Icon name={editSession ? 'pencil' : 'plus'} size={20} />
                </span>
                <span class="max-w-full truncate text-sm font-medium text-ink-1">
                  {editSession ? `Editing "${editSession.title.trim() || 'Untitled mixtape'}"` : 'Your draft'}
                </span>
                <span class="tabular text-xs text-ink-2">
                  {(editSession ?? mixtapeDraftState).tracks.length}
                  {(editSession ?? mixtapeDraftState).tracks.length === 1 ? 'song' : 'songs'} · Continue
                </span>
              </button>
            {/if}
            {#each listed as item (item.id)}
              <MixtapeCard mixtape={item} owned showCreator={false} headingLevel={3} menuItems={ownerMenu(item)} />
            {/each}
          </div>
        </section>
      {/if}

      {#if hidden.length > 0}
        <section aria-labelledby="mixtapes-hidden-heading" class="space-y-3.5">
          <div class="space-y-0.5">
            <h2 id="mixtapes-hidden-heading" class="flex items-center gap-2 text-lg font-semibold text-ink-1">
              <Icon name="eye-off" size={18} class="text-warning" />
              <span>Hidden from the Mixtapes page <span class="tabular text-ink-3">({hidden.length})</span></span>
            </h2>
            <p class="text-sm text-ink-2">Only you can see these. Their links still work — open one to see why.</p>
          </div>
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {#each hidden as item (item.id)}
              <MixtapeCard mixtape={item} owned showCreator={false} headingLevel={3} menuItems={ownerMenu(item)} />
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
</section>

<MixtapeMergeSheet
  open={mergeSource !== null}
  source={mergeSource}
  candidates={mine}
  initialTargetId={mergeTargetId}
  onClose={() => {
    mergeSource = null;
    mergeTargetId = null;
  }}
/>
