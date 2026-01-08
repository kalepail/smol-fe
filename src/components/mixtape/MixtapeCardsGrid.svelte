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

<div class="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
    {#each mixtapes as mixtape (mixtape.id)}
        <article
            class="group flex flex-col rounded-xl md:rounded-[2.5rem] border border-white/5 bg-black/20 backdrop-blur-md p-3 md:p-5 shadow-2xl transition-all hover:bg-black/40 hover:-translate-y-1 mx-auto w-full max-w-md md:max-w-none"
        >
            <a
                href={`/mixtapes/${mixtape.id}`}
                class="grid grid-cols-2 grid-rows-2 gap-[2px] rounded-2xl overflow-hidden border border-white/5 group-hover:border-lime-500/50 transition-colors"
            >
                {#each Array.from({ length: 4 }) as _, index}
                    <div class="aspect-square bg-[#111]">
                        {#if mixtape.coverUrls[index]}
                            <img
                                src={`${mixtape.coverUrls[index]}${mixtape.coverUrls[index]?.includes("?") ? "" : "?scale=4"}`}
                                alt={mixtape.title}
                                class="h-full w-full object-cover pixelated opacity-80 hover:opacity-100 transition-opacity"
                                loading="lazy"
                                onerror={(e) => {
                                    // @ts-ignore
                                    e.currentTarget.style.display = "none";
                                }}
                            />
                        {:else}
                            <div
                                class="flex h-full w-full items-center justify-center text-[10px] font-pixel text-slate-700"
                            >
                                SMOL
                            </div>
                        {/if}
                    </div>
                {/each}
            </a>

            <div class="mt-3 md:mt-5 flex flex-col gap-2">
                <div class="flex justify-between items-start gap-4">
                    <h3
                        class="text-sm font-pixel font-bold uppercase tracking-widest text-lime-400 line-clamp-3 break-words"
                    >
                        {mixtape.title}
                    </h3>
                    <span
                        class="shrink-0 text-[10px] font-pixel text-[#d836ff] uppercase"
                        >{mixtape.trackCount} TRK</span
                    >
                </div>
                <p
                    class="line-clamp-3 text-[8px] font-pixel uppercase leading-relaxed text-slate-500"
                >
                    {mixtape.description}
                </p>
            </div>

            <div class="mt-auto flex flex-col gap-2 pt-3 md:pt-5">
                <button
                    class="w-full rounded-lg md:rounded-xl bg-lime-400/10 border border-lime-400/20 px-3 py-2 md:py-3 text-[10px] font-pixel font-bold uppercase tracking-widest text-lime-400 hover:bg-lime-400 hover:text-black hover:shadow-[0_0_20px_rgba(163,230,53,0.3)] transition-all duration-300"
                    onclick={() => handlePlayAll(mixtape.id)}
                    >Play Cassette</button
                >

                <a
                    class="w-full rounded-lg md:rounded-xl border border-white/5 bg-transparent px-3 py-2 md:py-3 text-center text-[10px] font-pixel uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                    href={`/mixtapes/${mixtape.id}`}>View Tracklist</a
                >
            </div>
        </article>
    {/each}

    {#if mixtapes.length === 0}
        <div
            class="col-span-full rounded border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center text-sm text-slate-400"
        >
            No mixtapes yet. Publish one to see it here!
        </div>
    {/if}
</div>
