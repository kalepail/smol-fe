<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { get } from "svelte/store";
    import { dndzone, type DndEvent, SHADOW_PLACEHOLDER_ITEM_ID } from "svelte-dnd-action";
    import { exitMixtapeMode, mixtapeDraft, mixtapeDraftHasContent, mixtapeMode, type MixtapeTrack } from "../../store/mixtape";
    import MixtapeTrackListItem from "./MixtapeTrackListItem.svelte";
    import { publishMixtape } from "../../utils/api/mixtapes";

    type DragPayload = {
        type: "smol";
        track: MixtapeTrack;
    };

    let publishing = false;
    let statusMessage: string | null = null;
    let statusTone: "info" | "success" | "error" = "info";
    let isDraggingTracks = false;
    let tracksForDnd: MixtapeTrack[] = [];
    const flipDurationMs = 150;
    let isExternalDragActive = false;
    let tracksListEl: HTMLUListElement | null = null;
    let modalEl: HTMLDivElement | null = null;

    function resetStatus() {
        statusMessage = null;
    }

    function showStatus(message: string, tone: typeof statusTone) {
        statusMessage = message;
        statusTone = tone;
    }

    function handleMove(index: number, direction: "up" | "down") {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        mixtapeDraft.moveTrack(index, targetIndex);
    }

    function handleRemove(index: number) {
        const track = $mixtapeDraft.tracks[index];
        if (!track) return;
        mixtapeDraft.removeTrack(track.id);
    }

    function handleClose() {
        resetStatus();
        exitMixtapeMode();
    }

    function handleDiscard() {
        if (!$mixtapeDraftHasContent) {
            mixtapeDraft.clear();
            exitMixtapeMode();
            return;
        }

        const confirmed = confirm("Discard current mixtape draft?");
        if (!confirmed) return;

        mixtapeDraft.clear();
        exitMixtapeMode();
    }

    function handleSaveDraft() {
        mixtapeDraft.touch();
        showStatus("Draft saved locally.", "success");
        exitMixtapeMode();
    }

    async function handlePublish() {
        resetStatus();

        if ($mixtapeDraft.tracks.length === 0) {
            showStatus("Add at least one Smol before publishing.", "error");
            return;
        }

        publishing = true;

        try {
            const published = await publishMixtape($mixtapeDraft);
            mixtapeDraft.clear();
            showStatus("Mixtape published! Redirecting…", "success");

            if (typeof window !== "undefined") {
                setTimeout(() => {
                    exitMixtapeMode();
                    window.location.href = `/mixtapes/${published.id}`;
                }, 400);
            }
        } catch (error) {
            console.error(error);
            showStatus("Failed to publish mixtape. Please try again.", "error");
        } finally {
            publishing = false;
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (!$mixtapeMode.active) return;
        if (event.key === "Escape") {
            event.preventDefault();
            handleClose();
        }
    }

    function handleTrackConsider(event: CustomEvent<DndEvent<MixtapeTrack>>) {
        isDraggingTracks = true;
        tracksForDnd = event.detail.items;
    }

    function handleTrackFinalize(event: CustomEvent<DndEvent<MixtapeTrack>>) {
        isDraggingTracks = false;
        const filtered = event.detail.items.filter((item) => item.id && item.id !== SHADOW_PLACEHOLDER_ITEM_ID);
        mixtapeDraft.setTracks(filtered);
        tracksForDnd = get(mixtapeDraft).tracks;
    }

    function updateBodyPadding() {
        if (typeof document === "undefined" || !modalEl) return;

        const height = modalEl.offsetHeight;
        document.body.style.paddingBottom = `${height + 16}px`;
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

    $: if (typeof document !== "undefined") {
        if ($mixtapeMode.active) {
            document.body.classList.add("mixtape-mode-active");
            // Update padding after a tick to ensure modal is rendered
            setTimeout(updateBodyPadding, 0);
        } else {
            document.body.classList.remove("mixtape-mode-active");
            document.body.style.paddingBottom = "";
        }
    }

    // Update padding when tracks change (modal height may change)
    $: if ($mixtapeMode.active && modalEl) {
        tracksForDnd;
        setTimeout(updateBodyPadding, 0);
    }

    $: if (!isDraggingTracks) {
        tracksForDnd = $mixtapeDraft.tracks;
    }

    function handleExternalDragOver(event: DragEvent) {
        if (isDraggingTracks) return;
        if (!event.dataTransfer || !event.dataTransfer.types.includes("application/json")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        isExternalDragActive = true;

        if (!tracksListEl || tracksForDnd.length === 0) {
            tracksForDnd = [
                {
                    id: SHADOW_PLACEHOLDER_ITEM_ID,
                    title: "",
                    coverUrl: null,
                    creator: null,
                },
            ];
            return;
        }

        const listItems = Array.from(tracksListEl.querySelectorAll<HTMLElement>("[data-mixtape-track-id]"));
        let insertIndex = listItems.length;

        for (let i = 0; i < listItems.length; i += 1) {
            const rect = listItems[i].getBoundingClientRect();
            const midpointY = rect.top + rect.height / 2;
            if (event.clientY < midpointY) {
                insertIndex = i;
                break;
            }
        }

        const tracksWithShadow = tracksForDnd.filter((track) => track.id !== SHADOW_PLACEHOLDER_ITEM_ID);
        tracksWithShadow.splice(insertIndex, 0, {
            id: SHADOW_PLACEHOLDER_ITEM_ID,
            title: "",
            coverUrl: null,
            creator: null,
        });

        tracksForDnd = tracksWithShadow;
    }

    function handleExternalDragLeave(event: DragEvent) {
        if (!event.currentTarget || isDraggingTracks) return;
        const target = event.currentTarget as HTMLElement;
        const related = event.relatedTarget as Node | null;
        if (related && target.contains(related)) return;
        isExternalDragActive = false;
        tracksForDnd = get(mixtapeDraft).tracks;
    }

    function handleExternalDrop(event: DragEvent) {
        if (!event.dataTransfer) return;
        event.preventDefault();
        isExternalDragActive = false;
        const raw = event.dataTransfer.getData("application/json");
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw) as Partial<DragPayload>;
            if (parsed?.type !== "smol" || !parsed.track) return;

            const snapshot = mixtapeDraft.getSnapshot();
            const alreadyAdded = snapshot.tracks.some((track) => track.id === parsed.track?.id);
            if (alreadyAdded) {
                showStatus("That Smol is already in your mixtape.", "info");
                return;
            }

            const normalized: MixtapeTrack = {
                id: parsed.track.id,
                title: parsed.track.title ?? "Untitled Smol",
                coverUrl: parsed.track.coverUrl ?? null,
                creator: parsed.track.creator ?? null,
            };

            if (snapshot.tracks.length === 0 || !tracksListEl) {
                mixtapeDraft.addTrack(normalized);
                showStatus("Smol added to your mixtape.", "success");
                tracksForDnd = get(mixtapeDraft).tracks;
                return;
            }

            const listItems = Array.from(tracksListEl.querySelectorAll<HTMLElement>("[data-mixtape-track-id]"));
            let insertIndex = listItems.length;

            for (let i = 0; i < listItems.length; i += 1) {
                const rect = listItems[i].getBoundingClientRect();
                const midpointY = rect.top + rect.height / 2;
                if (event.clientY < midpointY) {
                    insertIndex = i;
                    break;
                }
            }

            mixtapeDraft.insertTrack(normalized, insertIndex);
            tracksForDnd = get(mixtapeDraft).tracks;
            showStatus("Smol added to your mixtape.", "success");
        } catch (error) {
            console.warn("Failed to parse dragged data", error);
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $mixtapeMode.active}
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
        <div bind:this={modalEl} class="pointer-events-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950/50 backdrop-blur-lg shadow-2xl max-h-[min(85vh,700px)]">
            <div class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-700 px-5 py-4">
                <div>
                    <h2 class="text-lg font-semibold text-lime-300">Mixtape Builder</h2>
                    <p class="text-sm text-slate-400">Collect Smols anywhere on the site to craft your next drop.</p>
                </div>
                <button
                    class="rounded-full px-3 py-1 text-sm text-slate-300 hover:bg-slate-700"
                    on:click={handleClose}
                >Exit</button>
            </div>

            <div class="grid flex-1 min-h-0 gap-5 overflow-hidden px-5 py-4 lg:grid-cols-[1.6fr_1fr]">
                <section
                    class={`flex flex-col gap-3 rounded-xl min-h-0 ${
                        isExternalDragActive ? "border border-lime-400/60 bg-lime-500/5" : ""
                    }`}
                    on:dragover={handleExternalDragOver}
                    on:dragleave={handleExternalDragLeave}
                    on:drop={handleExternalDrop}
                >
                    <header class="flex items-center justify-between text-sm text-slate-300">
                        <span>{$mixtapeDraft.tracks.length} Smol{$mixtapeDraft.tracks.length === 1 ? "" : "s"} selected</span>
                    </header>

                    {#if isExternalDragActive}
                        <div class="rounded border border-dashed border-lime-400/60 bg-lime-500/10 px-3 py-2 text-center text-xs font-medium text-lime-100">
                            Drop to add this Smol to your mixtape
                        </div>
                    {/if}

                    <div class="relative flex-1 min-h-0 h-full overflow-y-auto pr-1">
                        {#if $mixtapeDraft.tracks.length === 0 && (!tracksForDnd.length || (tracksForDnd.length === 1 && tracksForDnd[0].id === SHADOW_PLACEHOLDER_ITEM_ID))}
                            <div class="pointer-events-none rounded border border-dashed border-slate-600 bg-slate-800/50 p-6 text-center text-sm text-slate-400">
                                Browse Smols and use the add button to collect them here.
                            </div>
                        {/if}

                        <ul
                            class="flex flex-col gap-2 rounded-xl border border-transparent"
                            bind:this={tracksListEl}
                            use:dndzone={{
                                items: tracksForDnd,
                                type: "mixtape-tracks",
                                flipDurationMs,
                                dropTargetClasses: ["mixtape-drop-active"],
                            }}
                            on:consider={handleTrackConsider}
                            on:finalize={handleTrackFinalize}
                        >
                            {#each tracksForDnd as track, index (track.id)}
                                <MixtapeTrackListItem
                                    {track}
                                    {index}
                                    total={tracksForDnd.length}
                                    on:move={({ detail }) => handleMove(index, detail.direction)}
                                    on:remove={() => handleRemove(index)}
                                />
                            {/each}
                        </ul>
                    </div>
                </section>

                <aside class="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <label class="flex flex-col gap-2">
                        <span class="text-sm font-medium text-slate-200">Title</span>
                        <input
                            class="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-lime-400 focus:outline-none"
                            placeholder="Give your mixtape a name"
                            value={$mixtapeDraft.title}
                            on:input={(event) => {
                                resetStatus();
                                mixtapeDraft.setTitle(event.currentTarget.value);
                            }}
                        />
                    </label>

                    <label class="flex flex-col gap-2">
                        <span class="text-sm font-medium text-slate-200">Description</span>
                        <textarea
                            class="min-h-[96px] w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-lime-400 focus:outline-none"
                            placeholder="Say something about the vibe, inspiration, or story."
                            value={$mixtapeDraft.description}
                            on:input={(event) => {
                                resetStatus();
                                mixtapeDraft.setDescription(event.currentTarget.value);
                            }}
                        />
                    </label>

                    <div class="flex flex-col gap-2">
                        <span class="text-sm font-semibold text-slate-200">Draft status</span>
                        <p class="text-xs text-slate-400">
                            Drafts are saved locally. Publish to mint a shareable mixtape when the backend is ready.
                        </p>
                        {#if statusMessage}
                            <div
                                class={`rounded px-3 py-2 text-sm ${
                                    statusTone === "error"
                                        ? "bg-red-900/60 text-red-200"
                                        : statusTone === "success"
                                        ? "bg-lime-900/50 text-lime-200"
                                        : "bg-slate-800 text-slate-200"
                                }`}
                            >
                                {statusMessage}
                            </div>
                        {/if}
                    </div>

                    <div class="mt-auto flex flex-col gap-2">
                        <button
                            class="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                            on:click={handleDiscard}
                        >Discard Draft</button>

                        <button
                            class="rounded border border-lime-400/60 px-3 py-2 text-sm text-lime-200 hover:bg-lime-500/10"
                            on:click={handleSaveDraft}
                        >Save Draft & Exit</button>

                        <button
                            class="rounded bg-lime-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-300 disabled:opacity-60"
                            on:click={handlePublish}
                            disabled={$mixtapeDraft.tracks.length === 0 || publishing}
                        >
                            {publishing ? "Publishing…" : "Publish Mixtape"}
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.mixtape-drop-active) {
        border-color: rgba(163, 230, 53, 0.45);
        background-color: rgba(101, 163, 13, 0.08);
        transition: border-color 120ms ease, background-color 120ms ease;
    }
</style>
