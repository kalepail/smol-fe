<script lang="ts">
    import { onMount } from "svelte";

    const url = new URL(location.href);

    let prompt: string = "";
    let id: string | null = url.searchParams.get("id") || null;
    let data: any = null;
    let interval: NodeJS.Timeout | null = null;

    onMount(async () => {
        const res = await getGen();

        switch (res.steps.status) {
            case 'queued':
            case 'running':
            case 'paused':
            case 'waiting':
            case 'waitingForPause':
                interval = setInterval(getGen, 1000 * 5);
            break;
        }
    });

    async function postGen() {
        if (!prompt) return;

        id = null;
        data = null;

        if (interval) {
            clearInterval(interval);
            interval = null
        }

        id = await fetch(`https://smol-workflow.sdf-ecosystem.workers.dev?prompt=${prompt}`, {
            method: "POST",
            // headers: {
            //     "Content-Type": "application/json",
            // },
            // body: JSON.stringify({ prompt }),
        }).then(async (res) => {
            if (res.ok) return res.text();
            else throw await res.text();
        });

        interval = setInterval(getGen, 1000 * 5);

        // After `interval` so the "Generate" button will disable immediately
        await getGen();
    }
    async function getGen() {
        if (!id) return;

        url.searchParams.set("id", id);
        window.history.replaceState({}, '', url);

        return fetch(`https://smol-workflow.sdf-ecosystem.workers.dev?id=${id}`)
            .then(async (res) => {
                if (res.ok) return res.json();
                else throw await res.text();
            })
            .then((res) => {
                console.log(res);

                prompt = "";
                data = res.do.map(([, d]: any) => d);

                switch (res.steps.status) {
                    case 'errored':
                    case 'terminated':
                    case 'complete':
                    case 'unknown':
                        if (interval) {
                            clearInterval(interval);
                            interval = null
                        }

                        if (res.steps.status !== 'complete') {
                            // TODO show step failures in the UI vs using alert
                            alert(`Failed with status: ${res.steps.status}`);
                        }
                    break;
                }

                return res;
            });
    }
</script>

<!-- Add loading icons -->

<div class="px-2 py-10">
    <div class="flex flex-col items-center max-w-[1024px] mx-auto">
        <form
            class="flex flex-col items-end max-w-[512px] w-full"
            on:submit|preventDefault={postGen}
        >
            <textarea
                class="border p-2 mb-2 w-full"
                placeholder="Write an epic prompt for an even epic'er gen"
                rows="4"
                bind:value={prompt}
            ></textarea>
            <button type="submit" class="text-white bg-indigo-500 px-5 py-1 disabled:bg-gray-400" disabled={!prompt || !!interval}
                >⚡︎ Generate</button
            >
            <aside class="text-xs mt-1 self-start">
                * Will take roughly 5 minutes to fully generate. <br> Even longer during times of heavy load.
            </aside>
        </form>

        <ul class="mt-10 max-w-[512px] w-full [&>li]:mb-5 [&>li>h1]:font-bold">
            <li>
                <h1>Id:</h1>
                <pre><code class="text-xs">{id}</code></pre>
            </li>

            <li>
                <h1>Prompt:</h1>
                <p>{data && data?.[0]}</p>
            </li>

            <li>
                <h1 class="mb-2">
                    Image: (powered by <a
                        class="underline"
                        href="https://www.pixellab.ai/">PixelLab</a
                    >)
                </h1>

                {#if data && data?.[1]}
                    <img
                        class="aspect-square object-contain rendering-pixelated w-[256px]"
                        src={`data:image/png;base64,${data?.[1]}`}
                    />
                {/if}
            </li>

            <li>
                <h1>Description:</h1>
                <p>{data && data?.[2]}</p>
            </li>

            <li>
                <h1 class="mb-2">
                    Songs: (powered by <a
                        class="underline"
                        href="https://aisonggenerator.io/">AI Song Generator</a
                    >)
                </h1>
                
                {#each data && data?.[5] as song}
                    <audio class="mb-2" controls>
                        <source src={song.audio} type="audio/mpeg" />
                        Your browser does not support the audio element.
                    </audio>
                {/each}
            </li>

            <li>
                <h1>Lyrics:</h1>
                <pre class="[&>code]:text-xs"><code>Title: <strong>{data && data?.[3]?.title}</strong></code>
<code>Tags: <em>{data && data?.[3]?.style.join(', ')}</em></code>

<code>{data && data?.[3]?.lyrics}</code></pre>
            </li>
        </ul>
    </div>
</div>
