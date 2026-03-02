<script lang="ts">
    let { open = $bindable(false) } = $props();

    function closeModal() {
        open = false;
        localStorage.setItem("smolmart_policy_seen", "true");
    }
</script>

{#if open}
    <!-- Backdrop -->
    <div
        class="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
        onclick={closeModal}
    >
        <!-- Modal -->
        <div
            class="bg-black border-4 border-[#9ae600] max-w-lg w-full p-6 relative shadow-[8px_8px_0px_0px_#9ae600]"
            onclick={(e) => e.stopPropagation()}
            style="image-rendering: pixelated;"
        >
            <!-- Close button -->
            <button
                class="absolute top-2 right-2 text-white/60 hover:text-white text-xl font-bold w-8 h-8 flex items-center justify-center"
                onclick={closeModal}
            >
                ×
            </button>

            <!-- Header -->
            <h2
                class="text-[#9ae600] text-lg md:text-xl font-black uppercase tracking-widest text-center mb-4 font-pixel"
            >
                ✨ WELCOME ✨
            </h2>

            <!-- Content -->
            <div
                class="space-y-4 text-white/80 text-xs md:text-sm uppercase tracking-wider leading-relaxed font-pixel"
            >
                <p
                    class="text-center border-2 border-[#9ae600]/30 p-3 bg-[#9ae600]/5"
                >
                    <span class="text-[#9ae600]">SMOL</span><span
                        class="text-white">MART</span
                    >
                    is in
                    <span class="text-[#FDDA24] font-bold">PRE-ALPHA</span>
                </p>

                <div class="space-y-2">
                    <p>
                        ▸ These features are <span class="text-[#FDDA24]"
                            >experimental</span
                        >
                    </p>
                    <p>▸ I'm a new developer learning as I go</p>
                    <p>▸ Things might break or change</p>
                </div>

                <div class="border-t-2 border-white/10 pt-4">
                    <p class="text-white/60 text-[10px] mb-2">NEED HELP?</p>
                    <p>
                        I'm on <a
                            href="https://discord.com/invite/stellar-global-761985725453303838"
                            target="_blank"
                            class="text-[#7289da] underline hover:text-white"
                            >Stellar Global Discord</a
                        >
                        as
                        <a
                            href="https://discord.com/users/879735983971647499"
                            target="_blank"
                            class="text-[#FDDA24] underline hover:text-white"
                            >noot.xlm</a
                        >
                    </p>
                    <p class="mt-2">I'll do my best to help with:</p>
                    <ul
                        class="list-none space-y-1 mt-1 text-[10px] text-white/60"
                    >
                        <li>• Troubleshooting issues</li>
                        <li>• Reasonable refund requests</li>
                        <li>• Feature questions</li>
                        <li>• General support</li>
                    </ul>
                </div>
            </div>

            <!-- Accept button -->
            <button
                class="w-full mt-6 py-3 bg-[#9ae600] text-black font-black uppercase tracking-widest text-sm hover:bg-[#b5ff1a] transition-colors border-4 border-black"
                onclick={closeModal}
            >
                I UNDERSTAND
            </button>
        </div>
    </div>
{/if}
