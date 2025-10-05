<script lang="ts">
  import { fade } from 'svelte/transition';
  import MiniAudioPlayer from './MiniAudioPlayer.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import {
    audioState,
    setAudioElement,
    updateProgress,
    togglePlayPause,
  } from '../../stores/audio.svelte';

  interface Props {
    classNames: string;
    songNext: () => void;
  }

  let { classNames, songNext }: Props = $props();

  /**
   * Effect: Sync audio source with current song
   * When the current song changes, update the audio element's src
   */
  $effect(() => {
    const song = audioState.currentSong;
    const audio = audioState.audioElement;

    if (!audio) return;

    if (song && song.Id && song.Song_1) {
      const songUrl = `${import.meta.env.PUBLIC_API_URL}/song/${song.Song_1}.mp3`;

      // Only update src if it's different to avoid reloading
      if (audio.src !== songUrl) {
        audio.src = songUrl;
        audio.load();
      }
    } else {
      // No song selected, clear audio
      audio.pause();
      audio.src = '';
      audio.currentTime = 0;
    }
  });

  /**
   * Effect: Sync playback state with playing ID
   * When playingId changes, play or pause the audio accordingly
   */
  $effect(() => {
    const playingId = audioState.playingId;
    const currentSong = audioState.currentSong;
    const audio = audioState.audioElement;

    if (!audio || !audio.src) return;

    if (currentSong && playingId === currentSong.Id) {
      // Should be playing
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error('Error playing audio:', error);
          // Reset playing state on error
          audioState.playingId = null;
        });
      }
    } else {
      // Should be paused
      audio.pause();
    }
  });

  function handleTimeUpdate(event: Event) {
    const audio = event.target as HTMLAudioElement;
    updateProgress(audio.currentTime, audio.duration);
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
