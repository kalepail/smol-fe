/**
 * Simplified Transaction Helpers
 */

import { account, send } from "./passkey-kit";
import { getLatestSequence } from "./base";
import { getSafeRpId } from "./domains";
import { updateAllBalances } from "../stores/balance.svelte.ts";

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
 *
 * AI DEBUG GUIDE:
 * - "wallet undefined" errors: PasskeyKit singleton wasn't connected
 * - "options undefined" errors: sign() called before connectWallet()
 * - Check kit.wallet to see if connection state persists
 */
export async function signAndSend(
    transaction: any,
    options: SignAndSendOptions
): Promise<SignAndSendResult> {
    const { keyId, turnstileToken, updateBalance, contractId } = options;

    // AI DEBUG: Log entry context
    console.log('[SignAndSend] Starting:', {
        hasKeyId: !!keyId,
        hasTurnstileToken: !!turnstileToken,
        hasContractId: !!contractId,
        updateBalance,
        transactionType: transaction?.constructor?.name || typeof transaction,
    });

    try {
        const sequence = await getLatestSequence();
        const rpId = getSafeRpId(window.location.hostname);
        const kit = account.get();

        // AI DEBUG: Log wallet state before potential connection
        console.log('[SignAndSend] PasskeyKit state:', {
            hasWallet: !!kit.wallet,
            walletOptions: kit.wallet?.options ? 'present' : 'missing',
            rpId,
            sequence,
        });

        // Ensure wallet is connected before signing
        // PasskeyKit.sign() accesses this.wallet.options internally,
        // which is only populated after connectWallet() is called
        if (!kit.wallet && contractId) {
            console.log('[SignAndSend] Wallet not connected, calling connectWallet...');
            await kit.connectWallet({
                rpId,
                keyId,
                getContractId: async () => contractId,
            });
            console.log('[SignAndSend] Wallet connected successfully');
        }

        console.log('[SignAndSend] Signing transaction...');
        const signedTx = await kit.sign(transaction, {
            rpId,
            keyId,
            expiration: sequence + 60,
        });
        console.log('[SignAndSend] Transaction signed, sending to relayer...');

        const result = await send(signedTx, turnstileToken);

        if (updateBalance && contractId) {
            console.log('[SignAndSend] Updating all balances...');
            await updateAllBalances(contractId);
        }

        console.log('[SignAndSend] SUCCESS:', {
            hash: result.hash || result.transactionHash,
        });

        return {
            success: true,
            result,
            transactionHash: result.hash || result.transactionHash,
        };
    } catch (error: any) {
        // AI DEBUG: Detailed error logging
        console.error("[SignAndSend] FAILED:", {
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 3).join('\n'),
            isAbort: error.name === 'AbortError',
            isNotAllowed: error.name === 'NotAllowedError',
        });
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
