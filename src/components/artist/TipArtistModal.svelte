<script lang="ts">
    import { onMount } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { account, kale, server } from "../../utils/passkey-kit";
    import { rpc, truncate } from "../../utils/base";
    import { userState } from "../../stores/user.svelte";
    import { unlockUpgrade } from "../../stores/upgrades.svelte";
    import {
        balanceState,
        updateContractBalance,
    } from "../../stores/balance.svelte";
    import { getDomain } from "tldts";
    import { StrKey } from "@stellar/stellar-sdk";
    import Loader from "../ui/Loader.svelte";

    let {
        artistAddress,
        artistName = "Artist",
        onClose,
    }: {
        artistAddress: string;
        artistName?: string;
        onClose: () => void;
    } = $props();

    let amount = $state("");
    let submitting = $state(false);
    let error = $state<string | null>(null);
    let success = $state<string | null>(null);
    let kaleDecimals = $state(7);
    let decimalsFactor = $state(10n ** 7n);

    // Lock address at mount time to prevent reactive changes mid-transaction
    let lockedArtistAddress = $state("");
    const isValidArtistAddress = $derived(
        lockedArtistAddress &&
            (StrKey.isValidEd25519PublicKey(lockedArtistAddress) ||
                StrKey.isValidContract(lockedArtistAddress)),
    );

    onMount(async () => {
        // Lock address immediately on mount to prevent reactive changes
        lockedArtistAddress = artistAddress?.trim() || "";

        // If address is invalid at mount time, close immediately
        if (!lockedArtistAddress) {
            console.warn("Invalid artist address at mount, closing modal");
            onClose();
            return;
        }

        try {
            const { result } = await kale.decimals();
            kaleDecimals = Number(result);
            decimalsFactor = 10n ** BigInt(kaleDecimals);
        } catch (err) {
            console.error("Failed to load KALE decimals", err);
            // Fallback
            kaleDecimals = 7;
            decimalsFactor = 10n ** 7n;
        }

        if (userState.contractId) {
            await updateContractBalance(userState.contractId);
        }
    });

    function parseAmount(value: string | number): bigint | null {
        const sanitized = String(value).trim().replace(/,/g, "");
        if (!sanitized) return null;

        try {
            // Handle decimals by splitting and padding
            const [integerPart, fractionalPart = ""] = sanitized.split(".");
            if (
                !/^\d+$/.test(integerPart) ||
                (fractionalPart && !/^\d+$/.test(fractionalPart))
            ) {
                return null;
            }

            const integerBig = BigInt(integerPart) * decimalsFactor;

            // Pad or truncate fractional part to match decimals
            let fractionBig = 0n;
            if (fractionalPart) {
                const paddedFraction = fractionalPart
                    .padEnd(kaleDecimals, "0")
                    .slice(0, kaleDecimals);
                fractionBig = BigInt(paddedFraction);
            }

            const total = integerBig + fractionBig;
            if (total <= 0n) return null;
            return total;
        } catch (err) {
            return null;
        }
    }

    async function handleSend() {
        error = null;
        success = null;

        if (!userState.contractId || !userState.keyId) {
            error = "Please connect your wallet first.";
            return;
        }

        if (!isValidArtistAddress) {
            error = "Enter a valid recipient address.";
            return;
        }

        const amountInUnits = parseAmount(amount);
        if (!amountInUnits) {
            error = "Enter a valid whole number amount.";
            return;
        }

        const currentBalance = balanceState.balance;
        if (
            typeof currentBalance === "bigint" &&
            amountInUnits > currentBalance
        ) {
            error = "Insufficient balance.";
            return;
        }

        submitting = true;
        try {
            // Final guard: ensure locked address is still valid before transaction
            if (!lockedArtistAddress || !StrKey.isValidEd25519PublicKey(lockedArtistAddress) && !StrKey.isValidContract(lockedArtistAddress)) {
                error = "Recipient address is invalid. Please try again.";
                submitting = false;
                return;
            }

            let tx = await kale.transfer({
                from: userState.contractId,
                to: lockedArtistAddress,
                amount: amountInUnits,
            });

            const { sequence } = await rpc.getLatestLedger();
            tx = await account.sign(tx, {
                rpId: getDomain(window.location.hostname) ?? undefined,
                keyId: userState.keyId,
                expiration: sequence + 60,
            });

            await server.send(tx);
            await updateContractBalance(userState.contractId);

            // Secret Store Unlock Logic
            const amountNum = parseFloat(amount.replace(/,/g, ""));
            const adminAddress =
                "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";

            if (lockedArtistAddress === adminAddress) {
                if (amountNum === 100000) {
                    unlockUpgrade("premiumHeader");
                    success = `Sent ${amount} KALE! Premium Profile Header Unlocked! 🥬✨`;
                } else if (amountNum === 69420.67) {
                    unlockUpgrade("goldenKale");
                    success = `Sent ${amount} KALE! The Golden Kale Unlocked! 🪙🥬`;
                } else {
                    success = `Sent ${amount} KALE to ${artistName}!`;
                }
            } else {
                success = `Sent ${amount} KALE to ${artistName}!`;
            }
            amount = "";
        } catch (err: any) {
            console.error("Tip failed", err);
            error = err.message || "Failed to send tip.";
        } finally {
            submitting = false;
        }
    }
