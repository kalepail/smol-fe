<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { kit } from "../../lib/the-vip/swk";

    const dispatch = createEventDispatcher();
    let isLoading = false;

    async function connect() {
        isLoading = true;
        try {
            await kit.openModal({
                onWalletSelected: async (option) => {
                    kit.setWallet(option.id);
                    const { address } = await kit.getAddress();
                    dispatch("connect", { publicKey: address });
                },
            });
        } catch (e) {
            console.error(e);
            dispatch("error", e);
        } finally {
            isLoading = false;
        }
    }
</script>

<button
    on:click={connect}
    disabled={isLoading}
    class="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-wait"
>
    {isLoading ? "Connecting..." : "CONNECT WALLET"}
</button>
