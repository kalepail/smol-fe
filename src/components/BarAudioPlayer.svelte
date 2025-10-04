<script lang="ts">
    import { fade } from 'svelte/transition';
    import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
    import Loader from "./Loader.svelte";
    import { contractId } from "../store/contractId";
    import {
        playingId,
        audioProgress,
        audioElement,
        currentSong,
        setAudioSourceAndLoad,
        playAudioInElement,
        pauseAudioInElement,
        resetAudioElement,
        updateProgressInStore,
        togglePlayPause
    } from "../store/audio";

    let { classNames, songNext, onLike }: any = $props();

    $effect(() => {
        const song = $currentSong;
        const pId = $playingId;
        const audio = $audioElement;

        if (audio) {
            if (song && song.Id && song.Song_1) {
                const songUrl = `${import.meta.env.PUBLIC_API_URL}/song/${song.Song_1}.mp3`;
                if (audio.src !== songUrl) {
                    setAudioSourceAndLoad(songUrl);
                }

                if (pId === song.Id) {
                    playAudioInElement();
                } else {
                    pauseAudioInElement();
                }
            } else {
                resetAudioElement();
            }
        }
    });

    function handleTimeUpdate(event: Event) {
        const audio = event.target as HTMLAudioElement;
        updateProgressInStore(audio.currentTime, audio.duration);
    }

    function handleEnded() {
        songNext();
    }
</script>

{#if $currentSong}
    <div 
        class={classNames}
        transition:fade={{ duration: 200 }}
    >
        <div class="flex items-center justify-between max-w-7xl mx-auto">
            <div class="flex items-center gap-4 mr-4">
                <img 
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${$currentSong.Id}.png`}
                    alt={$currentSong.Title}
                    class="w-12 h-12 rounded object-cover"
                />
                <div>
                    <h3 class="text-white font-medium leading-5">{$currentSong.Title}</h3>
                    <!-- <p class="text-gray-400 text-sm">Smol</p> -->
                </div>
            </div>
            
            <div class="flex items-center gap-2">
                {#if $contractId}
                    <button
                        class="p-2 rounded-lg backdrop-blur-xs hover:bg-slate-950/70 transition-colors"
                        aria-label="Like"
                        disabled={$currentSong?.Liking || !$currentSong}
                        on:click={() => onLike($currentSong)}
                    >
                        {#if $currentSong?.Liking}
                            <Loader classNames="w-5 h-5" />
                        {:else if $currentSong?.Liked}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                class="size-5"
                            >
                                <path
                                    d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"
                                />
                            </svg>
                        {:else}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                                stroke="currentColor"
                                class="size-5"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                                />
                            </svg>
                        {/if}
                    </button>
                {/if}
                {#if $currentSong.Id && $currentSong.Song_1}
                <MiniAudioPlayer
                    id={$currentSong.Id} 
                    playing_id={$playingId}
                    songToggle={togglePlayPause}
                    {songNext}
                    progress={$audioProgress}
                />
                {/if}
            </div>
        </div>
    </div>
{/if}

<audio
    preload="auto" 
    bind:this={$audioElement}
    on:timeupdate={handleTimeUpdate}
    on:ended={handleEnded}
    on:loadeddata={() => {
        if ($currentSong && $playingId === $currentSong.Id) {
            playAudioInElement();
        }
    }}
></audio>