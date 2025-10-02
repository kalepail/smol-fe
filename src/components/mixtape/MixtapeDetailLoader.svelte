<script lang="ts">
    import { onMount } from "svelte";
    import Loader from "../Loader.svelte";
    import MixtapeDetailView from "./MixtapeDetailView.svelte";
    import { getMixtapeDetail, type MixtapeDetail } from "../../utils/api/mixtapes";

    export let mixtapeId: string;

    let mixtape: MixtapeDetail | null = null;
    let loading = true;

    onMount(async () => {
        loading = true;
        try {
            mixtape = await getMixtapeDetail(mixtapeId);
        } finally {
            loading = false;
        }
    });
</script>

{#if loading}
    <div class="flex justify-center py-10">
        <Loader classNames="w-10 h-10" />
    </div>
{:else}
    <MixtapeDetailView {mixtape} />
{/if}

