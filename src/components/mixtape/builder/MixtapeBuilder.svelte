<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { type DndEvent, SHADOW_PLACEHOLDER_ITEM_ID } from "svelte-dnd-action";
  import type { MixtapeTrack } from "../../../types/domain";
  import {
    mixtapeDraftState,
    mixtapeDraftHasContent,
    exitMixtapeMode,
    setTitle,
    setDescription,
    moveTrack,
    removeTrack,
    clearDraft,
    touchMixtapeDraft,
    setTracks,
    getSnapshotDraft,
  } from "../../../stores/mixtape.svelte.ts";
  import { useMixtapePublishing } from "../../../hooks/useMixtapePublishing";
  import { useMixtapeDragDrop } from "../../../hooks/useMixtapeDragDrop";
  import MixtapeTrackList from "./MixtapeTrackList.svelte";
  import MixtapeForm from "./MixtapeForm.svelte";

  let publishing = $state(false);
  let statusMessage = $state<string | null>(null);
  let statusTone = $state<"info" | "success" | "error">("info");
  let isDraggingTracks = $state(false);
  let tracksForDnd = $state<MixtapeTrack[]>([]);
  let isExternalDragActive = $state(false);
  let tracksListEl = $state<HTMLUListElement | null>(null);
  let modalEl = $state<HTMLDivElement | null>(null);

  const publishingHook = useMixtapePublishing();
  const dragDropHook = useMixtapeDragDrop();

  const isEditing = $derived(
    !!(
      mixtapeDraftState.draftId &&
      !mixtapeDraftState.draftId.startsWith("draft-")
    ),
  );

  function resetStatus() {
    statusMessage = null;
  }

  function showStatus(message: string, tone: typeof statusTone) {
    statusMessage = message;
    statusTone = tone;
  }

  function handleMove(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    moveTrack(index, targetIndex);
  }

  function handleRemove(index: number) {
    const track = mixtapeDraftState.tracks[index];
    if (!track) return;
    removeTrack(track.id);
  }

  function handleDiscard() {
    if (!mixtapeDraftHasContent.current) {
      clearDraft();
      exitMixtapeMode();
      return;
    }

    const confirmed = confirm("Discard current mixtape draft?");
    if (!confirmed) return;

    clearDraft();
    exitMixtapeMode();
  }

  function handleSaveDraft() {
    touchMixtapeDraft();
    showStatus("Draft saved locally.", "success");
    exitMixtapeMode();
  }

  async function handlePublish() {
    resetStatus();

    publishing = true;

    try {
      let publishedId: string;

      if (isEditing && mixtapeDraftState.draftId) {
        const result = await publishingHook.update(
          mixtapeDraftState.draftId,
          getSnapshotDraft(),
        );
        publishedId = result.id;
        showStatus("Mixtape updated! Redirecting…", "success");
      } else {
        const result = await publishingHook.publish(getSnapshotDraft());
        publishedId = result.id;
        showStatus("Mixtape published! Redirecting…", "success");
      }

      clearDraft();

      if (typeof window !== "undefined") {
        setTimeout(() => {
          exitMixtapeMode();
          window.location.href = `/mixtapes/${publishedId}`;
          // showStatus(
          //   "Simulation: Update sent! (Redirect disabled to show order)",
          //   "success",
          // );
        }, 400);
      }
    } catch (error) {
      console.error(error);
      showStatus(
        error instanceof Error
          ? error.message
          : "Failed to publish mixtape. Please try again.",
        "error",
      );
    } finally {
      publishing = false;
    }
  }

  function handleTrackConsider(event: CustomEvent<DndEvent<MixtapeTrack>>) {
    isDraggingTracks = true;
    tracksForDnd = event.detail.items;
  }

  function handleTrackFinalize(event: CustomEvent<DndEvent<MixtapeTrack>>) {
    isDraggingTracks = false;
    const filtered = event.detail.items.filter(
      (item) => item.id && item.id !== SHADOW_PLACEHOLDER_ITEM_ID,
    );
    setTracks(filtered);
    tracksForDnd = getSnapshotDraft().tracks;
  }

  let paddingUpdateScheduled = false;

  function updateBodyPadding() {
    if (typeof document === "undefined" || !modalEl) return;
    if (paddingUpdateScheduled) return;

    paddingUpdateScheduled = true;
    requestAnimationFrame(() => {
      if (!modalEl) {
        paddingUpdateScheduled = false;
        return;
      }
      const height = modalEl.offsetHeight;
      document.body.style.paddingBottom = `${height + 16}px`;
      paddingUpdateScheduled = false;
    });
  }

  function handleExternalDragOver(event: DragEvent) {
    const shouldShowShadow = dragDropHook.handleExternalDragOver(
      event,
      isDraggingTracks,
      tracksForDnd,
      tracksListEl,
      (tracks) => {
        tracksForDnd = tracks;
      },
    );
    if (shouldShowShadow) {
      isExternalDragActive = true;
    }
  }

  function handleExternalDragLeave(event: DragEvent) {
    dragDropHook.handleExternalDragLeave(
      event,
      isDraggingTracks,
      getSnapshotDraft().tracks,
      (tracks) => {
        isExternalDragActive = false;
        tracksForDnd = tracks;
      },
    );
  }

  function handleExternalDrop(event: DragEvent) {
    dragDropHook.handleExternalDrop(
      event,
      mixtapeDraftState.tracks,
      getSnapshotDraft().tracks,
      tracksListEl,
      (tracks) => {
        mixtapeDraftState.tracks = tracks;
        isExternalDragActive = false;
        tracksForDnd = getSnapshotDraft().tracks;
      },
    );
  }

  onMount(() => {
    resetStatus();
  });

  onDestroy(() => {
    if (typeof document !== "undefined") {
      document.body.classList.remove("mixtape-mode-active");
      document.body.style.paddingBottom = "";
    }
  });

  $effect(() => {
    if (typeof document !== "undefined") {
      if (modalEl) {
        document.body.classList.add("mixtape-mode-active");
        setTimeout(updateBodyPadding, 0);
      } else {
        document.body.classList.remove("mixtape-mode-active");
        document.body.style.paddingBottom = "";
      }
    }
  });

  $effect(() => {
    if (modalEl) {
      tracksForDnd;
      setTimeout(updateBodyPadding, 0);
    }
  });

  // Sync tracksForDnd with store when not dragging
  // During drag, tracksForDnd maintains its own state for drag preview
  // This is a valid $effect use case - not simple derivation
  $effect(() => {
    if (!isDraggingTracks) {
      tracksForDnd = mixtapeDraftState.tracks;
    }
  });
