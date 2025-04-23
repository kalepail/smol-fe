<script lang="ts">
    export let results: any;
</script>

<ul class="flex flex-wrap">
    {#each results as id}
        <li class="relative w-1/3 sm:w-1/6 lg:w-1/9 flex">
            <img class="aspect-square object-contain pixelated w-full" src={`https://smol-workflow.sdf-ecosystem.workers.dev/image/${id}.png`} alt="">
            <a class="absolute inset-0" href={`/${id}`}></a>
        </li>
    {/each}
</ul>