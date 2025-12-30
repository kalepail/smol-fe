<script lang="ts">
    import type { Smol } from "../../types/domain";
    import { audioState, selectSong } from "../../stores/audio.svelte";
    import RadioPlayer from "../radio/RadioPlayer.svelte";
    import { isAuthenticated } from "../../stores/user.svelte";
    import LikeButton from "../ui/LikeButton.svelte";

    let {
        discography = [],
        minted = [],
        collected = [],
        address,
        publishedCount,
        collectedCount,
        mintedCount,
        topTags = [],
    }: {
        discography: Smol[];
        minted: Smol[];
        collected: Smol[];
        address: string;
        publishedCount: number;
        collectedCount: number;
        mintedCount: number;
        topTags: string[];
    } = $props();

    let activeModule = $state<"discography" | "minted" | "collected">(
        "discography",
    );
    let shuffleEnabled = $state(false);
    let currentIndex = $state(0);

    // Derived playlist based on module and shuffle
    const basePlaylist = $derived.by(() => {
        if (activeModule === "minted") return minted;
        if (activeModule === "collected") return collected;
        return discography;
    });

    let displayPlaylist = $state<Smol[]>([]);

    // Handle shuffle state changes or module changes
    $effect(() => {
        if (shuffleEnabled) {
            displayPlaylist = [...basePlaylist].sort(() => Math.random() - 0.5);
        } else {
            displayPlaylist = [...basePlaylist];
        }
        // When changing module or shuffle, reset index if current song not in new list
        // For simplicity, just reset to 0 for now as requested for "new artist" feel
    });

    // Reset playback on address change
    let lastAddress = $state(address);
    $effect(() => {
        if (address !== lastAddress) {
            lastAddress = address;
            currentIndex = 0;
            activeModule = "discography";
            shuffleEnabled = false;

            // Auto-play the first song of the new artist
            if (discography.length > 0) {
                selectSong(discography[0]);
            }
        }
    });

    const API_URL = import.meta.env.PUBLIC_API_URL;

    function handleSelect(index: number) {
        currentIndex = index;
        const song = displayPlaylist[index];
        if (song) {
            selectSong(song);
        }
    }

    function handleNext() {
        const nextIndex = (currentIndex + 1) % displayPlaylist.length;
        handleSelect(nextIndex);
    }

    function handlePrev() {
        const prevIndex =
            (currentIndex - 1 + displayPlaylist.length) %
            displayPlaylist.length;
        handleSelect(prevIndex);
    }

    function handleToggleLike(index: number, liked: boolean) {
        if (displayPlaylist[index]) {
            displayPlaylist[index].Liked = liked;
        }
    }

    function toggleShuffle() {
        shuffleEnabled = !shuffleEnabled;
    }
</script>

<div
    class="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 font-mono"
