<script lang="ts">
  import { tick } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import {
    mixtapeDraftState,
    mixtapeDraftHasContent,
    mixtapeActive,
    mixtapeEditState,
    mixtapeEditConflict,
    mixtapeIsDirty,
    mixtapeIsSaving,
    mixtapeSheetState,
    closeMixtapeSheet,
    setMixtapeSheetView,
    clearDraft,
    getSnapshotDraft,
    updateTrackVisibility,
  } from '../../stores/mixtape.svelte';
  import { consumePublishedDraft, setCreatePublishing } from '../../stores/mixtape/editSession.svelte';
  import { confirmAction } from '../../stores/confirm.svelte';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import { toast } from '../../stores/toast.svelte';
  import { userState } from '../../stores/user.svelte';
  import { loadMyMixtapes, myMixtapesState, invalidateMyMixtapes } from '../../stores/myMixtapes.svelte';
  import {
    useMixtapePublishing,
    verifyDraftTrackVisibility,
    MixtapeValidationError,
    type TrackIssueKind,
  } from '../../hooks/useMixtapePublishing';
  import { MixtapeActionError, MixtapePublishError } from '../../services/api/mixtapes';
  import {
    LIFECYCLE_TAG,
    cancelMixtapeEdit,
    deleteMixtapeWithUndo,
    detailToTracks,
    loadLatestEdit,
    openMixtapeEditor,
    saveMineAnyway,
    saveMixtapeEdit,
  } from '../../services/mixtapeActions';
  import { isMatchReason, previewMixtapeChange, type MixtapePreview } from '../../utils/mixtapeCoaching';
  import { normalizeMixtapeText } from '../../utils/mixtapeVisibility';
  import { draftPayloadKey } from '../../stores/mixtape/operations';
  import { logger } from '../../utils/logger';
  import Sheet from '../ui/Sheet.svelte';
  import DockedPanel from '../ui/DockedPanel.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Icon from '../ui/Icon.svelte';
  import MixtapeBuilder from './builder/MixtapeBuilder.svelte';
  import MixtapePicker from './builder/MixtapePicker.svelte';
  import MixtapeCoachingStrip, { type MixtapeCoaching } from './builder/MixtapeCoachingStrip.svelte';

  const publishingHook = useMixtapePublishing();

  let publishing = $state(false);
  let saving = $state(false);
  let switching = $state(false);
  let statusMessage = $state<string | null>(null);
  let statusTone = $state<'info' | 'success' | 'error'>('info');
  let showAuthAction = $state(false);
  let trackIssues = $state<Record<string, TrackIssueKind>>({});
  let titleError = $state<string | null>(null);
  /** Extra action for the status message (create_pending retry / create_conflict review — 25d P2-1). */
  let statusAction = $state<{ label: string; onClick?: () => void; href?: string; disabled?: boolean } | null>(null);
  /**
   * 503 create_pending Retry-After deadlines, one per payload (25d pass 2–4 P2-1). Keyed like the
   * backend's retry identity — NFKC, case-folded, whitespace-collapsed title and description plus
   * the ordered songs — so case/whitespace edits are the same POST. A deadline is NEVER dropped by
   * editing: change the title and change it back and the wait still holds, on every publish path,
   * until it expires on its own.
   */
  function retryPayloadKey(draft: { title: string; description: string; tracks: { id: string }[] }): string {
    return JSON.stringify([
      normalizeMixtapeText(draft.title.trim() || 'Untitled mixtape'),
      normalizeMixtapeText(draft.description),
      draft.tracks.map((track) => track.id),
    ]);
  }
  let retryDeadlines = $state<Record<string, number>>({});
  const retryWait = $derived((retryDeadlines[retryPayloadKey(mixtapeDraftState)] ?? 0) > 0);
  function holdRetry(key: string, waitMs: number) {
    const until = Date.now() + waitMs;
    retryDeadlines[key] = until;
    setTimeout(() => {
      if (retryDeadlines[key] === until) delete retryDeadlines[key];
      if (statusAction?.label === 'Try again' && !retryWait) statusAction = { ...statusAction, disabled: false };
    }, waitMs);
  }
  function retryBlocked(draft: { title: string; description: string; tracks: { id: string }[] }): boolean {
    const until = retryDeadlines[retryPayloadKey(draft)];
    return until !== undefined && until > Date.now();
  }

  // Desktop (lg+) renders a non-modal docked panel; mobile keeps the bottom sheet (25d P2-8).
  let desktop = $state(typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  $effect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => (desktop = query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });

  const session = $derived(mixtapeActive.current);
  const edit = $derived(mixtapeEditState.session);
  const isEditing = $derived(edit !== null);
  const isDirty = $derived(mixtapeIsDirty.current);
  const trackCount = $derived(session.tracks.length);
  const isPicker = $derived(mixtapeSheetState.view === 'picker');
  // The store freezes the edit slot during its PUT (25d P1-3); mirror that in the UI.
  const saveLocked = $derived(mixtapeIsSaving.current);
  const busy = $derived(publishing || saving || switching || saveLocked);
  const mergeFrom = $derived(edit?.mergeFrom ?? null);
  const canSave = $derived(isDirty);
  // Shared with the toast's "Load latest" so both entry points clear it (25d P2-2).
  const conflictActive = $derived(Boolean(edit && mixtapeEditConflict.mixtapeId === edit.mixtapeId));

  // ---------------------------------------------------------------------------
  // Live coaching (shared Tier 1 classifier = the live backend's decision)
  // ---------------------------------------------------------------------------

  const owner = $derived(userState.contractId);
  const mineReady = $derived(Boolean(owner) && myMixtapesState.status === 'ready' && myMixtapesState.owner === owner);
  const publicTrackIds = $derived(session.tracks.filter((track) => track.public !== 0).map((track) => track.id));

  $effect(() => {
    if (mixtapeSheetState.open && owner) void loadMyMixtapes();
  });

  const preview = $derived.by<MixtapePreview | null>(() => {
    if (!owner || publicTrackIds.length === 0) return null;
    const mine = mineReady ? myMixtapesState.items : [];
    const draft = { title: session.title.trim() || 'Untitled mixtape', description: session.description, trackIds: publicTrackIds };
    if (edit) {
      const cohortOwner = edit.creator || owner;
      const rows = mine.some((row) => row.id === edit.mixtapeId)
        ? mine
        : [
            ...mine,
            {
              id: edit.mixtapeId,
              title: edit.baseline.title,
              description: edit.baseline.description,
              creator: cohortOwner,
              createdAt: edit.createdAt || '1970-01-01 00:00:00',
              trackIds: edit.baseline.trackIds,
            },
          ];
      return previewMixtapeChange(rows, cohortOwner, { kind: 'edit', id: edit.mixtapeId, draft });
    }
    return previewMixtapeChange(mine, owner, { kind: 'create', draft });
  });

  const coaching = $derived.by<MixtapeCoaching | null>(() => {
    const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;
    if (!edit) {
      if (!owner) {
        return publicTrackIds.length === 1
          ? { key: 'too_few', tone: 'info', title: 'Add 1 more song to show on the Mixtapes page. You can still publish it as a link.' }
          : null;
      }
      if (!preview) return null;
      const { self, match, newlyHidden } = preview;
      if (match && isMatchReason(self.hiddenReason)) {
        const body =
          self.hiddenReason === 'duplicate'
            ? `You already published these songs, so only "${match.title}" would show on the Mixtapes page.`
            : self.hiddenReason === 'superseded'
              ? `${publicTrackIds.length === 1 ? 'That song is' : `All ${songs(publicTrackIds.length)} are`} already in it. Edit it instead of publishing a second copy?`
              : `Most of these songs are already in it. Add the new ones to "${match.title}" instead?`;
        return {
          key: `match:${match.id}:${self.hiddenReason}`,
          tone: 'warning',
          title: `Heads up: this matches your mixtape "${match.title}".`,
          body,
          action: { label: `Edit "${match.title}" instead`, matchId: match.id },
        };
      }
      const replaced = newlyHidden[0];
      if (self.visibility === 'public' && replaced) {
        return {
          key: `replaces:${replaced.id}`,
          tone: 'warning',
          title: `Heads up: this matches your mixtape "${replaced.title}".`,
          body: `Publishing hides "${replaced.title}" from the Mixtapes page. Update it instead of publishing a second copy?`,
          action: { label: `Edit "${replaced.title}" instead`, matchId: replaced.id },
        };
      }
      if (self.hiddenReason === 'too_few') {
        return { key: 'too_few', tone: 'info', title: 'Add 1 more song to show on the Mixtapes page. You can still publish it as a link.' };
      }
      if (preview.borderline) {
        const peer = preview.borderline;
        return {
          key: `borderline:${peer.id}`,
          tone: 'warning',
          title: `Heads up: this is a lot like your mixtape "${peer.title}".`,
          body:
            peer.trigger === 'same_set_changed'
              ? `It has the same songs. If it’s just another version, only one of them may show on the Mixtapes page.`
              : `If it’s just another version, only one of them may show on the Mixtapes page.`,
          action: { label: `Edit "${peer.title}" instead`, matchId: peer.id },
        };
      }
      return null;
    }

    // Edit mode
    if (!preview) return null;
    const { self, match, newlyHidden } = preview;
    const wasHidden = edit.baselineVisibility === 'owner';
    if (self.visibility === 'public') {
      if (wasHidden) return { key: 'relist', tone: 'success', title: 'Will be listed after you save' };
      if (newlyHidden.length > 0) {
        const names = newlyHidden.map((item) => `"${item.title}"`).join(', ');
        return { key: `hides:${names}`, tone: 'info', title: `${names} will be hidden from the Mixtapes page when you save.` };
      }
      return null;
    }
    if (!wasHidden) {
      return {
        key: `will-hide:${self.hiddenReason}:${match?.id ?? ''}`,
        tone: 'warning',
        title: match
          ? `Heads up: after these changes this matches your mixtape "${match.title}", so it’ll be hidden from the Mixtapes page.`
          : self.hiddenReason === 'too_few'
            ? 'Add 1 more song to show on the Mixtapes page. You can still save it and share the link.'
            : 'After these changes this mixtape will be hidden from the Mixtapes page.',
      };
    }
    return {
      key: `still-hidden:${self.hiddenReason}:${match?.id ?? ''}`,
      tone: 'warning',
      title: 'Hidden from the Mixtapes page',
      body: self.advice,
    };
  });

  const hasMatchCoaching = $derived(!edit && Boolean(coaching?.action));

  const sameTitleHint = $derived.by(() => {
    if (edit || !mineReady || !session.title.trim() || isPicker) return null;
    const name = normalizeMixtapeText(session.title);
    const clash = myMixtapesState.items.find(
      (item) => normalizeMixtapeText(item.title) === name && item.id !== preview?.match?.id
    );
    return clash ? `You already have a mixtape called "${clash.title}". A different name helps people tell them apart.` : null;
  });

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  const sheetTitle = $derived.by(() => {
    if (isPicker) return 'Add songs';
    const name = session.title.trim();
    if (edit) return `Editing · ${name || 'Untitled mixtape'}`;
    return name || 'New mixtape';
  });

  const sheetSubtitle = $derived.by(() => {
    const songs = `${trackCount} ${trackCount === 1 ? 'song' : 'songs'}`;
    if (isPicker) {
      if (edit) return `${songs} in "${session.title.trim() || 'this mixtape'}"`;
      return trackCount === 0 ? 'Tap Add to build your mixtape' : `${songs} in draft`;
    }
    if (edit) {
      const status = edit.baselineVisibility === 'owner' ? 'Hidden from the Mixtapes page' : 'Listed';
      if (mergeFrom) return `${songs} · Adding songs from "${mergeFrom.title}" (it will be kept)`;
      return `${songs} · ${isDirty ? 'Unsaved changes' : status}`;
    }
    return trackCount > 0 ? `${songs} · Saved on this device` : 'Saved on this device';
  });

  function resetStatus() {
    statusMessage = null;
    statusAction = null;
    // The Retry-After deadlines are NOT status text: they survive resets (see retryDeadlines).
    showAuthAction = false;
    trackIssues = {};
    titleError = null;
  }

  // Reset transient UI when the active session switches (create ⇄ edit).
  let lastSessionId = '';
  $effect(() => {
    const id = edit ? `edit:${edit.mixtapeId}` : 'create';
    if (id !== lastSessionId) {
      lastSessionId = id;
      resetStatus();
    }
  });

  // Silently hydrate unknown public visibility for any legacy draft tracks when the builder opens.
  $effect(() => {
    if (!mixtapeSheetState.open || isPicker) return;
    const hasUnknown = session.tracks.some((t) => t.public === undefined);
    if (!hasUnknown) return;
    void verifyDraftTrackVisibility(getSnapshotDraft(), updateTrackVisibility);
  });

  // ---------------------------------------------------------------------------
  // Create mode
  // ---------------------------------------------------------------------------

  async function handleDiscard() {
    if (!mixtapeDraftHasContent.current) {
      clearDraft();
      closeMixtapeSheet();
      return;
    }

    const name = mixtapeDraftState.title.trim() || 'current mixtape draft';
    const confirmed = await confirmAction({
      title: `Discard "${name}"?`,
      message: 'This clears all tracks, title, and description from your local draft.',
      confirmLabel: 'Discard draft',
      destructive: true,
    });
    if (!confirmed) return;

    resetStatus();
    clearDraft();
    closeMixtapeSheet();
    toast.info('Mixtape draft discarded.');
  }


  async function handlePublish() {
    if (retryWait || retryBlocked(mixtapeDraftState)) return;
    resetStatus();
    publishing = true;
    const title = mixtapeDraftState.title.trim() || 'Untitled mixtape';
    const replaced = preview?.self.visibility === 'public' ? preview.newlyHidden[0] : undefined;
    const submitted = getSnapshotDraft();
    // Freeze the create draft everywhere (panel, feed, search, Now Playing) until the POST settles.
    setCreatePublishing(submitted.draftId);

    try {
      let published;
      try {
        published = await publishingHook.publish(submitted, updateTrackVisibility);
      } finally {
        setCreatePublishing(null);
      }
      if (!published?.id || published.id === 'undefined') {
        throw new MixtapePublishError(
          'Publish did not return a mixtape ID. Your draft is safe — please try again.',
          'invalid_response'
        );
      }

      // Only consume the draft if BOTH the durable (cross-tab) copy and this tab's copy are still
      // exactly what was published; a newer draft (e.g. a song added in another tab) is kept.
      if (consumePublishedDraft(submitted) === 'kept') {
        closeMixtapeSheet();
        invalidateMyMixtapes([published.id]);
        toast.info(`Published "${title}". Your draft has newer changes (maybe from another tab), so it was kept.`, {
          tag: LIFECYCLE_TAG,
          duration: 8000,
        });
        await navigate(`/mixtapes/${encodeURIComponent(published.id)}`);
        return;
      }

      closeMixtapeSheet();
      invalidateMyMixtapes([published.id]);
      if (published.deduplicated) {
        toast.info('You already published this mixtape, so we opened it.', { tag: LIFECYCLE_TAG });
      } else if (published.visibility === 'owner') {
        toast.info(`Published "${title}". It’s hidden from the Mixtapes page — open it to see why.`, { tag: LIFECYCLE_TAG });
      } else if (replaced) {
        toast.success(`Published "${title}". "${replaced.title}" is now hidden since they’re so alike.`, {
          tag: LIFECYCLE_TAG,
          actionLabel: 'Review',
          onAction: () => void navigate(`/mixtapes/${encodeURIComponent(replaced.id)}`),
        });
      } else {
        toast.success('Mixtape published.', { tag: LIFECYCLE_TAG });
      }
      await navigate(`/mixtapes/${encodeURIComponent(published.id)}`);
    } catch (error) {
      logger.error('mixtape', error);
      statusTone = 'error';
      if (error instanceof MixtapeValidationError) {
        trackIssues = error.issues;
        statusMessage = error.message;
      } else if (error instanceof MixtapePublishError) {
        showAuthAction = error.kind === 'auth';
        statusMessage = error.message;
        if (error.kind === 'pending') {
          // 503 create_pending: the same publish is still finishing. Offer a retry once Retry-After passes.
          statusTone = 'info';
          statusAction = { label: 'Try again', disabled: true, onClick: () => void handlePublish() };
          holdRetry(retryPayloadKey(submitted), error.retryAfterMs ?? 1000);
        } else if (error.kind === 'conflict' && error.conflictId) {
          // 409 create_conflict with the changed row: let the owner inspect it before re-publishing.
          const conflictId = error.conflictId;
          statusAction = {
            label: 'Review it',
            onClick: () => {
              closeMixtapeSheet();
              void navigate(`/mixtapes/${encodeURIComponent(conflictId)}`);
            },
          };
        }
      } else {
        statusMessage =
          error instanceof Error ? error.message : 'Failed to publish mixtape. Your draft is safe.';
      }
    } finally {
      publishing = false;
    }
  }

  /** "Edit X instead": move the draft's songs into the matching mixtape (edit slot). */
  async function handleEditInstead(matchId: string) {
    // ONE synchronous snapshot, taken before the target's detail GET: the songs moved into the
    // edit AND the identity of the draft they came from (25d pass 5 P1-1). A song added to Create
    // while the GET is in flight makes the durable draft differ, so Save keeps it.
    const draftTracks = mixtapeDraftState.tracks.filter((track) => track.public !== 0).map((track) => ({ ...track }));
    const originDraftKey = draftPayloadKey(mixtapeDraftState);
    switching = true;
    let added = 0;
    try {
      const result = await openMixtapeEditor(matchId, {
        fromDraft: true,
        originDraftKey,
        tracks: (detail) => {
          const matchTracks = detailToTracks(detail);
          const matchIds = new Set(matchTracks.map((track) => track.id));
          const draftIds = new Set(draftTracks.map((track) => track.id));
          const extra = draftTracks.filter((track) => !matchIds.has(track.id));
          added = extra.length;
          // The draft already holds every song of the match: keep the draft's order.
          if (matchTracks.every((track) => draftIds.has(track.id))) return draftTracks;
          return [...matchTracks, ...extra];
        },
      });
      if (result !== 'started') return;
      const name = mixtapeEditState.session?.title.trim() || 'your mixtape';
      toast.info(
        added > 0 ? `Moved your songs into "${name}". Save to update it.` : `Opened "${name}" for editing. Your draft is kept.`,
        { tag: LIFECYCLE_TAG }
      );
      await tick();
      focusBuilderTitle();
    } finally {
      switching = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Edit mode
  // ---------------------------------------------------------------------------

  /** Works for both the mobile <dialog> sheet and the desktop docked <aside> (25d pass 2 P2-5). */
  function focusBuilderTitle() {
    document.querySelector<HTMLInputElement>('[data-mixtape-builder-title]')?.focus();
  }

  function currentPath(): string {
    return typeof window === 'undefined' ? '' : window.location.pathname;
  }

  async function handleSave() {
    resetStatus();
    if (!session.title.trim()) {
      titleError = 'Give your mixtape a name.';
      await tick();
      focusBuilderTitle();
      return;
    }
    saving = true;
    try {
      const outcome = await saveMixtapeEdit();
      handleSaveOutcome(outcome);
    } finally {
      saving = false;
    }
  }

  function handleSaveOutcome(outcome: Awaited<ReturnType<typeof saveMixtapeEdit>>) {
    if (outcome.ok) {
      // A defensive rebase kept newer local changes open: stay in the editor.
      if (outcome.stayOpen) return;
      closeMixtapeSheet();
      // Stay on /mixtapes pages (they refresh); otherwise land on the saved mixtape.
      if (!currentPath().startsWith('/mixtapes')) void navigate(`/mixtapes/${encodeURIComponent(outcome.id)}`);
      return;
    }
    const error = outcome.error;
    if (error instanceof MixtapeActionError && error.kind === 'revision_conflict') return; // banner via store
    if (error instanceof MixtapeActionError && (error.kind === 'not_found' || error.kind === 'merged')) {
      closeMixtapeSheet();
      return;
    }
    statusTone = 'error';
    statusMessage = error.message;
    showAuthAction = error instanceof MixtapeActionError && error.kind === 'auth';
  }

  async function handleLoadLatest() {
    saving = true;
    try {
      await loadLatestEdit();
    } finally {
      saving = false;
    }
  }

  async function handleSaveMine() {
    saving = true;
    try {
      handleSaveOutcome(await saveMineAnyway());
    } finally {
      saving = false;
    }
  }

  async function handleCancelEdit() {
    const fromDraft = edit?.fromDraft === true;
    const cancelled = await cancelMixtapeEdit(isDirty);
    if (!cancelled) return;
    if (!fromDraft) closeMixtapeSheet();
  }

  async function handleDelete() {
    if (!edit) return;
    const id = edit.mixtapeId;
    const onItsPage = currentPath() === `/mixtapes/${id}` || currentPath() === `/mixtapes/${encodeURIComponent(id)}`;
    await deleteMixtapeWithUndo(
      { id, title: edit.baseline.title, hiddenReason: edit.baselineHiddenReason },
      { navigateTo: onItsPage ? '/mixtapes?view=yours' : undefined, onDeleted: closeMixtapeSheet }
    );
  }
</script>

{#snippet backButton()}
  {#if isPicker}
    <IconButton label={isEditing ? 'Back to mixtape' : 'Back to draft'} onclick={() => setMixtapeSheetView('builder')}>
      <Icon name="chevron-left" size={20} />
    </IconButton>
  {/if}
{/snippet}

{#snippet body()}
  <!-- Frozen while the edit's PUT is in flight: nothing can change under the save (25d P1-3). -->
  <div inert={saveLocked} aria-busy={saveLocked ? 'true' : undefined} data-mixtape-builder-body class:opacity-70={saveLocked}>
    {#if isPicker}
      <MixtapePicker />
    {:else}
      <MixtapeBuilder
        {statusMessage}
        {statusTone}
        {statusAction}
        {showAuthAction}
        {trackIssues}
        {titleError}
        {sameTitleHint}
        stacked={desktop}
        onDelete={isEditing ? () => void handleDelete() : undefined}
        onResetStatus={resetStatus}
        onOpenPicker={() => setMixtapeSheetView('picker')}
        onSignIn={() => {
          closeMixtapeSheet();
          openAuthSheet('signin', isEditing ? 'Sign in again to save your changes.' : 'Sign in again to publish your mixtape draft.');
        }}
      />
    {/if}
  </div>
{/snippet}

{#snippet footer()}
  {#if isPicker}
    <div class="flex items-center justify-between gap-3">
      <span class="tabular text-xs font-medium text-ink-2">
        {trackCount} {trackCount === 1 ? 'song' : 'songs'} {isEditing ? 'in mixtape' : 'in draft'}
      </span>
      <Button variant="primary" disabled={saveLocked} onclick={() => setMixtapeSheetView('builder')}>
        <Icon name="check" size={16} />
        <span>Done</span>
      </Button>
    </div>
  {:else}
    {#if conflictActive}
      <div role="alert" data-mixtape-conflict class="mb-3 flex flex-col gap-2.5 rounded-[var(--radius-control)] bg-warning/15 px-3 py-2.5 text-sm ring-1 ring-inset ring-warning/30">
        <p class="flex gap-2.5 font-medium leading-snug text-ink-1">
          <Icon name="warning" size={18} class="mt-0.5 text-warning" />
          <span>"{edit?.baseline.title || session.title}" was changed on another device.</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" class="min-h-11" disabled={busy} onclick={() => void handleLoadLatest()}>
            Load latest
          </Button>
          <Button variant="ghost" size="sm" class="min-h-11" disabled={busy} onclick={() => void handleSaveMine()}>
            Save mine anyway
          </Button>
        </div>
      </div>
    {:else}
      <MixtapeCoachingStrip {coaching} busy={busy} onAction={(id) => void handleEditInstead(id)} />
    {/if}

    {#if isEditing}
      <div class="flex items-center justify-between gap-2.5">
        <Button variant="ghost" disabled={busy} onclick={() => void handleCancelEdit()}>
          Cancel
        </Button>
        <Button
          variant={canSave ? 'primary' : 'secondary'}
          loading={saving || saveLocked}
          disabled={!canSave || busy || trackCount === 0}
          onclick={() => void handleSave()}
          class="min-w-[164px]"
        >
          {#if saving || saveLocked}
            <span>Saving…</span>
          {:else}
            <span>Save changes</span>
          {/if}
        </Button>
      </div>
    {:else}
      <div class="flex items-center justify-between gap-2.5">
        <Button variant="ghost" disabled={busy} onclick={() => void handleDiscard()}>
          Discard
        </Button>

        <Button
          variant={trackCount > 0 ? 'primary' : 'secondary'}
          loading={publishing}
          disabled={trackCount === 0 || busy || retryWait}
          onclick={() => void handlePublish()}
          class="min-w-[164px]"
        >
          {#if publishing}
            <span>Publishing…</span>
          {:else if trackCount === 0}
            <span>Add a song to publish</span>
          {:else if hasMatchCoaching}
            <span>Publish anyway</span>
          {:else}
            <span>Publish mixtape ({trackCount})</span>
          {/if}
        </Button>
      </div>
    {/if}
  {/if}
{/snippet}

{#if desktop}
  <DockedPanel
    open={mixtapeSheetState.open}
    title={sheetTitle}
    subtitle={sheetSubtitle}
    dismissible={!busy}
    onClose={closeMixtapeSheet}
    headerExtra={backButton}
    {footer}
  >
    {@render body()}
  </DockedPanel>
{:else}
  <Sheet
    open={mixtapeSheetState.open}
    title={sheetTitle}
    subtitle={sheetSubtitle}
    dismissible={!busy}
    maxWidth={isPicker ? 'lg' : 'xl'}
    onClose={closeMixtapeSheet}
    headerExtra={backButton}
    {footer}
  >
    {@render body()}
  </Sheet>
{/if}
