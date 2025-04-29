<script lang="ts">
    import MiniAudioPlayer from "./MiniAudioPlayer.svelte";

    export let results: any;
</script>

<!-- TODO 
 have the bg of each card match the image primary color 
 progressive loading of images and music

 build a mini audio player that shows more details of the current song
 also find a way to maintain this player across the app
 -->

<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2">
    {#each results as smol}
        <div class="flex flex-col bg-slate-700 rounded overflow-hidden">
            <div class="relative">
                <img class="aspect-square object-contain pixelated w-full shadow-md" src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`} alt={smol.Title} loading="lazy" />
                <a class="absolute inset-0" href={`/${smol.Id}`} aria-label={smol.Title}></a>
            </div>

            <div class="flex items-center relative p-2 flex-1">
                <h1 class="relative z-1 leading-4 text-sm text-white">{smol.Title}</h1>
                <img class="absolute inset-0 z-0 opacity-80 scale-y-[-1] w-full h-full blur-lg" src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`} alt={smol.Title} loading="lazy" />
                <div class="relative z-2 pl-2 ml-auto">
                    <MiniAudioPlayer song={`${import.meta.env.PUBLIC_API_URL}/song/${smol.Song_1}.mp3`} />
                </div>
            </div>
        </div>
    {/each}
</div>