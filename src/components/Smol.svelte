<script lang="ts">
    export let id: string | null;
    export let data: any;

    import { onDestroy, onMount } from "svelte";
    import Loader from "./Loader.svelte";
    import { contractId } from "../store/contractId";

    let d1 = data?.d1;
    let kv_do = data?.kv_do;

    // TODO
    // tweak just the song vs the image
    // make a song private or public
    // collect songs
    // remix songs
    // create playlists
    // private gens
    // instrumentals
    // toggle track_1 vs track_2
    // toggle public vs private
    // toggle private vs public
    // only show action buttons like public/private and delete if we're the song author

    let prompt: string = "";
    let is_public: boolean = true;
    let is_instrumental: boolean = false;
    let best_song: string = d1?.Song_1;
    let audioElements: HTMLAudioElement[] = [];
    let interval: NodeJS.Timeout | null = null;
    let failed: boolean = false;

    onMount(async () => {
        switch (data?.wf?.status) {
            case "queued":
            case "running":
            case "paused":
            case "waiting":
            case "waitingForPause":
                interval = setInterval(getGen, 1000 * 5);
                break;
        }
    });

    onDestroy(() => {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
    });

    function playAudio(index: number) {
        audioElements.forEach((audio, i) => {
            if (i !== index) {
                audio.pause();
            } else {
                audio.play();
            }
        });
    }

    async function makeSongPublic() {
        await fetch(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
        });

        d1.Public = d1.Public === 1 ? 0 : 1;
    }

    async function deleteSong() {
        if (!confirm("Are you sure you want to delete this song?"))
            return;

        await fetch(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
        });

        history.replaceState({}, "", "/");
        location.reload();
    }

    async function selectBestSong(song_id: string) {
        await fetch(`${import.meta.env.PUBLIC_API_URL}/${id}/${song_id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
        });
    }

    async function postGen() {
        if (!prompt) return;

        id = null;
        d1 = null;
        kv_do = null;
        failed = false;

        if (interval) {
            clearInterval(interval);
            interval = null;
        }

        id = await fetch(import.meta.env.PUBLIC_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
                address: $contractId,
                prompt,
                public: is_public,
                instrumental: is_instrumental,
            }),
        }).then(async (res) => {
            if (res.ok) return res.text();
            else throw await res.text();
        });

        prompt = "";

        if (id) {
            history.pushState({}, "", `/${id}`);
        }

        interval = setInterval(getGen, 1000 * 5);

        // After `interval` so the "Generate" button will disable immediately
        await getGen();
    }
    async function retryGen() {
        d1 = null;
        kv_do = null;

        if (interval) {
            clearInterval(interval);
            interval = null;
        }

        id = await fetch(`${import.meta.env.PUBLIC_API_URL}/retry/${id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
                address: $contractId,
            }),
        }).then(async (res) => {
            if (res.ok) return res.text();
            else throw await res.text();
        });

        if (id) {
            history.pushState({}, "", `/${id}`);
        }

        failed = false;
        interval = setInterval(getGen, 1000 * 5);

        // After `interval` so the "Generate" button will disable immediately
        await getGen();
    }
    async function getGen() {
        if (!id) return;

        return fetch(`${import.meta.env.PUBLIC_API_URL}/${id}`, {
            credentials: "include",
        })
            .then(async (res) => {
                if (res.ok) return res.json();
                else throw await res.text();
            })
            .then((res) => {
                // console.log(res);

                d1 = res?.d1;
                kv_do = res?.kv_do;
                best_song = d1?.Song_1;

                // status: "queued" // means that instance is waiting to be started (see concurrency limits)
                // | "running" | "paused" | "errored" | "terminated" // user terminated the instance while it was running
                // | "complete" | "waiting" // instance is hibernating and waiting for sleep or event to finish
                // | "waitingForPause" // instance is finishing the current work to pause
                // | "unknown";

                switch (res?.wf?.status) {
                    case "errored":
                    case "terminated":
                    case "complete":
                    case "unknown":
                        if (interval) {
                            clearInterval(interval);
                            interval = null;
                        }
                        if (res.wf.status !== "complete") {
                            // TODO show step failures in the UI vs using alert
                            // alert(`Failed with status: ${res.wf.status}`);
                            failed = true;
                        }
                        break;
                }

                return res;
            });
    }
</script>

<!-- TODO add loading icons -->

