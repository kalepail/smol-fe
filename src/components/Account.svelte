<script lang="ts">
    import { onMount } from "svelte";
    import { kale } from "../utils/passkey-kit";
    import { truncate } from "../utils/base";
    import { userState } from "../stores/user.state.svelte";
    import { balanceState } from "../stores/balance.state.svelte";
    import { updateContractBalance } from "../stores/balance.svelte";
    import { signAndSend } from "../utils/transaction-helpers";
    import {
        validateAddress,
        parseAndValidateAmount,
        validateSufficientBalance,
    } from "../utils/transaction-validation";
    import { wrapError } from "../utils/errors";
    import KaleEmoji from "./ui/KaleEmoji.svelte";
    import { Turnstile } from "svelte-turnstile";

    let to = $state("");
    let amount = $state("");
    let submitting = $state(false);
    let error = $state<string | null>(null);
    let success = $state<string | null>(null);
    let kaleDecimals = $state(7);
    let decimalsFactor = $state(10n ** 7n);
    let showKaleInfo = $state(false);
    let turnstileToken = $state("");

    onMount(async () => {
        try {
            const { result } = await (await kale.get()).decimals();
            kaleDecimals = Number(result);
            decimalsFactor = 10n ** BigInt(kaleDecimals);
        } catch (err) {
            console.error("Failed to load KALE decimals", err);
            kaleDecimals = 7;
            decimalsFactor = 10n ** 7n;
        }

        if (userState.contractId) {
            await updateContractBalance(userState.contractId);
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

        if (!userState.contractId || !userState.keyId) {
            error = "Connect your wallet before sending KALE.";
            return;
        }

        submitting = true;

        try {
            const destination = to.trim();

            // Validate using unified validation utilities
            validateAddress(destination, "Destination");

            // Check if sending to self
            if (destination === userState.contractId) {
                error = "You already control this address.";
                submitting = false;
                return;
            }

            // Parse and validate amount
            const amountInUnits = parseAndValidateAmount(amount, kaleDecimals);

            // Validate sufficient balance
            validateSufficientBalance(
                amountInUnits,
                balanceState.balance,
                "Transfer amount",
            );

            // Validate Turnstile token
            if (!turnstileToken) {
                error = "Please complete the CAPTCHA.";
                submitting = false;
                return;
            }

            // Build transfer transaction
            const tx = await (
                await kale.get()
            ).transfer({
                from: userState.contractId,
                to: destination,
                amount: amountInUnits,
            });

            // Sign and send with unified helper
            // Automatically: validates, signs, sends, updates balance, handles lock
            const result = await signAndSend(tx, {
                keyId: userState.keyId,
                turnstileToken,
                updateBalance: true,
                contractId: userState.contractId,
                useLock: true, // Prevent concurrent transfers
            });

            if (!result.success) {
                error = result.error || "Transfer failed";
                return;
            }

            const displayAmount = formatKaleBalance(amountInUnits);
            success = `Sent ${displayAmount} KALE to ${truncate(destination, 4)}`;
            to = "";
            amount = "";
        } catch (err) {
            console.error("Failed to send KALE", err);
            const wrappedError = wrapError(err, "Transfer failed");
            error = wrappedError.getUserFriendlyMessage();
        } finally {
            submitting = false;
        }
    }
</script>

<div class="max-w-[480px] mx-auto px-4 py-10">
    <h2 class="text-2xl font-semibold text-lime-400 mb-4">Account</h2>

    {#if !userState.contractId}
        <p
            class="rounded bg-slate-800/80 border border-slate-700 p-4 text-sm text-slate-200"
        >
            Connect your wallet from the header to manage your KALE.
        </p>
    {:else}
        <div class="space-y-6">
            <!-- KALE Info Section -->
            <div
                class="rounded bg-slate-800/80 border border-slate-700 overflow-hidden"
            >
                <button
                    class="w-full p-4 text-left flex items-center justify-between hover:bg-slate-700/50 transition-colors"
                    onclick={() => (showKaleInfo = !showKaleInfo)}
                    type="button"
                >
                    <div class="flex items-center gap-2">
                        <KaleEmoji size="w-5 h-5" />
                        <span class="font-semibold text-lime-400"
                            >What is KALE?</span
                        >
                    </div>
                    <svg
                        class="w-5 h-5 text-slate-400 transition-transform {showKaleInfo
                            ? 'rotate-180'
                            : ''}"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>

                {#if showKaleInfo}
                    <div
                        class="px-4 pt-4 pb-6 space-y-5 text-sm text-slate-300"
                    >
                        <div>
                            <p class="text-slate-100 font-semibold mb-2">
                                The Currency of SMOL
                            </p>
                            <p class="leading-relaxed">
                                KALE is a collaborative farming token on Stellar
                                where you earn rewards by staking, mining
                                hashes, and harvesting - not winner-takes-all,
                                but based on your contribution.
                            </p>
                        </div>

                        <div>
                            <p class="text-slate-100 font-semibold mb-3">
                                Why SMOL Uses KALE
                            </p>
                            <ul class="space-y-3">
                                <li class="flex gap-2">
                                    <span class="text-lime-400 mt-1">•</span>
                                    <div>
                                        <strong class="text-lime-300"
                                            >Minting new smols:</strong
                                        > 100 KALE per track - turn your AI-generated
                                        songs into tradeable NFTs and earn 25-50%
                                        of future trading fees
                                    </div>
                                </li>
                                <li class="flex gap-2">
                                    <span class="text-lime-400 mt-1">•</span>
                                    <div>
                                        <strong class="text-lime-300"
                                            >Buying existing smols:</strong
                                        > ~33 KALE per token via the built-in AMM
                                        (prices fluctuate)
                                    </div>
                                </li>
                                <li class="flex gap-2">
                                    <span class="text-lime-400 mt-1">•</span>
                                    <div>
                                        <strong class="text-lime-300"
                                            >Building mixtapes:</strong
                                        > You need to own the smols (tracks) to add
                                        them to your mixtapes
                                    </div>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <p class="text-slate-100 font-semibold mb-3">
                                How to Get KALE
                            </p>
                            <ol class="space-y-3">
                                <li class="flex gap-3">
                                    <span class="text-lime-400 font-semibold"
                                        >1.</span
                                    >
                                    <div>
                                        <strong>Farm it</strong> at
                                        <a
                                            href="https://kalefarm.xyz"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="text-lime-400 hover:underline"
                                            >kalefarm.xyz</a
                                        >
                                        <p class="text-xs text-slate-400 mt-1">
                                            Plant → Work → Harvest | 2,500 KALE
                                            per block, 5% decay every 30 days
                                        </p>
                                    </div>
                                </li>
                                <li class="flex gap-3">
                                    <span class="text-lime-400 font-semibold"
                                        >2.</span
                                    >
                                    <div>
                                        <strong>Trade for it</strong> on
                                        <a
                                            href="https://stellarx.com/markets/KALE:GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE/native"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="text-lime-400 hover:underline"
                                            >StellarX</a
                                        >
                                        <p class="text-xs text-slate-400 mt-1">
                                            Primary KALE trading market
                                        </p>
                                    </div>
                                </li>
                                <li class="flex gap-3">
                                    <span class="text-lime-400 font-semibold"
                                        >3.</span
                                    >
                                    <div>
                                        <strong>Transfer</strong> from another
                                        Stellar wallet to your SMOL address
                                        <p class="text-xs text-slate-400 mt-1">
                                            Try <a
                                                href="https://lobstr.co"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="text-lime-400 hover:underline"
                                                >Lobstr</a
                                            > - a great mobile wallet for Stellar
                                        </p>
                                    </div>
                                </li>
                            </ol>
                        </div>

                        <div class="pt-3 border-t border-slate-700">
                            <p class="text-slate-100 font-semibold mb-2">
                                The Lore
                            </p>
                            <p class="text-xs text-slate-400 leading-relaxed">
                                KALE has a sci-fi story set on planet Demeter -
                                scientists using Kale-Corium to end universal
                                hunger while fighting off the villain Zebulon.
                                Read more at <a
                                    href="https://kalepail.com/kale"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-lime-400 hover:underline"
                                    >kalepail.com/kale</a
                                >
                                and
                                <a
                                    href="https://kalefarm.xyz/about/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-lime-400 hover:underline"
                                    >kalefarm.xyz/about</a
                                >.
                            </p>
                        </div>
                    </div>
                {/if}
            </div>

            <div class="rounded bg-slate-800/80 border border-slate-700 p-4">
                <p class="text-sm text-slate-300">Connected address</p>
                <p class="font-mono break-all text-slate-100">
                    {userState.contractId}
                </p>
                {#if typeof balanceState.balance === "bigint"}
                    <p class="mt-2 text-sm text-lime-300">
                        Balance: {formatKaleBalance(balanceState.balance)} KALE
                    </p>
                {/if}
            </div>

            <form
                class="rounded bg-slate-800/80 border border-slate-700 p-4 space-y-4"
                onsubmit={(e) => {
                    e.preventDefault();
                    sendKale();
                }}
            >
                <div>
                    <label
                        class="block text-sm text-slate-300 mb-1"
                        for="account-to">Send to</label
                    >
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
                    <label
                        class="block text-sm text-slate-300 mb-1"
                        for="account-amount">Amount (KALE)</label
                    >
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
                    <p
                        class="rounded border border-rose-500 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
                    >
                        {error}
                    </p>
                {/if}
                {#if success}
                    <p
                        class="rounded border border-lime-500 bg-lime-500/10 px-3 py-2 text-sm text-lime-200"
                    >
                        {success}
                    </p>
                {/if}

                <button
                    type="submit"
                    class="w-full rounded bg-lime-500 px-4 py-2 text-base font-semibold text-slate-900 hover:bg-lime-400 disabled:opacity-60"
                    disabled={submitting || !turnstileToken}
                >
                    {submitting ? "Sending..." : "Send KALE"}
                </button>
                <div class="flex justify-center mt-4">
                    <Turnstile
                        siteKey={import.meta.env.PUBLIC_TURNSTILE_SITE_KEY}
                        on:callback={(e) => {
                            turnstileToken = e.detail.token;
                        }}
                        on:expired={() => {
                            turnstileToken = "";
                        }}
                        theme="dark"
                    />
                </div>
            </form>
        </div>
    {/if}
</div>
