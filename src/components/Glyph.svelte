<script lang="ts">
    export let id;

    import { onMount } from "svelte";
    import { pixelToHex, WHITE } from "../utils";

    let glyph: {
        id: number
        author: string
        owner: string
        title?: string
        story?: string
        colors: number[]
        legend: number[]
        width: number
    };
    
    $: pixelsUniq = glyph?.colors.reduce(
        (map, value) => {
            let color = glyph.legend[value];
            return map.set(color, (map.get(color) || 0) + 1)
        },
        new Map<number, number>(),
    );

    onMount(async () => {
        glyph = await fetch(
            `https://smol-be.sdf-ecosystem.workers.dev/glyph/${id}`
        ).then((res) => res.json());
    });
</script>

<div class="px-2 py-10">
    <div class="flex max-w-[1024px] mx-auto">
        <!-- TODO include the 3 little glyph previews -->

        <div class="flex flex-col">
            <!-- Pixel Grid -->
            <div class="w-[448px] aspect-square shadow-[0_0_0_1px] shadow-gray-200">
                <img class="w-full object-contain pixelated" src={`https://smol-be.sdf-ecosystem.workers.dev/glyph/${id}.png`} alt={glyph?.title} />
            </div>
        </div>

        <div class="flex flex-col ml-10 w-full">
            <!-- Title & Story -->
            <div class="flex flex-col">
                <h1 class="text-3xl font-bold mb-3">{glyph?.title}</h1>
                <p>{glyph?.story}</p>
            </div>

            <!-- Actions -->
            <div class="flex mt-10">
                <button class="text-white bg-indigo-500 px-2 py-1"
                    >⚡︎ Trade</button
                >
            </div>

            <!-- Palette -->
            <div class="flex flex-wrap mt-auto select-none">
                {#each pixelsUniq as [pixel, count]}
                    <div>
                        <div
                            class="w-[32px] aspect-square border"
                            style="background-color: #{pixelToHex(pixel)}; {pixel === WHITE
                                ? null
                                : `border-color: #${pixelToHex(pixel)};`}"
                        ></div>
                        <span class="text-xs font-mono">{count}</span>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</div>