{#if !id}
    <div class="px-2 py-10 bg-slate-900">
        <div class="flex flex-col items-center max-w-[1024px] mx-auto">
            {#if !$contractId}
                <h1
                    class="bg-rose-950 border border-rose-400 rounded px-2 py-1"
                >
                    Login or Create New Account
                </h1>
            {:else}
                <form
                    class="flex flex-col items-start max-w-[512px] w-full"
                    on:submit|preventDefault={postGen}
                >
                    <textarea
                        class="p-2 mb-4 w-full bg-slate-800 text-white outline-3 outline-offset-3 outline-slate-800 rounded focus:outline-slate-700"
                        placeholder="Write an epic prompt for an even epic'er gen"
                        rows="4"
                        bind:value={prompt}
                    ></textarea>

                    <div class="flex w-full mb-5">
                        <div>
                            <label class="flex items-center" for="public">
                                <span class="text-xs mr-2">Public</span>
                                <input
                                    type="checkbox"
                                    name="public"
                                    id="public"
                                    bind:checked={is_public}
                                />
                            </label>

                            <label class="flex items-center" for="instrumental">
                                <span class="text-xs mr-2">Instrumental</span>
                                <input
                                    type="checkbox"
                                    name="instrumental"
                                    id="instrumental"
                                    bind:checked={is_instrumental}
                                />
                            </label>
                        </div>

                        <button
                            type="submit"
                            class="ml-auto text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
                            disabled={(!!id && !!interval) || !prompt}
                            >⚡︎ Generate</button
                        >
                    </div>

                    <aside class="text-xs self-start">
                        * Will take roughly 6 minutes to fully generate.
                        <br /> &nbsp;&nbsp; Even longer during times of heavy load.
                    </aside>
                </form>
            {/if}
        </div>
    </div>
{/if}

<div class="px-2 py-10">
    <div class="flex flex-col items-center max-w-[1024px] mx-auto">
        <ul class="max-w-[512px] w-full [&>li]:mb-5 [&>li>h1]:font-bold">
            {#if failed}
                <li>
                    <button
                        class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
                        on:click={retryGen}
                        disabled={!!id && !!interval}>⚡︎ Retry</button
                    >
                </li>
            {/if}

            <li>
                <h1>Id:</h1>
                <pre class="whitespace-pre-wrap break-all"><code class="text-xs">{id}</code></pre>

                <div class="flex items-center">
                {#if kv_do && kv_do?.nsfw}
                    {#if kv_do.nsfw?.safe === false}
                        <span
                            class="bg-rose-400 text-rose-900 uppercase text-xs font-mono px-2 py-1 rounded-full"
                        >
                            unsafe —
                            {kv_do.nsfw?.categories.join(", ")}
                        </span>
                    {:else}
                        <span
                            class="bg-lime-400 text-lime-900 uppercase text-xs font-mono px-2 py-1 rounded-full"
                            >safe</span
                        >

                        {#if d1?.Address === $contractId}
                            <button
                                class="uppercase text-xs font-mono ring rounded px-2 py-1 mx-2
                                {d1?.Public
                                    ? 'text-amber-500 bg-amber-500/20 ring-amber-500 hover:bg-amber-500/30'
                                    : 'text-blue-500 bg-blue-500/20 ring-blue-500 hover:bg-blue-500/30'}"
                                on:click={makeSongPublic}
                            >
                                {#if d1?.Public}
                                    Unpublish
                                {:else}
                                    Publish
                                {/if}
                            </button>
                        {/if}
                    {/if}

                    {#if d1?.Address === $contractId}
                        <button
                            class="uppercase text-xs font-mono ring rounded px-2 py-1 text-rose-500 bg-rose-500/20 ring-rose-500 hover:bg-rose-500/30"
                            aria-label="Delete"
                            on:click={deleteSong}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                class="size-4"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                    {/if}
                {/if}
                </div>
            </li>

            <li>
                <h1>Prompt:</h1>
                <p>{kv_do && kv_do?.payload?.prompt}</p>
            </li>

            <!-- [1] is reply tweet id -->

            <li>
                <h1 class="mb-2">
                    Image: (powered by <a
                        class="underline"
                        href="https://www.pixellab.ai/"
                        target="_blank">PixelLab</a
                    >)
                </h1>

                {#if kv_do && kv_do?.image_base64}
                    <img
                        class="aspect-square object-contain pixelated w-[256px]"
                        src={`${import.meta.env.PUBLIC_API_URL}/image/${id}.png`}
                        on:error={(e) => {
                            // @ts-ignore
                            e.currentTarget.src = `data:image/png;base64,${kv_do.image_base64}`;
                        }}
                        alt={kv_do?.lyrics?.title}
                    />
                {/if}
            </li>

            <li>
                <h1>Description:</h1>
                <p>{kv_do && kv_do?.description}</p>
            </li>

            <li>
                <h1 class="mb-2">
                    Songs: (powered by <a
                        class="underline"
                        href="https://aisonggenerator.io/"
                        target="_blank">AI Song Generator</a
                    >)
                </h1>

                <!-- [5] is nsfw tags -->
                <!-- [6] is the song ids -->

                {#if kv_do && kv_do?.songs}
                    {#each kv_do && kv_do.songs as song, index (song.music_id)}
                        {#if song.audio}
                            <div class="flex items-center mb-2">
                                <audio
                                    class="mr-2"
                                    bind:this={audioElements[index]}
                                    on:play={() => playAudio(index)}
                                    src={song.status < 4
                                        ? song.audio
                                        : `${import.meta.env.PUBLIC_API_URL}/song/${song.music_id}.mp3`}
                                    on:error={(e) => {
                                        // @ts-ignore
                                        e.currentTarget.src = song.audio;
                                    }}
                                    controls
                                ></audio>

                                {#if d1?.Address === $contractId}
                                    <input
                                        class="scale-150 m-2"
                                        type="radio"
                                        value={song.music_id}
                                        bind:group={best_song}
                                        on:change={() =>
                                            selectBestSong(song.music_id)}
                                    />
                                {/if}
                                
                                {#if song.music_id === best_song}
                                    <span class="text-2xl ml-1">👈</span>
                                    <span class="ml-2 mt-1">better</span>
                                {/if}
                            </div>
                        {:else}
                            <Loader />
                        {/if}
                    {/each}
                {:else if interval}
                    <Loader />
                {/if}
            </li>

            <li>
                <h1>Lyrics:</h1>
                <pre
                    class="whitespace-pre-wrap break-words [&>code]:text-xs"><code
                        >Title: <strong>{kv_do && kv_do?.lyrics?.title}</strong
                        ></code
                    >
<code>Tags: <em>{kv_do && kv_do?.lyrics?.style.join(", ")}</em></code>

{#if is_instrumental || d1?.Instrumental !== 1}<code
                            >{kv_do && kv_do?.lyrics?.lyrics}</code
                        >{/if}</pre>
            </li>
        </ul>
    </div>
</div>
