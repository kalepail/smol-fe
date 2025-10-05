<script lang="ts">
  import { fade } from 'svelte/transition';
  import MiniAudioPlayer from './MiniAudioPlayer.svelte';
  import LikeButton from './LikeButton.svelte';
  import {
    audioState,
    setAudioElement,
    setAudioSourceAndLoad,
    playAudioInElement,
    pauseAudioInElement,
    resetAudioElement,
    updateProgressInStore,
    togglePlayPause,
  } from '../stores/audio.svelte';

  interface Props {
    classNames: string;
    songNext: () => void;
  }

  let { classNames, songNext }: Props = $props();

  $effect(() => {
    const song = audioState.currentSong;
    const pId = audioState.playingId;
    const audio = audioState.audioElement;

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

  function handleLikeChanged(liked: boolean) {
    if (audioState.currentSong) {
      audioState.currentSong.Liked = liked;
    }
  }
</script>

{#if audioState.currentSong}
  <div class={classNames} transition:fade={{ duration: 200 }}>
    <div class="flex items-center justify-between max-w-7xl mx-auto">
      <div class="flex items-center gap-4 mr-4">
        <img
          src={`${import.meta.env.PUBLIC_API_URL}/image/${audioState.currentSong.Id}.png`}
          alt={audioState.currentSong.Title}
          class="w-12 h-12 rounded object-cover"
        />
        <div>
          <h3 class="text-white font-medium leading-5">{audioState.currentSong.Title}</h3>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <LikeButton
          smolId={audioState.currentSong.Id}
          liked={audioState.currentSong?.Liked || false}
          on:likeChanged={(e) => handleLikeChanged(e.detail.liked)}
        />
        {#if audioState.currentSong.Id && audioState.currentSong.Song_1}
          <MiniAudioPlayer
            id={audioState.currentSong.Id}
            playing_id={audioState.playingId}
            songToggle={togglePlayPause}
            {songNext}
            progress={audioState.progress}
          />
        {/if}
      </div>
    </div>
  </div>
{/if}

<audio
  preload="auto"
  bind:this={audioState.audioElement}
  ontimeupdate={handleTimeUpdate}
  onended={handleEnded}
  onloadeddata={() => {
    if (audioState.currentSong && audioState.playingId === audioState.currentSong.Id) {
      playAudioInElement();
    }
  }}
></audio>
