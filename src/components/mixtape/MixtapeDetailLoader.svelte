<script lang="ts">
    import { onMount } from "svelte";
    import Loader from "../ui/Loader.svelte";
    import MixtapeDetailView from "./MixtapeDetailView.svelte";
    import { getMixtapeDetail, type MixtapeDetail } from "../../services/api/mixtapes";

    interface Props {
        mixtapeId: string;
    }

    let { mixtapeId }: Props = $props();

    let mixtape = $state<MixtapeDetail | null>(null);
    let loading = $state(true);

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

