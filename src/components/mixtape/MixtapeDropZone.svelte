<script lang="ts">
    import { fade, scale } from "svelte/transition";
    import type { MixtapeTrack } from "../../types/domain";
    import {
        mixtapeModeState,
        mixtapeDraftState,
        enterMixtapeMode,
        addTrack,
    } from "../../stores/mixtape.svelte.ts";
    import { userState } from "../../stores/user.svelte.ts";

    // Track global drag state
    let isDraggingSmol = $state(false);
    let isOverDropZone = $state(false);

    const isAuthenticated = $derived(userState.contractId !== null);
    const trackCount = $derived(mixtapeDraftState.tracks.length);

    function handleDragEnter(event: DragEvent) {
        if (!event.dataTransfer?.types.includes("application/json")) return;
        event.preventDefault();
        isOverDropZone = true;
    }

    function handleDragOver(event: DragEvent) {
        if (!event.dataTransfer?.types.includes("application/json")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave(event: DragEvent) {
        const target = event.currentTarget as HTMLElement;
        const related = event.relatedTarget as Node | null;
        if (related && target.contains(related)) return;
        isOverDropZone = false;
    }

    function handleDrop(event: DragEvent) {
        if (!event.dataTransfer) return;
        event.preventDefault();
        isOverDropZone = false;

        const raw = event.dataTransfer.getData("application/json");
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw) as {
                type?: string;
                track?: MixtapeTrack;
            };
            if (parsed?.type !== "smol" || !parsed.track) return;

            // Check if already added
            const alreadyAdded = mixtapeDraftState.tracks.some(
                (track) => track.id === parsed.track?.id,
            );
            if (alreadyAdded) {
                console.log("[MixtapeDropZone] Track already in mixtape");
                return;
            }

            // Normalize and add
            const normalized: MixtapeTrack = {
                id: parsed.track.id,
                title: parsed.track.title ?? "Untitled Smol",
                coverUrl: parsed.track.coverUrl ?? null,
                creator: parsed.track.creator ?? null,
            };

            // Enter mixtape mode if not active
            if (!mixtapeModeState.active) {
                enterMixtapeMode();
            }

            // Add track
            addTrack(normalized);
            console.log("[MixtapeDropZone] Added track:", normalized.title);
        } catch (error) {
            console.warn("[MixtapeDropZone] Failed to parse dragged data", error);
        }
    }

    // Listen for global drag events to show/hide drop zone
    function handleWindowDragStart(event: DragEvent) {
        if (event.dataTransfer?.types.includes("application/json")) {
            // Small delay to ensure data is set
            setTimeout(() => {
                isDraggingSmol = true;
            }, 50);
        }
    }

    function handleWindowDragEnd() {
        isDraggingSmol = false;
        isOverDropZone = false;
    }
</script>

<svelte:window
    ondragstart={handleWindowDragStart}
    ondragend={handleWindowDragEnd}
/>

{#if isAuthenticated && isDraggingSmol && !mixtapeModeState.active}
    <div
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
        transition:scale={{ duration: 200, start: 0.8 }}
    >
        <div
            class="relative px-6 py-4 rounded-2xl border-2 border-dashed transition-all duration-200
                {isOverDropZone
                ? 'bg-lime-500/30 border-lime-400 scale-105 shadow-[0_0_30px_rgba(154,230,0,0.4)]'
                : 'bg-slate-900/90 border-lime-500/50 backdrop-blur-lg shadow-2xl'}"
            ondragenter={handleDragEnter}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            role="button"
            tabindex="0"
        >
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-lg bg-lime-500/20 flex items-center justify-center"
                >
                    <svg
                        class="w-6 h-6 text-lime-400"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path
                            d="M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5S8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z"
                        />
                    </svg>
                </div>
                <div class="text-left">
                    <p
                        class="text-sm font-semibold {isOverDropZone
                            ? 'text-lime-300'
                            : 'text-white'}"
                    >
                        {isOverDropZone ? "Release to Add!" : "Drop to Add to Mixtape"}
                    </p>
                    <p class="text-xs text-slate-400">
                        {trackCount > 0
                            ? `${trackCount} track${trackCount === 1 ? "" : "s"} in draft`
                            : "Start building your mixtape"}
                    </p>
                </div>
                {#if isOverDropZone}
                    <div
                        class="absolute -top-1 -right-1 w-4 h-4 bg-lime-400 rounded-full animate-ping"
                    ></div>
                {/if}
            </div>
        </div>
    </div>
{/if}