>
    <!-- Artist Info Header -->
    <div
        class="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-end justify-between px-4 gap-4 mb-2"
    >
        <div>
            <h1
                class="text-[10px] font-mono text-white/40 uppercase tracking-[0.3em] mb-1"
            >
                Artist Profile
            </h1>
            <h2
                class="text-2xl md:text-3xl font-bold tracking-tighter text-white break-all"
            >
                {address}
            </h2>
        </div>
        <div class="flex flex-wrap gap-2">
            <span
                class="px-2 py-0.5 rounded bg-lime-500/10 text-lime-400 text-[10px] border border-lime-500/20 uppercase tracking-widest font-bold"
            >
                {publishedCount} Published
            </span>
            <span
                class="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] border border-purple-500/20 uppercase tracking-widest font-bold"
            >
                {mintedCount} Minted
            </span>
            <span
                class="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20 uppercase tracking-widest font-bold"
            >
                {collectedCount} Collected
            </span>
        </div>
    </div>

    <!-- Main Player Card -->
    <div
        class="reactive-glass border border-white/5 bg-[#1a1a1a] max-w-6xl mx-auto overflow-hidden rounded-2xl shadow-2xl"
    >
        <div
            class="flex items-center justify-between px-6 py-1.5 bg-black/40 border-b border-white/5"
        >
            <div class="flex items-center gap-2 select-none">
                <div
                    class="text-lime-500 drop-shadow-[0_0_8px_rgba(132,204,22,0.4)]"
                >
                    <svg
                        viewBox="0 0 24 24"
                        class="w-5 h-5"
                        fill="currentColor"
                    >
                        <path
                            d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                        />
                    </svg>
                </div>
                <!-- Module Tabs -->
                <div class="flex gap-4 ml-4">
                    <button
                        onclick={() => (activeModule = "discography")}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'discography'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Discography
                    </button>
                    <button
                        onclick={() => (activeModule = "minted")}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'minted'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Minted
                    </button>
                    <button
                        onclick={() => (activeModule = "collected")}
                        class="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors {activeModule ===
                        'collected'
                            ? 'text-lime-400'
                            : 'text-white/40 hover:text-white'}"
                    >
                        Collected
                    </button>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <button
                    onclick={toggleShuffle}
                    class="flex items-center gap-2 px-3 py-1 rounded border transition-all {shuffleEnabled
                        ? 'border-lime-500/50 bg-lime-500/10 text-lime-400'
                        : 'border-white/10 text-white/40 hover:text-white'}"
                >
                    <svg
                        class="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                        />
                    </svg>
                    <span class="text-[9px] font-bold uppercase tracking-widest"
                        >{shuffleEnabled ? "Shuffle On" : "Shuffle Off"}</span
                    >
                </button>
            </div>
        </div>

        <div
            class="flex flex-col lg:flex-row gap-8 h-auto lg:h-[560px] items-stretch p-4"
        >
            <!-- LEFT COLUMN: PLAYER -->
            <div class="w-full lg:w-1/2 flex flex-col gap-4">
                <RadioPlayer
                    playlist={displayPlaylist}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onSelect={handleSelect}
                    onToggleLike={handleToggleLike}
                    {currentIndex}
                />
            </div>

            <!-- RIGHT COLUMN: PLAYLIST -->
            <div
                class="w-full lg:w-1/2 flex flex-col min-h-0 bg-black/20 border border-white/5 rounded-2xl overflow-hidden shadow-inner"
            >
                <div
                    class="flex items-center justify-between p-4 border-b border-white/5 bg-white/2 flex-shrink-0"
                >
                    <h3
                        class="text-white/80 font-bold tracking-[0.2em] uppercase text-[10px]"
                    >
                        {activeModule} ({displayPlaylist.length})
                    </h3>
                    <div class="flex items-center gap-2">
                        <span
                            class="w-2 h-2 rounded-full bg-lime-500 shadow-[0_0_8px_#84cc16]"
                        ></span>
                        <span
                            class="text-[9px] text-white/30 font-mono uppercase"
                            >Live</span
                        >
                    </div>
                </div>

                <div class="flex-1 relative min-h-0">
                    <ul
                        class="divide-y divide-white/5 h-full overflow-y-auto dark-scrollbar"
                    >
                        {#each displayPlaylist as song, index}
                            <li>
                                <div
                                    role="button"
                                    tabindex="0"
                                    class="w-full flex items-center gap-4 p-4 hover:bg-white/[0.07] active:bg-white/[0.1] transition-all duration-200 text-left cursor-pointer group {index ===
                                    currentIndex
                                        ? 'bg-lime-500/15 border-l-4 border-lime-500'
                                        : 'border-l-4 border-transparent hover:border-white/10'}"
                                    onclick={(e) => {
                                        const target = e.target as HTMLElement;
                                        if (
                                            target.closest("a") ||
                                            target.closest("button")
                                        )
                                            return;
                                        handleSelect(index);
                                    }}
                                    onkeydown={(e) => {
                                        if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                        ) {
                                            e.preventDefault();
                                            handleSelect(index);
                                        }
                                    }}
                                >
                                    <span
                                        class="text-white/20 w-4 text-center text-xs font-mono"
                                        >{index + 1}</span
                                    >

                                    <div
                                        class="relative w-12 h-12 rounded-xl bg-slate-800 flex-shrink-0 overflow-hidden group/thumb border border-white/10 shadow-lg"
                                    >
                                        <img
                                            src="{API_URL}/image/{song.Id}.png"
                                            alt="Art"
                                            class="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110 group-hover:brightness-50"
                                            onerror={(e) => {
                                                e.currentTarget.style.display =
                                                    "none";
                                            }}
                                        />

                                        <!-- Play overlay on hover -->
                                        <div
                                            class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20"
                                        >
                                            <svg
                                                class="w-6 h-6 text-lime-400"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </div>

                                        {#if index === currentIndex && audioState.playingId === song.Id}
                                            <div
                                                class="absolute inset-0 bg-black/60 flex items-center justify-center"
                                            >
                                                <div
                                                    class="flex gap-0.5 items-end h-3"
                                                >
                                                    <div
                                                        class="w-1 bg-lime-500 animate-bounce"
                                                        style="animation-delay: 0.1s; height: 100%;"
                                                    ></div>
                                                    <div
                                                        class="w-1 bg-lime-500 animate-bounce"
                                                        style="animation-delay: 0.2s; height: 60%;"
                                                    ></div>
                                                    <div
                                                        class="w-1 bg-lime-500 animate-bounce"
                                                        style="animation-delay: 0.3s; height: 80%;"
                                                    ></div>
                                                </div>
                                            </div>
                                        {/if}
                                    </div>

                                    <div
                                        class="overflow-hidden text-left flex-1 min-w-0"
                                    >
                                        <div
                                            class="text-sm font-bold text-white/90 truncate {index ===
                                            currentIndex
                                                ? 'text-lime-400'
                                                : ''}"
                                        >
                                            {song.Title || "Untitled"}
                                        </div>
                                        <div
                                            class="flex items-center gap-3 text-[10px] text-white/30 truncate uppercase tracking-widest mt-0.5 font-light"
                                        >
                                            {new Date(
                                                song.Created_At,
                                            ).toLocaleDateString(undefined, {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })}

                                            {#if song.Tags && song.Tags.length > 0}
                                                <div
                                                    class="flex gap-1.5 items-center ml-2 border-l border-white/10 pl-2"
                                                >
                                                    {#each song.Tags.slice(0, 3) as tag}
                                                        <span
                                                            class="text-[9px] text-lime-400/50 hover:text-lime-400 transition-colors cursor-default"
                                                            >#{tag}</span
                                                        >
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-1">
                                        <LikeButton
                                            smolId={song.Id}
                                            liked={song.Liked || false}
                                            classNames="p-2 text-white/20 hover:text-[#ff424c] hover:bg-white/5 rounded-full transition-colors"
                                            on:likeChanged={(e) => {
                                                handleToggleLike(
                                                    index,
                                                    e.detail.liked,
                                                );
                                            }}
                                        />

                                        <a
                                            href="/{song.Id}"
                                            class="p-2 text-white/20 hover:text-white transition-colors"
                                            title="View Details"
                                            onclick={(e) => e.stopPropagation()}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke-width="1.5"
                                                stroke="currentColor"
                                                class="w-4 h-4"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                                />
                                            </svg>
                                        </a>
                                    </div>
                                </div>
                            </li>
                        {/each}
                    </ul>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .dark-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .dark-scrollbar::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
    }
    .dark-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
    }
    .dark-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
    }
</style>
