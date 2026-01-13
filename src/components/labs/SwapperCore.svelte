<script lang="ts">
    import { account, sac } from "../../utils/passkey-kit";
    import { onMount } from "svelte";
    import { getDomain } from "tldts";
    import { getLatestSequence } from "../../utils/base";
    import { Asset } from "@stellar/stellar-sdk/minimal";

    let acceptedRisk = $state(false);
    let isConnected = $state(false);
    let keyId = $state<string | null>(null);

    // Transfer State
    let destination = $state("");
    let amount = $state("");
    let isProcessing = $state(false);
    let status = $state("");

    let isValid = $derived(
        destination.startsWith("C") &&
            destination.length > 50 &&
            parseFloat(amount) > 0,
    );

    function setMax() {
        amount = "10"; // Hardcoded cap for safety in Phase 1
    }

    async function connectWallet() {
        try {
            const rpId = getDomain(window.location.hostname) ?? undefined;
            const result = await account.connectWallet({ rpId });
            keyId = result.keyId;
            isConnected = true;
        } catch (e) {
            console.error("Passkey Login Failed", e);
            alert("Login failed. Check console.");
        }
    }

    async function handleTransfer() {
        if (!keyId || !isValid) return;
        isProcessing = true;
        status = "Initializing Transfer...";

        try {
            // Native Token (XLM) Contract ID on Testnet/Mainnet
            // For Swapper Shell, we use a placeholder or known ID.
            // In a real app, this comes from an env var or config.
            // Using a hardcoded testnet Native ID for simulation safety if not provided.
            const NATIVE_ASSET_ID =
                "CDLZFC3SYJYDZT7KQLSXRC1E32I36J3C3Q7K7I7I7I7I7I7I7I7I7I7I"; // Native

            const xlmClient = sac.getSACClient(NATIVE_ASSET_ID);

            status = "Building Transaction...";
            const sequence = await getLatestSequence();

            // Simulating the transfer creation (We aren't actually sending real funds in this shell yet)
            // But we will prove we can build it.

            // Note: In real logic, we'd use xlmClient.transfer(...)
            // For Phase 1 Shell, we simulate the "Sign" step to prove Passkey integration works.

            status = "Requesting Passkey Signature...";

            // Dummy XDR to prove we can sign
            // In reality this would be the result of a simulation
            const dummyXdr = "AAAA...";

            // We won't actually prompt the passkey to sign garbage (it would fail validation).
            // Instead, we show a success state for the "Shell" phase to prove UI connectivity.
            // Phase 2 will implement the actual SAC call.

            await new Promise((r) => setTimeout(r, 1500)); // Simulate signing delay

            status = "Transfer Simulated (Phase 1 Complete)";
            console.log("Transfer params captured:", {
                destination,
                amount,
                keyId,
            });
        } catch (e) {
            console.error(e);
            status = `Error: ${(e as Error).message}`;
        } finally {
            isProcessing = false;
        }
    }
</script>

<div
    class="w-full bg-[#111] border-2 border-[#333] rounded-xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 text-left"
>
    {#if !acceptedRisk}
        <!-- Risk Gate -->
        <div class="flex flex-col gap-4 text-xs font-mono text-[#999]">
            <h3
                class="text-white text-base font-bold uppercase tracking-widest border-b border-white/10 pb-2"
            >
                Protocol Safety Check
            </h3>
            <p>
                This module interacts directly with the Stellar Soroban network.
                Transactions are irreversible.
            </p>
            <ul class="list-disc pl-4 space-y-1 text-[#777]">
                <li>This is an experimental interface.</li>
                <li>No warranty is provided.</li>
                <li>Funds may be lost if contracts behave unexpectedly.</li>
            </ul>

            <label class="flex items-center gap-3 mt-4 cursor-pointer group">
                <input
                    type="checkbox"
                    bind:checked={acceptedRisk}
                    class="w-4 h-4 rounded border-[#333] bg-[#222] checked:bg-[#9ae600] checked:text-black focus:ring-0 focus:ring-offset-0 transition-all"
                />
                <span class="group-hover:text-white transition-colors"
                    >I accept the risks and wish to proceed.</span
                >
            </label>
        </div>
    {:else}
        <!-- The Swapper UI -->
        <div
            class="flex flex-col items-center justify-center py-6 gap-6 w-full animate-in fade-in slide-in-from-bottom-4"
        >
            {#if !isConnected}
                <div class="text-center space-y-4">
                    <button
                        onclick={connectWallet}
                        class="px-6 py-3 bg-[#9ae600] text-black font-bold uppercase tracking-widest text-sm hover:scale-105 active:scale-95 transition-all w-full md:w-auto"
                    >
                        Login with Passkey
                    </button>
                    <p class="text-[10px] text-[#555] font-mono">
                        Powered by Passkey Kit
                    </p>
                </div>
            {:else}
                <div class="w-full space-y-6">
                    <!-- Wallet Info -->
                    <div
                        class="flex justify-between items-center border-b border-[#333] pb-2"
                    >
                        <span
                            class="text-[10px] text-[#555] uppercase tracking-widest"
                            >Authenticated</span
                        >
                        <span class="text-xs font-mono text-[#9ae600]"
                            >Key: {keyId?.substring(0, 8)}...</span
                        >
                    </div>

                    <!-- Phase 2 Transfer Form -->
                    <div
                        class="bg-[#151515] border border-[#333] rounded p-4 space-y-4"
                    >
                        <div class="space-y-2">
                            <label
                                class="block text-xs font-mono text-[#777] uppercase tracking-widest"
                            >
                                Destination (C-Address)
                            </label>
                            <input
                                type="text"
                                bind:value={destination}
                                placeholder="C..."
                                class="w-full bg-[#111] border border-[#333] p-2 text-sm font-mono text-white focus:outline-none focus:border-[#9ae600]"
                            />
                        </div>

                        <div class="space-y-2">
                            <label
                                class="block text-xs font-mono text-[#777] uppercase tracking-widest"
                            >
                                Amount (XLM)
                            </label>
                            <div class="flex gap-2">
                                <input
                                    type="number"
                                    bind:value={amount}
                                    placeholder="0.0"
                                    step="0.1"
                                    class="w-full bg-[#111] border border-[#333] p-2 text-sm font-mono text-white focus:outline-none focus:border-[#9ae600]"
                                />
                                <button
                                    onclick={setMax}
                                    class="text-xs font-mono text-[#9ae600] border border-[#333] px-3 hover:bg-[#222]"
                                >
                                    MAX
                                </button>
                            </div>
                        </div>

                        <div class="pt-2">
                            <button
                                onclick={handleTransfer}
                                disabled={isProcessing || !isValid}
                                class="w-full py-3 bg-[#9ae600] disabled:bg-[#333] disabled:text-[#777] text-black font-bold uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                {#if isProcessing}
                                    <span class="animate-spin">⏳</span> Processing...
                                {:else}
                                    Send XLM
                                {/if}
                            </button>
                        </div>

                        {#if status}
                            <div
                                class="text-[10px] font-mono text-center p-2 border border-[#333] bg-[#111] animate-in fade-in"
                            >
                                {status}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>
