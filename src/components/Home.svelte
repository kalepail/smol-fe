<script lang="ts">
    import { onMount } from "svelte";

    let glyphs: {
        id: number
        author: string
        owner: string
        title: string
        story: string
    }[] = [];

    onMount(async () => {
        glyphs = await fetch(
            "https://smol-be.sdf-ecosystem.workers.dev/glyphs",
        ).then((res) => res.json());
    });
</script>

<!-- 
    Create
    
    My Glyphs
    My Offers

    Glyph
        Buy it now
        Make an offer

    My Colors
    Buy Colors
-->

<!-- <table class="text-xs font-mono">
    <thead>
        <tr class="text-left bg-black text-white [&>th]:px-1">
            <th></th>
            <th>Title</th>
            <th>Story</th>
        </tr>
    </thead>
    <tbody>
        {#each glyphs as glyph}
            <tr class="border border-black align-bottom">
                <td class="border-r border-black">
                    <img class="w-[32px] aspect-square object-contain rendering-pixelated" src={`https://smol-be.sdf-ecosystem.workers.dev/glyph/${glyph.id}`} alt={glyph.title} />
                </td>
                <td class="px-2 border-r border-black">{glyph.title}</td>
                <td class="px-2">{glyph.story}</td> -->

                <!-- 
                    Author
                    Hotness?
                    Unique colors
                    Open offers
                    Buy it now
                -->
            <!-- </tr>
        {/each}
    </tbody>
</table> -->

<div class="">
    <ul class="flex flex-wrap">
        {#each glyphs as glyph}
            <li class="w-1/6 p-2">
                <a class="block ring-1 ring-gray-200 shadow-md rounded-md overflow-hidden" href={`/glyph/${glyph.id}`}>
                    <img class="w-full aspect-square object-contain rendering-pixelated border-b border-gray-100" src={`https://smol-be.sdf-ecosystem.workers.dev/glyph/${glyph.id}.png`} alt={glyph.title} />
                    <h1 class="p-2">{glyph.title}</h1>
                </a>
            </li>
        {/each}
    </ul>
</div>