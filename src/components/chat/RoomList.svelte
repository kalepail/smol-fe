<script lang="ts">
    export let rooms: any[] = []; // Typed later
    export let currentRoomId: string | null = null;
    export let onJoin: (id: string) => void;

    // Design: 4 tiles.
    // Lumenauts, Builders, General, Contact.
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each rooms as room}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
            class="
            relative p-6 border rounded-xl transition-all duration-200 cursor-pointer overflow-hidden group
            {room.disabled
                ? 'opacity-50 cursor-not-allowed grayscale'
                : 'hover:border-accent hover:shadow-lg hover:shadow-accent/20'}
            {currentRoomId === room.id
                ? 'border-accent bg-accent/5 ring-1 ring-accent'
                : 'border-white/10 bg-black/40'}
        "
            on:click={() => !room.disabled && onJoin(room.id)}
        >
            <div class="flex justify-between items-start mb-2">
                <h3
                    class="text-xl font-bold font-heading text-white tracking-wide"
                >
                    {room.name}
                </h3>
                {#if !room.unlocked && !room.disabled}
                    <span
                        class="text-xs font-mono text-red-400 border border-red-500/30 px-2 py-0.5 rounded bg-red-900/10"
                    >
                        LOCKED
                    </span>
                {:else if room.unlocked}
                    <span
                        class="text-xs font-mono text-green-400 border border-green-500/30 px-2 py-0.5 rounded bg-green-900/10"
                    >
                        ACCESS
                    </span>
                {/if}
            </div>

            <p class="text-sm text-white/60 mb-4 font-light">
                {room.description}
            </p>

            {#if !room.unlocked && !room.disabled}
                <div
                    class="text-xs text-red-300 font-mono mt-2 flex items-center gap-2"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><rect x="3" y="11" width="18" height="11" rx="2" ry="2"
                        ></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg
                    >
                    PROOF REQUIRED
                </div>
            {/if}

            {#if currentRoomId === room.id}
                <div
                    class="absolute inset-x-0 bottom-0 h-1 bg-accent animate-pulse"
                ></div>
            {/if}
        </div>
    {/each}
</div>
