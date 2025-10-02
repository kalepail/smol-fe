<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { account, kale, server } from "../utils/passkey-kit";
    import { rpc, truncate } from "../utils/base";
    import { contractId } from "../store/contractId";
    import { keyId } from "../store/keyId";
    import { contractBalance, updateContractBalance } from "../store/contractBalance";

    let to = "";
    let amount = "";
    let submitting = false;
    let error: string | null = null;
    let success: string | null = null;
    let kaleDecimals = 7;
    let decimalsFactor = 10n ** 7n;

    let currentContractId: string | null = null;
    let currentKeyId: string | null = null;

    const balanceStore = contractBalance;

    const unsubContract = contractId.subscribe((value) => {
        currentContractId = value;
    });
    const unsubKey = keyId.subscribe((value) => {
        currentKeyId = value;
    });

    onDestroy(() => {
        unsubContract();
        unsubKey();
    });

    onMount(async () => {
        try {
            const { result } = await kale.decimals();
            kaleDecimals = Number(result);
            decimalsFactor = 10n ** BigInt(kaleDecimals);
        } catch (err) {
            console.error("Failed to load KALE decimals", err);
            kaleDecimals = 7;
            decimalsFactor = 10n ** 7n;
        }

        if (currentContractId) {
            await updateContractBalance(currentContractId);
        }
    });

    function parseAmount(value: string | number): bigint | null {
        const sanitized = String(value).trim();
        if (!sanitized) return null;
        if (!/^\d+$/.test(sanitized)) {
            return null;
        }
        try {
            const baseUnits = BigInt(sanitized);
            if (baseUnits <= 0n) return null;
            return baseUnits * decimalsFactor;
        } catch (err) {
            return null;
        }
    }

    function formatKaleBalance(balance: bigint): string {
        const whole = balance / decimalsFactor;
        const fraction = balance % decimalsFactor;
        const intWithCommas = whole
            .toString()
            .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

        if (fraction === 0n) {
            return intWithCommas;
        }

        let fractionStr = fraction.toString().padStart(kaleDecimals, "0");
        fractionStr = fractionStr.replace(/0+$/, "");

        return fractionStr ? `${intWithCommas}.${fractionStr}` : intWithCommas;
    }

    async function sendKale() {
        error = null;
        success = null;

        if (!currentContractId || !currentKeyId) {
            error = "Connect your wallet before sending KALE.";
            return;
        }

        const destination = to.trim();
        if (!destination) {
            error = "Enter a destination address.";
            return;
        }

        if (destination === currentContractId) {
            error = "You already control this address.";
            return;
        }

        const amountInUnits = parseAmount(amount);
        if (!amountInUnits) {
            error = "Enter a valid whole-number amount.";
            return;
        }

        const currentBalance = get(balanceStore);
        if (typeof currentBalance === "bigint" && amountInUnits > currentBalance) {
            error = "Amount exceeds available balance.";
            return;
        }

        submitting = true;
        try {
            let tx = await kale.transfer({
                from: currentContractId,
                to: destination,
                amount: amountInUnits,
            });

            const { sequence } = await rpc.getLatestLedger();
            tx = await account.sign(tx, {
                keyId: currentKeyId,
                expiration: sequence + 60,
            });

            await server.send(tx);

            await updateContractBalance(currentContractId);

            const displayAmount = formatKaleBalance(amountInUnits);
            success = `Sent ${displayAmount} KALE to ${truncate(destination, 4)}`;
            to = "";
            amount = "";
        } catch (err) {
            console.error("Failed to send KALE", err);
            error = err instanceof Error ? err.message : "Transfer failed";
        } finally {
            submitting = false;
        }
    }
</script>

<div class="max-w-[480px] mx-auto px-4 py-10">
    <h2 class="text-2xl font-semibold text-lime-400 mb-4">Account</h2>

    {#if !currentContractId}
        <p class="rounded bg-slate-800/80 border border-slate-700 p-4 text-sm text-slate-200">
            Connect your wallet from the header to manage your KALE.
        </p>
    {:else}
        <div class="space-y-6">
            <div class="rounded bg-slate-800/80 border border-slate-700 p-4">
                <p class="text-sm text-slate-300">Connected address</p>
                <p class="font-mono break-all text-slate-100">{currentContractId}</p>
                {#if typeof $balanceStore === "bigint"}
                    <p class="mt-2 text-sm text-lime-300">
                        Balance: {formatKaleBalance($balanceStore)} KALE
                    </p>
                {/if}
            </div>

            <form class="rounded bg-slate-800/80 border border-slate-700 p-4 space-y-4" on:submit|preventDefault={sendKale}>
                <div>
                    <label class="block text-sm text-slate-300 mb-1" for="account-to">Send to</label>
                    <input
                        id="account-to"
                        type="text"
                        class="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-lime-400 focus:outline-none"
                        bind:value={to}
                        placeholder="Enter recipient address"
                        autocomplete="off"
                        required
                    />
                </div>

                <div>
                    <label class="block text-sm text-slate-300 mb-1" for="account-amount">Amount (KALE)</label>
                    <input
                        id="account-amount"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        step="1"
                        class="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:border-lime-400 focus:outline-none"
                        bind:value={amount}
                        placeholder="Whole number of KALE"
                        required
                    />
                </div>

                {#if error}
                    <p class="rounded border border-rose-500 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p>
                {/if}
                {#if success}
                    <p class="rounded border border-lime-500 bg-lime-500/10 px-3 py-2 text-sm text-lime-200">{success}</p>
                {/if}

                <button
                    type="submit"
                    class="w-full rounded bg-lime-500 px-4 py-2 text-base font-semibold text-slate-900 hover:bg-lime-400 disabled:opacity-60"
                    disabled={submitting}
                >
                    {submitting ? "Sending..." : "Send KALE"}
                </button>
            </form>
        </div>
    {/if}
</div>