</script>

<div
    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    transition:fade
    onclick={onClose}
>
    <div
        class="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-6 relative"
        transition:scale={{ start: 0.95 }}
        onclick={(e) => e.stopPropagation()}
    >
        <button
            onclick={onClose}
            class="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-6 h-6"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                />
            </svg>
        </button>

        <div class="text-center mb-6">
            <div class="mb-2 flex justify-center">
                <img
                    src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                    alt="Kale"
                    class="w-10 h-10 object-contain filter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                />
            </div>
            <h2 class="text-xl font-bold text-white">Tip {artistName}</h2>
            <p class="text-white/40 text-xs font-mono mt-2 break-all">
                {lockedArtistAddress || "Unavailable address"}
            </p>
        </div>

        {#if !userState.contractId}
            <div
                class="text-center p-4 rounded bg-white/5 border border-white/10"
            >
                <p class="text-white/60 mb-2">Connect wallet to send tips.</p>
            </div>
        {:else}
            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                }}
                class="space-y-4"
            >
                <div>
                    <label
                        class="block text-xs tracking-widest text-white/40 mb-2 font-bold"
                        for="tip-amount"
                    >
                        Amount (KALE)
                    </label>
                    <div class="relative">
                        <input
                            id="tip-amount"
                            type="text"
                            bind:value={amount}
                            placeholder="100,000"
                            class="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-500/50 transition-colors font-mono text-lg"
                            disabled={submitting}
                        />
                        <div
                            class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 font-bold"
                        >
                            KALE
                        </div>
                    </div>
                    {#if typeof balanceState.balance === "bigint"}
                        <div
                            class="text-right mt-2 text-[10px] text-white/40 tracking-widest"
                        >
                            Available: <span class="text-white/60"
                                >{Number(balanceState.balance) /
                                    Number(decimalsFactor)}</span
                            > KALE
                        </div>
                    {/if}
                </div>

                {#if error}
                    <div
                        class="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
                    >
                        {error}
                    </div>
                {/if}

                {#if success}
                    <div
                        class="p-3 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center"
                    >
                        {success}
                    </div>
                {/if}

                <button
                    type="submit"
                    disabled={submitting || !amount || !isValidArtistAddress}
                    class="w-full py-3 bg-green-500 text-black font-bold rounded-xl hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all tracking-widest text-xs shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center justify-center gap-2"
                >
                    {#if submitting}
                        <Loader classNames="w-4 h-4" textColor="text-black" /> Sending...
                    {:else}
                        Send Tip <img
                            src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
                            alt="Kale"
                            class="w-4 h-4 object-contain"
                        />
                    {/if}
                </button>
            </form>
        {/if}
    </div>
</div>
