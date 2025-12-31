<script lang="ts">
  import { fade } from "svelte/transition";
  import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
  import LikeButton from "../ui/LikeButton.svelte";
  import { trackView } from "../../lib/analytics";
  import {
    audioState,
    setAudioElement,
    updateProgress,
    togglePlayPause,
    playNextSong,
  } from "../../stores/audio.svelte";

  /**
   * Effect: Sync audio source with current song
   * When the current song changes, update the audio element's src
   */
  $effect(() => {
    const song = audioState.currentSong;
    const audio = audioState.audioElement;

    if (!audio) return;

    if (song && song.Id && song.Song_1) {
      // Use audio proxy if available (enables Web Audio API visualizer via CORS)
      const audioProxyUrl = import.meta.env.PUBLIC_AUDIO_PROXY_URL;
      const songUrl = audioProxyUrl
        ? `${audioProxyUrl}/audio/${song.Song_1}`
        : `${import.meta.env.PUBLIC_API_URL}/song/${song.Song_1}.mp3`;

      // Only update src if it's different to avoid reloading
      if (audio.src !== songUrl) {
        audio.src = songUrl;
        audio.load();
        trackView(song.Id);
      }
    } else {
      // No song selected, clear audio
      audio.pause();
      audio.src = "";
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
          console.error("Error playing audio:", error);
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
    playNextSong();
  }

  function handleLikeChanged(liked: boolean) {
    if (audioState.currentSong) {
      audioState.currentSong.Liked = liked;
    }
  }
</script>

{#if audioState.currentSong}
  <div
    class="fixed z-30 p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
    transition:fade={{ duration: 200 }}
  >
    <div class="flex items-center justify-between max-w-7xl mx-auto">
      <div class="flex items-center gap-4 mr-4">
        <img
          src={`${import.meta.env.PUBLIC_API_URL}/image/${audioState.currentSong.Id}.png`}
          alt={audioState.currentSong.Title}
          class="w-12 h-12 rounded object-cover"
        />
        <div>
          <h3 class="text-white font-medium leading-5">
            {audioState.currentSong.Title}
          </h3>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <LikeButton
          smolId={audioState.currentSong.Id}
          liked={audioState.currentSong?.Liked || false}
          on:likeChanged={(e) => handleLikeChanged(e.detail.liked)}
        />

        <!-- Shuffle/Radio Button -->
        <a
          href="/radio"
          class="w-8 h-8 flex items-center justify-center text-[#f7931a] hover:text-white hover:bg-[#f7931a]/20 active:scale-95 border border-[#f7931a]/30 hover:border-[#f7931a] transition-all rounded-full bg-[#f7931a]/5"
          title="Open Radio"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
            />
          </svg>
        </a>

        {#if audioState.currentSong.Id && audioState.currentSong.Song_1}
          <MiniAudioPlayer
            id={audioState.currentSong.Id}
            playing_id={audioState.playingId}
            songToggle={togglePlayPause}
            songNext={playNextSong}
            progress={audioState.progress}
          />
        {/if}
      </div>
    </div>
  </div>
{/if}

<audio
  preload="auto"
  crossorigin="anonymous"
  bind:this={audioState.audioElement}
  ontimeupdate={handleTimeUpdate}
  onended={handleEnded}
  onloadeddata={() => {
    if (
      audioState.currentSong &&
      audioState.playingId === audioState.currentSong.Id &&
      audioState.audioElement
    ) {
      const playPromise = audioState.audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.error("Error playing audio on load:", error);
          audioState.playingId = null;
        });
      }
    }
  }}
></audio>
