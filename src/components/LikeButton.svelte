<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Loader from "./Loader.svelte";
    import { contractId } from "../store/contractId";
    import { toggleLike } from "../utils/like";

    export let smolId: string;
    export let liked: boolean = false;
    export let classNames: string = "p-2 rounded-lg backdrop-blur-xs hover:bg-slate-950/70 transition-colors";
    export let iconSize: string = "size-5";

    const dispatch = createEventDispatcher<{
        likeChanged: { smolId: string; liked: boolean };
    }>();

    let liking = false;

    async function handleLike() {
        if (!$contractId || liking) return;

        try {
            liking = true;
            const newLikedState = await toggleLike(smolId, liked);
            liked = newLikedState;
            dispatch("likeChanged", { smolId, liked: newLikedState });
        } catch (error) {
            console.error("Failed to toggle like:", error);
            alert(error instanceof Error ? error.message : "Failed to like/unlike");
        } finally {
            liking = false;
        }
    }
</script>

{#if $contractId}
    <button
        class={classNames}
        aria-label={liked ? "Unlike" : "Like"}
        disabled={liking}
        on:click={handleLike}
    >
        {#if liking}
            <Loader classNames={iconSize} />
        {:else if liked}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                class={iconSize}
            >
                <path
                    d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"
                />
            </svg>
        {:else}
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class={iconSize}
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                />
            </svg>
        {/if}
    </button>
{/if}
