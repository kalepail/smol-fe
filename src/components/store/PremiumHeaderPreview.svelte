<script lang="ts">
    import { userState } from "../../stores/user.svelte.ts";

    let images = $state<string[]>([]);
    let loading = $state(false);

    $effect(() => {
        const address = userState.contractId;
        if (address && images.length === 0) {
            fetchUserSmols(address);
        }
    });

    async function fetchUserSmols(address: string) {
        loading = true;
        try {
            const res = await fetch(
                `${import.meta.env.PUBLIC_API_URL}/smols/createdby/${address}`,
            );
            if (res.ok) {
                const smols = await res.json();
                const urls = smols
                    .filter((s: any) => s.Id)
                    .slice(0, 16)
                    .map(
                        (s: any) =>
                            `${import.meta.env.PUBLIC_API_URL}/image/${s.Id}.png?scale=8`,
                    );
                images = urls;
            }
        } catch (e) {
            console.error("[PremiumPreview] Failed to fetch smols", e);
        } finally {
            loading = false;
        }
    }
</script>

<div
    class="aspect-video bg-[#111] border-4 border-white/20 relative overflow-hidden group-hover:border-[#9ae600] transition-none"
>
    {#if images.length > 0}
        <!-- User's actual smols -->
        <div
            class="absolute inset-0 flex flex-wrap content-start animate-slide-up"
        >
            {#each images as img}
                <div class="w-1/4 aspect-square relative overflow-hidden">
                    <img
                        src={img}
                        alt="preview"
                        class="w-full h-full object-cover opacity-80"
                        loading="lazy"
                    />
                </div>
            {/each}
        </div>
        <!-- Dark overlay -->
        <div class="absolute inset-0 bg-black/40"></div>
        <div
            class="absolute bottom-2 left-2 text-[8px] text-white/60 uppercase tracking-widest font-mono"
        >
            Your Discography Preview
        </div>
    {:else if loading}
        <!-- Loading state -->
        <div class="absolute inset-0 flex items-center justify-center">
            <div
                class="text-white/40 text-xs uppercase tracking-widest animate-pulse"
            >
                Loading...
            </div>
        </div>
    {:else}
        <!-- Fallback placeholder grid -->
        <div
            class="absolute inset-0 opacity-50"
            style="image-rendering: pixelated;"
        >
            <div
                class="absolute inset-0 flex flex-wrap content-start opacity-40"
            >
                {#each Array(16) as _}
                    <div
                        class="w-1/4 aspect-square bg-white/10 border border-black/20"
                    ></div>
                {/each}
                <div
                    class="absolute inset-0 bg-gradient-to-r from-transparent via-[#9ae600]/20 to-transparent animate-pulse"
                ></div>
            </div>
        </div>
        <div
            class="absolute bottom-2 left-2 text-[8px] text-white/40 uppercase tracking-widest font-mono"
        >
            Connect wallet to preview
        </div>
    {/if}
</div>
