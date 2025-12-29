<script lang="ts">
    import type { Smol } from "../../types/domain";
    import { audioState } from "../../stores/audio.svelte";
    import RadioPlayer from "./RadioPlayer.svelte";
    import { isAuthenticated } from "../../stores/user.svelte";

    let {
        playlist = [],
        stationName,
        stationDescription,
        currentIndex,
        isSavingMixtape,
        onNext,
        onPrev,
        onSelect,
        onSaveMixtape,
    }: {
        playlist: Smol[];
        stationName: string;
        stationDescription: string;
        currentIndex: number;
        isSavingMixtape: boolean;
        onNext: () => void;
        onPrev: () => void;
        onSelect: (index: number) => void;
        onSaveMixtape: () => void;
    } = $props();

    const API_URL = import.meta.env.PUBLIC_API_URL;
</script>

<div
    class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono"
>
    <div
        class="reactive-glass p-6 border border-white/5 bg-[#1d1d1d]"
        onmousemove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty(
                "--mouse-x",
                `${e.clientX - rect.left}px`,
            );
            e.currentTarget.style.setProperty(
                "--mouse-y",
                `${e.clientY - rect.top}px`,
            );
        }}
    >
        <div
            class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6"
        >
            <div class="flex-1">
                <h2
                    class="text-2xl font-bold text-white tracking-widest uppercase"
                >
                    {stationName}
                </h2>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                    <!-- Tagline removed -->
                </div>
            </div>

            {#if isAuthenticated()}
                <button
                    onclick={onSaveMixtape}
                    disabled={isSavingMixtape}
                    class="tech-button px-6 py-2 text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50 whitespace-nowrap uppercase tracking-wider border border-white/10 hover:border-purple-500/50"
                >
                    {#if isSavingMixtape}
                        <span class="animate-spin">⏳</span> SAVING...
                    {:else}
                        <span>💾</span> SAVE MIXTAPE
                    {/if}
                </button>
            {/if}
        </div>

        <RadioPlayer {playlist} {onNext} {onPrev} />

        <div class="h-px bg-white/5 my-8"></div>

        <div class="bg-black/20 rounded border border-white/5 overflow-hidden">
            <ul
                class="divide-y divide-white/5 max-h-96 overflow-y-auto dark-scrollbar"
            >
                {#each playlist as song, index}
                    <li>
                        <button
                            class="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors text-left {index ===
                            currentIndex
                                ? 'bg-purple-500/10'
                                : ''}"
                            onclick={() => onSelect(index)}
                        >
                            <span class="text-slate-500 w-6 text-right text-sm"
                                >{index + 1}</span
                            >
                            <div
                                class="relative w-10 h-10 rounded bg-slate-800 flex-shrink-0 overflow-hidden group"
                            >
                                <img
                                    src="{API_URL}/image/{song.Id}.png"
                                    alt="Art"
                                    class="w-full h-full object-cover"
                                    onerror={(e) => {
                                        e.currentTarget.style.display = "none";
                                    }}
                                />
                                {#if index === currentIndex && audioState.playingId === song.Id}
                                    <div
                                        class="absolute inset-0 bg-black/50 flex items-center justify-center"
                                    >
                                        <span
                                            class="text-purple-400 text-xs animate-pulse"
                                            >▶</span
                                        >
                                    </div>
                                {/if}
                            </div>
                            <div
                                class="overflow-hidden text-left flex-1 min-w-0"
                            >
                                <div
                                    class="text-sm font-medium text-slate-200 truncate {index ===
                                    currentIndex
                                        ? 'text-purple-300'
                                        : ''}"
                                >
                                    {song.Title || "Untitled"}
                                </div>
                                <div class="text-xs text-slate-500 truncate">
                                    {song.Address || "Unknown Artist"}
                                </div>
                            </div>
                            <!-- Song Page Link -->
                            <a
                                href="/song/{song.Id}"
                                class="p-2 text-slate-500 hover:text-white transition-colors"
                                title="View Song Details"
                                onclick={(e) => e.stopPropagation()}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-5 h-5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                    />
                                </svg>
                            </a>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    </div>
</div>
