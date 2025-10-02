<script lang="ts">
    import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
    import BarAudioPlayer from "./BarAudioPlayer.svelte";
    import LikeButton from "./LikeButton.svelte";
    import { onMount } from "svelte";
    import { contractId } from "../store/contractId";
    import {
        playingId,
        currentSong,
        audioProgress,
        selectSong,
        togglePlayPause,
    } from "../store/audio";
    import { mixtapeDraft, mixtapeMode, mixtapeTrackIds, type MixtapeTrack } from "../store/mixtape";

    export let results: any;
    export let playlist: string | null;

    let likes: any[] = [];
    let draggingId: string | null = null;

    contractId.subscribe(async (cid) => {
        if (cid) {
            likes = await fetch(`${import.meta.env.PUBLIC_API_URL}/likes`, {
                credentials: "include",
            }).then(async (res) => {
                if (res.ok) return res.json();
                return [];
            });

            results = results.map((smol: any) => {
                smol.Liked = likes.some((id: string) => id === smol.Id);
                return smol;
            });
        }
    });

    onMount(async () => {
        if ("mediaSession" in navigator) {
            navigator.mediaSession.setActionHandler("previoustrack", () => {
                const currentIndex = results.findIndex(
                    (s: any) => s.Id === $currentSong?.Id,
                );
                if (currentIndex > 0) {
                    selectSong(results[currentIndex - 1]);
                } else if (results.length > 0) {
                    selectSong(results[results.length - 1]);
                }
            });

            navigator.mediaSession.setActionHandler("nexttrack", () => {
                songNext();
            });
        }

        if (playlist) {
            localStorage.setItem("smol:playlist", playlist);
        }
    });

    $: if ("mediaSession" in navigator && $currentSong) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: $currentSong.Title,
            artist: "Smol",
            album: "Smol",
            artwork: [
                {
                    src: `${import.meta.env.PUBLIC_API_URL}/image/${$currentSong.Id}.png?scale=8`,
                    sizes: "512x512",
                    type: "image/png",
                },
            ],
        });
    } else if ("mediaSession" in navigator && !$currentSong) {
        navigator.mediaSession.metadata = null;
    }

    function songNext() {
        if (results.length === 0) return;
        const currentId = $currentSong?.Id;
        let nextIndex = 0;

        if (currentId) {
            const currentIndex = results.findIndex(
                (smol: any) => smol.Id === currentId,
            );
            if (currentIndex !== -1 && currentIndex < results.length - 1) {
                nextIndex = currentIndex + 1;
            }
        }
        selectSong(results[nextIndex]);
    }

    function toggleSongSelection(smol: any) {
        if ($currentSong?.Id === smol.Id) {
            togglePlayPause();
        } else {
            selectSong(smol);
        }
    }

    function handleLikeChanged(smolId: string, event: CustomEvent<{ smolId: string; liked: boolean }>) {
        const smol = results.find((s: any) => s.Id === smolId);
        if (smol) {
            smol.Liked = event.detail.liked;
        }
    }

    function buildTrackPayload(smol: any): MixtapeTrack {
        return {
            id: smol.Id,
            title: smol.Title ?? "Untitled Smol",
            creator:
                smol.Creator ??
                smol.Username ??
                smol.artist ??
                smol.author ??
                null,
            coverUrl: `${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`,
        };
    }

    function addToMixtape(smol: any) {
        mixtapeDraft.addTrack(buildTrackPayload(smol));
    }

    function handleDragStart(event: DragEvent, smol: any) {
        if (!$mixtapeMode.active) return;

        const payload = {
            type: "smol" as const,
            track: buildTrackPayload(smol),
        };

        draggingId = smol.Id;

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("application/json", JSON.stringify(payload));
            event.dataTransfer.setData("text/plain", payload.track.title);
        }
    }

    function handleDragEnd() {
        draggingId = null;
    }
</script>

<div
    class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2 pb-10"
>
    {#each results as smol (smol.Id)}
        <div class={`flex flex-col rounded overflow-hidden border ${
            draggingId === smol.Id ? "border-lime-400 bg-slate-800" : "border-transparent bg-slate-700"
        } transition-colors`}>
            <div
                class="group relative"
                draggable={$mixtapeMode.active}
                on:dragstart={(event) => handleDragStart(event, smol)}
                on:dragend={handleDragEnd}
            >
                <img
                    class="aspect-square object-contain pixelated w-full shadow-md"
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
                    alt={smol.Title}
                    loading="lazy"
                />

                {#if $mixtapeMode.active}
                    {#if $mixtapeTrackIds.includes(smol.Id)}
                        <span
                            class="absolute left-1.5 top-1.5 rounded-full bg-lime-400 px-2 py-1 text-xs font-semibold text-slate-950"
                        >Added</span>
                    {:else}
                        <button
                            class="absolute left-1.5 top-1.5 rounded-full bg-slate-950/70 px-2 py-1 text-xs text-lime-300 ring-1 ring-lime-400/60 backdrop-blur hover:bg-slate-950/90"
                            on:click|stopPropagation={() => addToMixtape(smol)}
                        >+ Add</button>
                    {/if}
                {/if}

                <div class="absolute z-2 right-0 bottom-0 rounded-tl-lg backdrop-blur-xs {!smol.Liked && 'opacity-0 group-hover:opacity-100'}">
                    <LikeButton
                        smolId={smol.Id}
                        liked={smol.Liked}
                        classNames="p-2 bg-slate-950/50 hover:bg-slate-950/70 rounded-tl-lg"
                        iconSize="size-6"
                        on:likeChanged={(e) => handleLikeChanged(smol.Id, e)}
                    />
                </div>

                <a
                    class={`absolute inset-0 ${$mixtapeMode.active ? "pointer-events-none" : ""}`}
                    href={`/${smol.Id}`}
                    aria-label={smol.Title}
                ></a>
            </div>

            <div
                class="flex items-center relative p-2 flex-1 overflow-hidden cursor-pointer"
                on:click={() => toggleSongSelection(smol)}
            >
                <h1 class="relative z-1 leading-4 text-sm text-white">
                    {smol.Title}
                </h1>
                <img
                    class="absolute inset-0 z-0 opacity-80 scale-y-[-1] w-full h-full blur-lg pointer-events-none"
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
                    alt={smol.Title}
                    loading="lazy"
                />
                <div class="relative z-2 pl-2 ml-auto">
                    <MiniAudioPlayer
                        id={smol.Id}
                        playing_id={$playingId}
                        songToggle={() => toggleSongSelection(smol)}
                        {songNext}
                        progress={$currentSong?.Id === smol.Id
                            ? $audioProgress
                            : 0}
                    />
                </div>
            </div>
        </div>
    {/each}
</div>

<BarAudioPlayer
    classNames="fixed z-30 p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
    {songNext}
/>
