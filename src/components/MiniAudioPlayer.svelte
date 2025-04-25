<script>
    import { currentAudio } from "../store/audioManager";
    import { get } from "svelte/store";

    export let song;

    let audio;
    let playing = false;
    let progress = 0;

    const radius = 24;
    const circumference = 2 * Math.PI * radius;

    $: dashOffset = circumference - (progress / 100) * circumference;

    function togglePlay() {
        if (!audio) return;

        const current = get(currentAudio);

        if (current && current.audio !== audio) {
            current.pause(); // fully pause + reset UI of previous component
        }

        if (playing) {
            audio.pause();
            currentAudio.set(null);
        } else {
            audio.play();
            currentAudio.set({ audio, pause: pauseFromOutside });
        }

        playing = !playing;
    }

    function updateProgress() {
        if (audio?.duration) {
            progress = (audio.currentTime / audio.duration) * 100;
        }
    }

    function resetProgress() {
        progress = 0;
        playing = false;
        currentAudio.set(null);
    }

    function pauseFromOutside() {
        audio.pause();
        playing = false;
    }
</script>

<div class="relative w-9 h-9">
    <svg class="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
        <!-- Background circle -->
        <circle
            cx="32"
            cy="32"
            r={radius}
            stroke="rgba(255,255,255,0.2)"
            stroke-width="4"
            fill="none"
        />
        <!-- Progress circle -->
        <circle
            cx="32"
            cy="32"
            r={radius}
            stroke="white"
            stroke-width="4"
            fill="none"
            stroke-linecap="round"
            stroke-dasharray={circumference}
            stroke-dashoffset={dashOffset}
        />
    </svg>

    <button
        on:click={togglePlay}
        class="absolute inset-1 flex items-center justify-center text-white"
    >
        {#if playing}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                class="size-4"
            >
                <path
                    d="M4.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-1ZM10.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-1Z"
                />
            </svg>
        {:else}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="size-8"
            >
                <path
                    fill-rule="evenodd"
                    d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z"
                    clip-rule="evenodd"
                />
            </svg>
        {/if}
    </button>
</div>

<audio
    bind:this={audio}
    src={song}
    on:timeupdate={updateProgress}
    on:ended={resetProgress}
></audio>
