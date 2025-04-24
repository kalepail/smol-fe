<script lang="ts">
    export let results: any;
</script>

<ul class="flex flex-wrap">
    {#each results as smol}
        <li class="relative w-1/3 sm:w-1/6 lg:w-1/9 flex">
            <img class="aspect-square object-contain pixelated w-full" src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`} alt="">
            <a class="absolute inset-0" href={`/${smol.Id}`}></a>
        </li>
    {/each}
</ul>