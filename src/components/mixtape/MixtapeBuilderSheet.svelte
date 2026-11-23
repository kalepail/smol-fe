<script lang="ts">
  import { navigate } from 'astro:transitions/client';
  import {
    mixtapeDraftState,
    mixtapeDraftHasContent,
    mixtapeSheetState,
    closeMixtapeSheet,
    setMixtapeSheetView,
    clearDraft,
    getSnapshotDraft,
    updateTrackVisibility,
  } from '../../stores/mixtape.svelte';
  import { confirmAction } from '../../stores/confirm.svelte';
  import { openAuthSheet } from '../../stores/authSheet.svelte';
  import { toast } from '../../stores/toast.svelte';
  import {
    useMixtapePublishing,
    verifyDraftTrackVisibility,
    MixtapeValidationError,
    type TrackIssueKind,
  } from '../../hooks/useMixtapePublishing';
  import { MixtapePublishError } from '../../services/api/mixtapes';
  import { logger } from '../../utils/logger';
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Icon from '../ui/Icon.svelte';
  import MixtapeBuilder from './builder/MixtapeBuilder.svelte';
  import MixtapePicker from './builder/MixtapePicker.svelte';

  const publishingHook = useMixtapePublishing();

  let publishing = $state(false);
  let statusMessage = $state<string | null>(null);
  let statusTone = $state<'info' | 'success' | 'error'>('info');
  let showAuthAction = $state(false);
  let trackIssues = $state<Record<string, TrackIssueKind>>({});

  const trackCount = $derived(mixtapeDraftState.tracks.length);
  const isPicker = $derived(mixtapeSheetState.view === 'picker');

  const sheetTitle = $derived.by(() => {
    if (isPicker) return 'Add songs';
    const name = mixtapeDraftState.title.trim();
    return name || 'New mixtape';
  });

  const sheetSubtitle = $derived.by(() => {
    const songs = `${trackCount} ${trackCount === 1 ? 'song' : 'songs'}`;
    if (isPicker) {
      return trackCount === 0 ? 'Tap Add to build your mixtape' : `${songs} in draft`;
    }
    return trackCount > 0 ? `${songs} · Saved on this device` : 'Saved on this device';
  });

  function resetStatus() {
    statusMessage = null;
    showAuthAction = false;
    trackIssues = {};
  }

  // Silently hydrate unknown public visibility for any legacy draft tracks when the builder opens.
  $effect(() => {
    if (!mixtapeSheetState.open || isPicker) return;
    const hasUnknown = mixtapeDraftState.tracks.some((t) => t.public === undefined);
    if (!hasUnknown) return;
    void verifyDraftTrackVisibility(getSnapshotDraft(), updateTrackVisibility);
  });

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
    resetStatus();
    publishing = true;

    try {
      const published = await publishingHook.publish(getSnapshotDraft(), updateTrackVisibility);
      if (!published?.id || published.id === 'undefined') {
        throw new MixtapePublishError(
          'Publish did not return a mixtape ID. Your draft is safe — please try again.',
          'invalid_response'
        );
      }

      clearDraft();
      closeMixtapeSheet();
      toast.success('Mixtape published.');
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
      } else {
        statusMessage =
          error instanceof Error ? error.message : 'Failed to publish mixtape. Your draft is safe.';
      }
    } finally {
      publishing = false;
    }
  }
</script>

<Sheet
  open={mixtapeSheetState.open}
  title={sheetTitle}
  subtitle={sheetSubtitle}
  dismissible={!publishing}
  maxWidth={isPicker ? 'lg' : 'xl'}
  onClose={closeMixtapeSheet}
>
  {#snippet headerExtra()}
    {#if isPicker}
      <IconButton label="Back to draft" onclick={() => setMixtapeSheetView('builder')}>
        <Icon name="chevron-left" size={20} />
      </IconButton>
    {/if}
  {/snippet}

  {#if isPicker}
    <MixtapePicker />
  {:else}
    <MixtapeBuilder
      {statusMessage}
      {statusTone}
      {showAuthAction}
      {trackIssues}
      onResetStatus={resetStatus}
      onOpenPicker={() => setMixtapeSheetView('picker')}
      onSignIn={() => {
        closeMixtapeSheet();
        openAuthSheet('signin', 'Sign in again to publish your mixtape draft.');
      }}
    />
  {/if}

  {#snippet footer()}
    {#if isPicker}
      <div class="flex items-center justify-between gap-3">
        <span class="tabular text-xs font-medium text-ink-2">
          {trackCount} {trackCount === 1 ? 'song' : 'songs'} in draft
        </span>
        <Button variant="primary" onclick={() => setMixtapeSheetView('builder')}>
          <Icon name="check" size={16} />
          <span>Done</span>
        </Button>
      </div>
    {:else}
      <div class="flex items-center justify-between gap-2.5">
        <Button variant="ghost" disabled={publishing} onclick={() => void handleDiscard()}>
          Discard
        </Button>

        <Button
          variant={trackCount > 0 ? 'primary' : 'secondary'}
          loading={publishing}
          disabled={trackCount === 0 || publishing}
          onclick={() => void handlePublish()}
          class="min-w-[164px]"
        >
          {#if publishing}
            <span>Publishing…</span>
          {:else if trackCount === 0}
            <span>Add a song to publish</span>
          {:else}
            <span>Publish mixtape ({trackCount})</span>
          {/if}
        </Button>
      </div>
    {/if}
  {/snippet}
</Sheet>
