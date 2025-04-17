<script lang="ts">
    export let id: string | null;
    export let data: any;

    import { onDestroy, onMount } from "svelte";
    import Loader from "./Loader.svelte";

    let url: URL;
    let prompt: string = "";
    let audioElements: HTMLAudioElement[] = [];
    let interval: NodeJS.Timeout | null = null;
    let failed: boolean = false;

    onMount(async () => {
        url = new URL(window.location.href);

        const res = await getGen();

        // Job is in the queue, no progress has been made yet though
        if (res?.steps?.length === 0) {
            interval = setInterval(getGen, 1000 * 5);
            return;
        }

        switch (res?.steps?.status) {
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

    async function postGen() {
        if (!prompt) return;

        id = null;
        data = null;

        if (interval) {
            clearInterval(interval);
            interval = null;
        }

        id = await fetch(`https://smol-workflow.sdf-ecosystem.workers.dev`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt }),
        }).then(async (res) => {
            if (res.ok) return res.text();
            else throw await res.text();
        });

        prompt = "";

        if (id) {
            window.history.replaceState({}, "", `/${id}`);
        }

        interval = setInterval(getGen, 1000 * 5);

        // After `interval` so the "Generate" button will disable immediately
        await getGen();
    }
    async function retryGen() {
        data = null;

        if (interval) {
            clearInterval(interval);
            interval = null;
        }

        id = await fetch(
            `https://smol-workflow.sdf-ecosystem.workers.dev?id=${id}&retry=true`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            },
        ).then(async (res) => {
            if (res.ok) return res.text();
            else throw await res.text();
        });

        if (id) {
            window.history.replaceState({}, "", `/${id}`);
        }

        failed = false;
        interval = setInterval(getGen, 1000 * 5);

        // After `interval` so the "Generate" button will disable immediately
        await getGen();
    }
    async function getGen() {
        if (!id) return;

        return fetch(`https://smol-workflow.sdf-ecosystem.workers.dev?id=${id}`)
            .then(async (res) => {
                if (res.ok) return res.json();
                else throw await res.text();
            })
            .then((res) => {
                // console.log(res);

                data = res.do;

                // status: "queued" // means that instance is waiting to be started (see concurrency limits)
                // | "running" | "paused" | "errored" | "terminated" // user terminated the instance while it was running
                // | "complete" | "waiting" // instance is hibernating and waiting for sleep or event to finish
                // | "waitingForPause" // instance is finishing the current work to pause
                // | "unknown";

                switch (res.steps.status) {
                    case "errored":
                    case "terminated":
                    case "complete":
                    case "unknown":
                        if (interval) {
                            clearInterval(interval);
                            interval = null;
                        }
                        if (res.steps.status !== "complete") {
                            // TODO show step failures in the UI vs using alert
                            // alert(`Failed with status: ${res.steps.status}`);
                            failed = true;
                        }
                        break;
                }

                return res;
            });
    }
</script>

<!-- TODO add loading icons -->

<div class="px-2 py-10 bg-amber-50 border-b border-amber-200">
    <div class="flex flex-col items-center max-w-[1024px] mx-auto">
        <form
            class="flex flex-col items-end max-w-[512px] w-full"
            on:submit|preventDefault={postGen}
        >
            <textarea
                class="border p-2 mb-2 w-full bg-white"
                placeholder="Write an epic prompt for an even epic'er gen"
                rows="4"
                bind:value={prompt}
            ></textarea>
            <button
                type="submit"
                class="text-white bg-indigo-500 px-5 py-1 disabled:bg-gray-400"
                disabled={(!!id && !!interval) || !prompt}>⚡︎ Generate</button
            >
            <aside class="text-xs mt-1 self-start">
                * Will take roughly 6 minutes to fully generate.
                <br /> &nbsp;&nbsp; Even longer during times of heavy load.
            </aside>
        </form>
    </div>
</div>

<div class="px-2 py-10">
    <div class="flex flex-col items-center max-w-[1024px] mx-auto">
        <ul class="max-w-[512px] w-full [&>li]:mb-5 [&>li>h1]:font-bold">
            {#if failed}
                <li>
                    <button
                        class="text-white bg-indigo-500 px-5 py-1 disabled:bg-gray-400"
                        on:click={retryGen}
                        disabled={!!id && !!interval}>Retry</button
                    >
                </li>
            {/if}

            <li>
                <h1>Id:</h1>
                <pre class="whitespace-pre-wrap break-all"><code class="text-xs"
                        >{id}</code
                    ></pre>

                {#if data && data?.nsfw}
                    {#if data.nsfw?.safe === false}
                        <span
                            class="bg-rose-400 text-rose-1000 uppercase text-xs font-mono px-2 py-1 rounded-full"
                        >
                            unsafe —
                            {data.nsfw?.categories.join(", ")}
                        </span>
                    {:else}
                        <span
                            class="bg-lime-400 text-lime-1000 uppercase text-xs font-mono px-2 py-1 rounded-full"
                            >safe</span
                        >
                    {/if}
                {/if}
            </li>

            <li>
                <h1>Prompt:</h1>
                <p>{data && data?.payload?.prompt}</p>
            </li>

            <!-- [1] is reply tweet id -->

            <li>
                <h1 class="mb-2">
                    Image: (powered by <a
                        class="underline"
                        href="https://www.pixellab.ai/">PixelLab</a
                    >)
                </h1>

                {#if data && data?.image_base64}
                    <img
                        class="aspect-square object-contain pixelated w-[256px]"
                        src={`/image/${id}.png`}
                    />
                {/if}
            </li>

            <li>
                <h1>Description:</h1>
                <p>{data && data?.description}</p>
            </li>

            <li>
                <h1 class="mb-2">
                    Songs: (powered by <a
                        class="underline"
                        href="https://aisonggenerator.io/">AI Song Generator</a
                    >)
                </h1>

                <!-- [5] is nsfw tags -->
                <!-- [6] is the song ids -->

                {#if data && data?.songs}
                    {#each data && data.songs as song, index (song.music_id)}
                        {#if song.audio}
                            <audio
                                class="mb-2"
                                bind:this={audioElements[index]}
                                on:play={() => playAudio(index)}
                                src={song.audio}
                                controls
                            ></audio>
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
                        >Title: <strong>{data && data?.lyrics?.title}</strong
                        ></code
                    >
<code>Tags: <em>{data && data?.lyrics?.style.join(", ")}</em></code>

<code>{data && data?.lyrics?.lyrics}</code></pre>
            </li>
        </ul>
    </div>
</div>
