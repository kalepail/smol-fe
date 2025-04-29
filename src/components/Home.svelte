<script lang="ts">
    import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
    import BarAudioPlayer from "./BarAudioPlayer.svelte";
    
    export let results: any;

    let playing_id: string | null = null;

    function songToggle(id: string) {
        playing_id = playing_id === id ? null : id;
    }

    function songNext() {
        if (playing_id === null || results.length === 0) return;
        
        // Get an array of all IDs except the currently playing one
        const otherIds = results
            .filter((smol: any) => smol.Id !== playing_id)
            .map((smol: any) => smol.Id);
            
        // If there are no other songs, return
        if (otherIds.length === 0) return;
        
        // Select a random ID from the available options
        const randomIndex = Math.floor(Math.random() * otherIds.length);
        songToggle(otherIds[randomIndex]);
    }
</script>

<!-- TODO 
 have the bg of each card match the image primary color 
 progressive loading of images and music

 build a mini audio player that shows more details of the current song
 also find a way to maintain this player across the app
 -->

<div
    class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2 pb-10"
>
    {#each results as smol}
        <div class="flex flex-col bg-slate-700 rounded overflow-hidden">
            <div class="relative">
                <img
                    class="aspect-square object-contain pixelated w-full shadow-md"
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
                    alt={smol.Title}
                    loading="lazy"
                />
                <a
                    class="absolute inset-0"
                    href={`/${smol.Id}`}
                    aria-label={smol.Title}
                ></a>
            </div>

            <div class="flex items-center relative p-2 flex-1">
                <h1 class="relative z-1 leading-4 text-sm text-white">
                    {smol.Title}
                </h1>
                <img
                    class="absolute inset-0 z-0 opacity-80 scale-y-[-1] w-full h-full blur-lg"
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
                    alt={smol.Title}
                    loading="lazy"
                />
                <div class="relative z-2 pl-2 ml-auto">
                    <MiniAudioPlayer
                        id={smol.Id}
                        {playing_id}
                        song={`${import.meta.env.PUBLIC_API_URL}/song/${smol.Song_1}.mp3`}
                        songToggle={() => songToggle(smol.Id)}
                        {songNext}
                    />
                </div>
            </div>
        </div>
    {/each}
</div>

<!-- <BarAudioPlayer classNames="fixed z-2 p-2 bottom-0 left-0 right-0 bg-slate-950/50 backdrop-blur" /> -->