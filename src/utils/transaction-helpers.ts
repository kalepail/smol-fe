/**
 * Simplified Transaction Helpers
 */

import { account, send } from "./passkey-kit";
import { getLatestSequence } from "./base";
import { getSafeRpId } from "./domains";
import { updateContractBalance } from "../stores/balance.svelte.ts";

export interface SignAndSendOptions {
    keyId: string;
    turnstileToken: string;
    updateBalance?: boolean;
    contractId?: string;
    useLock?: boolean; // Maintained for API compatibility
}

export interface SignAndSendResult {
    success: boolean;
    result?: any;
    transactionHash?: string;
    error?: string;
}

/**
 * Simplified sign and send
 *
 * IMPORTANT: PasskeyKit.sign() requires the wallet to be connected first.
 * This function ensures connectWallet() is called before signing.
 */
export async function signAndSend(
    transaction: any,
    options: SignAndSendOptions
): Promise<SignAndSendResult> {
    const { keyId, turnstileToken, updateBalance, contractId } = options;

    try {
        const sequence = await getLatestSequence();
        const rpId = getSafeRpId(window.location.hostname);
        const kit = account.get();

        // Ensure wallet is connected before signing
        // PasskeyKit.sign() accesses this.wallet.options internally,
        // which is only populated after connectWallet() is called
        if (!kit.wallet && contractId) {
            await kit.connectWallet({
                rpId,
                keyId,
                getContractId: async () => contractId,
            });
        }

        const signedTx = await kit.sign(transaction, {
            rpId,
            keyId,
            expiration: sequence + 60,
        });

        const result = await send(signedTx, turnstileToken);

        if (updateBalance && contractId) {
            await updateContractBalance(contractId);
        }

        return {
            success: true,
            result,
            transactionHash: result.hash || result.transactionHash,
        };
    } catch (error: any) {
        console.error("[SignAndSend] Error:", error);
        return {
            success: false,
            error: error.message || String(error),
        };
    }
}

/**
 * Alias for signAndSend (for backward compatibility)
 */
export const signSendAndVerify = signAndSend;

/**
 * Universal cancellation check
 */
export function isUserCancellation(error: any): boolean {
    const msg = String(error).toLowerCase();
    return msg.includes("abort") || msg.includes("cancel") || msg.includes("not allowed");
}