</script>

<div
  bind:this={modalEl}
  class="pointer-events-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950/80 backdrop-blur-lg shadow-2xl max-h-[min(85vh,700px)]"
  ondragover={handleExternalDragOver}
  ondragleave={handleExternalDragLeave}
  ondrop={handleExternalDrop}
>
  <div
    class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-700 px-5 py-4"
  >
    <div>
      <h2 class="text-lg font-semibold text-lime-300">Mixtape Builder</h2>
      <p class="text-sm text-slate-400">
        Collect Smols anywhere on the site to craft your next drop.
      </p>
    </div>
    <button
      class="rounded-full px-3 py-1 text-sm text-slate-300 hover:bg-slate-700"
      onclick={exitMixtapeMode}>Exit</button
    >
  </div>

  <div
    class="grid flex-1 min-h-0 gap-5 overflow-hidden px-5 py-4 lg:grid-cols-[1.6fr_1fr]"
  >
    <MixtapeTrackList
      tracks={tracksForDnd}
      isDragging={isDraggingTracks}
      {isExternalDragActive}
      onConsider={handleTrackConsider}
      onFinalize={handleTrackFinalize}
      onMove={handleMove}
      onRemove={handleRemove}
      bindElement={(el) => (tracksListEl = el)}
    />

    <MixtapeForm
      draft={mixtapeDraftState}
      {publishing}
      {isEditing}
      {statusMessage}
      {statusTone}
      onTitleChange={(title) => {
        resetStatus();
        setTitle(title);
      }}
      onDescriptionChange={(desc) => {
        resetStatus();
        setDescription(desc);
      }}
      onDiscard={handleDiscard}
      onSaveDraft={handleSaveDraft}
      onPublish={handlePublish}
    />
  </div>
</div>
