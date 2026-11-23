<script lang="ts">
  import { onMount } from 'svelte';
  import MiniAudioPlayer from './MiniAudioPlayer.svelte';
  import LikeButton from '../ui/LikeButton.svelte';
  import { attach, player, seek, setTrackLiked, toggle } from '../../stores/audio.svelte';

  let element: HTMLAudioElement;
  let scrub = $state<{ key: string; seconds: number } | null>(null);
  onMount(() => attach(element));

  function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }
</script>

{#if player.track}
  {@const track = player.track}
  {@const position = scrub?.key === track.key ? scrub.seconds : player.currentTime}
  <section
    id="audio-player"
    aria-label="Audio player"
    class="fixed z-30 px-2 py-1 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 lg:w-full lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/90 backdrop-blur-lg border border-white/20 shadow-lg"
  >
    <div class="flex items-center justify-between gap-2">
      <a href={`/${track.smolId}`} class="flex items-center gap-3 min-w-0">
        <img src={track.coverUrl} alt="" class="size-10 rounded object-cover shrink-0" />
        <div class="min-w-0">
          <h3 class="text-white font-medium leading-5 truncate">{track.title}</h3>
          <div role="status" class="text-xs text-slate-300">
            {#if player.status === 'error'}
              {player.message}
            {:else if player.status === 'loading'}
              Loading audio…
            {:else if player.buffering}
              Buffering…
            {/if}
          </div>
        </div>
      </a>

      <div class="flex items-center shrink-0">
        <LikeButton
          smolId={track.smolId}
          liked={track.liked}
          on:likeChanged={(event) => setTrackLiked(event.detail.smolId, event.detail.liked)}
        />
        <MiniAudioPlayer trackKey={track.key} onToggle={toggle} />
      </div>
    </div>

    {#if player.seekable}
      <div class="flex h-6 items-center gap-2 text-xs tabular-nums text-slate-300">
        <span>{formatTime(position)}</span>
        <input
          class="w-full accent-lime-400"
          type="range"
          aria-label="Seek audio"
          min="0"
          max={player.duration}
          step="any"
          value={position}
          oninput={(event) => { scrub = { key: track.key, seconds: event.currentTarget.valueAsNumber }; }}
          onchange={(event) => {
            seek(event.currentTarget.valueAsNumber);
            scrub = null;
          }}
          onpointercancel={() => { scrub = null; }}
          onblur={() => { scrub = null; }}
        />
        <span>{formatTime(player.duration)}</span>
      </div>
    {/if}
  </section>
{/if}

<audio preload="auto" bind:this={element}></audio>
