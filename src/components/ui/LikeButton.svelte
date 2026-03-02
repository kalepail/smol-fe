<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import Loader from "./Loader.svelte";
    import { userState, isAuthenticated } from "../../stores/user.state.svelte";
    import { toggleLike } from "../../utils/like";

    interface Props {
        smolId: string;
        liked?: boolean;
        classNames?: string;
        iconSize?: string;
    }

    let {
        smolId,
        liked = false,
        classNames = "p-2 rounded-lg backdrop-blur-xs hover:bg-slate-950/70 transition-colors",
        iconSize = "size-5",
    }: Props = $props();

    const dispatch = createEventDispatcher<{
        likeChanged: { smolId: string; liked: boolean };
    }>();

    let liking = $state(false);
    // Use $state to allow optimistic UI updates (temporary override)
    // The $effect below ensures we stay in sync with the prop
    let localLiked = $state(liked);

    // Sync with prop changes while allowing temporary optimistic overrides
    $effect(() => {
        localLiked = liked;
    });

    async function handleLike() {
        if (!userState.contractId) {
            window.dispatchEvent(new CustomEvent("smol:promote-passkey"));
            return;
        }
        if (liking) return;

        try {
            liking = true;
            const newLikedState = await toggleLike(smolId, localLiked);
            localLiked = newLikedState;
            dispatch("likeChanged", { smolId, liked: newLikedState });

            if (newLikedState) {
                window.dispatchEvent(new CustomEvent("smol:action-like"));
                // Trigger heartbeat animation
                heartBeat = true;
                setTimeout(() => (heartBeat = false), 400);
            }
        } catch (error) {
            console.error("Failed to toggle like:", error);
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("Cookie") || msg.includes("token")) {
                alert(
                    "Session expired or invalid. Please refresh and try again.",
                );
            } else {
                alert(msg || "Failed to like/unlike");
            }
        } finally {
            liking = false;
        }
    }

    let heartBeat = $state(false);
</script>

<button
    class="{classNames} touch-manipulation active:scale-90 transition-transform duration-75 {heartBeat
        ? 'animate-heartbeat text-pink-500'
        : ''}"
    aria-label={localLiked ? "Unlike" : "Like"}
    disabled={liking}
    onclick={handleLike}
>
    {#if liking}
        <Loader classNames={iconSize} />
    {:else if localLiked}
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

<style>
    @keyframes heartbeat {
        0% {
            transform: scale(1);
        }
        25% {
            transform: scale(1.15);
        }
        50% {
            transform: scale(1);
        }
        75% {
            transform: scale(1.15);
        }
        100% {
            transform: scale(1);
        }
    }

    .animate-heartbeat {
        animation: heartbeat 0.4s ease-in-out;
    }
</style>
