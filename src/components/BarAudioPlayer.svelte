<script lang="ts">
    export let smol: any = null;
    export let playing_id: string | null = null;
    export let progress: number = 0;
    export let songToggle: () => void;
    export let songNext: () => void;

    let audio: HTMLAudioElement;

    $: playing = smol && playing_id === smol.Id;

    $: if (audio && smol) {
        if (playing) {
            const url = `${import.meta.env.PUBLIC_API_URL}/song/${smol.Song_1}.mp3`;
            if (audio.src !== url) {
                audio.src = url;
                audio.load();
            }
            if (audio.readyState >= 2) {
                audio.play();
            } else {
                audio.addEventListener('canplay', () => audio.play(), { once: true });
            }
        } else {
            audio.pause();
            audio.currentTime = 0;
            progress = 0;
        }
    }

    function updateProgress() {
        if (audio?.duration) {
            progress = (audio.currentTime / audio.duration) * 100;
        }
    }

    function songEnded() {
        audio.currentTime = 0;
        progress = 0;
        songNext();
    }
</script>

{#if smol && playing}
<div class="fixed bottom-0 left-0 right-0 z-10 bg-slate-900/80 backdrop-blur p-2 flex items-center">
    <img
        class="w-12 h-12 object-contain pixelated mr-2"
        src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
        alt={smol.Title}
        loading="lazy"
    />
    <div class="flex-1 overflow-hidden">
        <h1 class="text-sm font-bold truncate">{smol.Title}</h1>
        {#if smol.Prompt}
            <p class="text-xs opacity-80 truncate">{smol.Prompt}</p>
        {/if}
        <div class="w-full h-1 bg-slate-700 mt-1 rounded">
            <div class="h-full bg-lime-500 rounded" style={`width: ${progress}%`}></div>
        </div>
    </div>
    <button on:click={songToggle} class="ml-2 text-white">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-6">
            <path d="M4.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-1ZM10.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-1Z" />
        </svg>
    </button>
</div>
{/if}

<audio preload="none" bind:this={audio} on:timeupdate={updateProgress} on:ended={songEnded}></audio>
