<script lang="ts">
    import { fade } from 'svelte/transition';
    import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
    import LikeButton from "./LikeButton.svelte";
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

    export let classNames: string;
    export let songNext: () => void;

    $: {
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
    }

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
                <LikeButton
                    smolId={$currentSong.Id}
                    liked={$currentSong?.Liked || false}
                    on:likeChanged={(e) => {
                        if ($currentSong) {
                            $currentSong.Liked = e.detail.liked;
                        }
                    }}
                />
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