<script lang="ts">
    import { onMount } from "svelte";
    import type { Smol } from "../../types/domain";
    import { userState } from "../../stores/user.svelte";
    import { audioState, selectSong } from "../../stores/audio.svelte";
    import Loader from "../ui/Loader.svelte";

    const API_URL = import.meta.env.PUBLIC_API_URL || "https://api.smol.xyz";

    let smols = $state<Smol[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);

    const publishedSmols = $derived(
        smols.filter((s) => s.Public === 1 || s.Public === true),
    );
    const unpublishedSmols = $derived(
        smols.filter((s) => s.Public === 0 || s.Public === false),
    );

    onMount(async () => {
        if (!userState.contractId) {
            loading = false;
            return;
        }

        try {
            const response = await fetch(`${API_URL}/created`, {
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to fetch created smols");
            }

            const data = await response.json();
            smols = Array.isArray(data) ? data : data.smols || [];
        } catch (err) {
            error =
                err instanceof Error
                    ? err.message
                    : "Failed to load your creations";
            console.error("Failed to fetch created smols:", err);
        } finally {
            loading = false;
        }
    });

    function handlePlay(smol: Smol) {
        selectSong({
            Id: smol.Id,
            Title: smol.Title,
            Address: smol.Address,
            Mint_Token: smol.Mint_Token,
            Mint_Amm: smol.Mint_Amm,
        });
    }
</script>

<div class="min-h-screen w-full p-4 pb-24">
    <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-pixel text-lime-400 mb-8">Your Creations</h1>

        {#if loading}
            <div class="flex justify-center items-center py-20">
                <Loader classNames="w-12 h-12" />
            </div>
        {:else if error}
            <div
                class="flex justify-center items-center py-20 text-red-400 text-center"
            >
                <div>
                    <p class="text-xl mb-2">⚠️ Error</p>
                    <p class="text-sm">{error}</p>
                </div>
            </div>
        {:else if !userState.contractId}
            <div class="text-center py-20 text-gray-400">
                <p class="text-xl mb-2">🔐 Not Signed In</p>
                <p class="text-sm">Please sign in to view your creations</p>
            </div>
        {:else if smols.length === 0}
            <div class="text-center py-20 text-gray-400">
                <p class="text-xl mb-2">🎵 No Creations Yet</p>
                <p class="text-sm">
                    Start creating music on the <a
                        href="/create"
                        class="text-lime-400 hover:underline">Create page</a
                    >
                </p>
            </div>
        {:else}
            <!-- Published Section -->
            {#if publishedSmols.length > 0}
                <section class="mb-12">
                    <h2 class="text-xl font-pixel text-white mb-4">
                        Published ({publishedSmols.length})
                    </h2>
                    <div class="space-y-2">
                        {#each publishedSmols as smol (smol.Id)}
                            <div
                                class="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors group"
                            >
                                <!-- Play Button -->
                                <button
                                    onclick={() => handlePlay(smol)}
                                    class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-lime-500/20 hover:bg-lime-500/30 text-lime-400 rounded-lg transition-colors"
                                    aria-label="Play {smol.Title || smol.Id}"
                                >
                                    {#if audioState.playingId === smol.Id}
                                        <svg
                                            class="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path
                                                d="M6,4H10V20H6V4M14,4H18V20H14V4Z"
                                            />
                                        </svg>
                                    {:else}
                                        <svg
                                            class="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                                        </svg>
                                    {/if}
                                </button>

                                <!-- Song Info -->
                                <div class="flex-1 min-w-0">
                                    <a
                                        href="/{smol.Id}"
                                        class="block text-white hover:text-lime-400 font-medium truncate transition-colors"
                                    >
                                        {smol.Title || smol.Id}
                                    </a>
                                    {#if smol.Tags && smol.Tags.length > 0}
                                        <p
                                            class="text-xs text-gray-400 truncate"
                                        >
                                            {smol.Tags.slice(0, 3).join(", ")}
                                        </p>
                                    {/if}
                                </div>

                                <!-- Badges -->
                                <div class="flex items-center gap-2">
                                    {#if smol.Mint_Token}
                                        <span
                                            class="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded font-mono"
                                        >
                                            Minted
                                        </span>
                                    {/if}
                                    <span
                                        class="text-xs px-2 py-1 bg-lime-500/20 text-lime-400 rounded font-mono"
                                    >
                                        Public
                                    </span>
                                </div>
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}

            <!-- Unpublished Section -->
            {#if unpublishedSmols.length > 0}
                <section>
                    <h2 class="text-xl font-pixel text-white mb-4">
                        Unpublished ({unpublishedSmols.length})
                    </h2>
                    <div class="space-y-2">
                        {#each unpublishedSmols as smol (smol.Id)}
                            <div
                                class="flex items-center gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 rounded-lg transition-colors group"
                            >
                                <!-- Play Button -->
                                <button
                                    onclick={() => handlePlay(smol)}
                                    class="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-slate-700/50 hover:bg-slate-700 text-gray-400 rounded-lg transition-colors"
                                    aria-label="Play {smol.Title || smol.Id}"
                                >
                                    {#if audioState.playingId === smol.Id}
                                        <svg
                                            class="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path
                                                d="M6,4H10V20H6V4M14,4H18V20H14V4Z"
                                            />
                                        </svg>
                                    {:else}
                                        <svg
                                            class="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                                        </svg>
                                    {/if}
                                </button>

                                <!-- Song Info -->
                                <div class="flex-1 min-w-0">
                                    <a
                                        href="/{smol.Id}"
                                        class="block text-gray-300 hover:text-white font-medium truncate transition-colors"
                                    >
                                        {smol.Title || smol.Id}
                                    </a>
                                    {#if smol.Tags && smol.Tags.length > 0}
                                        <p
                                            class="text-xs text-gray-500 truncate"
                                        >
                                            {smol.Tags.slice(0, 3).join(", ")}
                                        </p>
                                    {/if}
                                </div>

                                <!-- Badges -->
                                <div class="flex items-center gap-2">
                                    {#if smol.Mint_Token}
                                        <span
                                            class="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded font-mono"
                                        >
                                            Minted
                                        </span>
                                    {/if}
                                    <span
                                        class="text-xs px-2 py-1 bg-gray-700 text-gray-400 rounded font-mono"
                                    >
                                        Private
                                    </span>
                                </div>
                            </div>
                        {/each}
                    </div>
                </section>
            {/if}
        {/if}
    </div>
</div>
