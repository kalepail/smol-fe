<script lang="ts">
    import type { MixtapeSummary } from "../../services/api/mixtapes";

    interface Props {
        mixtapes?: MixtapeSummary[];
    }

    let { mixtapes = [] }: Props = $props();

    function handlePlayAll(mixtapeId: string) {
        // Navigate to mixtape detail page with autoplay parameter
        window.location.href = `/mixtapes/${mixtapeId}?autoplay=true`;
    }
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each mixtapes as mixtape (mixtape.id)}
        <article class="flex flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg">
            <a href={`/mixtapes/${mixtape.id}`} class="grid grid-cols-2 grid-rows-2 gap-1 rounded-xl overflow-hidden bg-slate-800 hover:ring-2 hover:ring-lime-500 transition-all">
                {#each Array.from({ length: 4 }) as _, index}
                    <div class="aspect-square bg-slate-900">
                        {#if mixtape.coverUrls[index]}
                            <img
                                src={`${mixtape.coverUrls[index]}${mixtape.coverUrls[index]?.includes("?") ? "" : "?scale=4"}`}
                                alt={mixtape.title}
                                class="h-full w-full object-cover pixelated"
                                loading="lazy"
                                onerror={(e) => {
                                    // @ts-ignore
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        {:else}
                            <div class="flex h-full w-full items-center justify-center text-xs text-slate-500">
                                SMOL
                            </div>
                        {/if}
                    </div>
                {/each}
            </a>

            <div class="mt-4 flex flex-col gap-2">
                <h3 class="text-lg font-semibold text-white">{mixtape.title}</h3>
                <p class="line-clamp-3 text-sm text-slate-400">{mixtape.description}</p>
                <p class="text-xs uppercase tracking-wide text-slate-500">
                    {mixtape.trackCount} Smol{mixtape.trackCount === 1 ? "" : "s"}
                </p>
            </div>

            <div class="mt-auto flex flex-col gap-2 pt-4">
                <button
                    class="rounded bg-lime-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-300"
                    onclick={() => handlePlayAll(mixtape.id)}
                >Play All</button>

                <a
                    class="rounded border border-slate-600 px-3 py-2 text-center text-sm text-slate-200 hover:bg-slate-800"
                    href={`/mixtapes/${mixtape.id}`}
                >View Mixtape</a>
            </div>
        </article>
    {/each}

    {#if mixtapes.length === 0}
        <div class="col-span-full rounded border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
            No mixtapes yet. Publish one to see it here!
        </div>
    {/if}
</div>

