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

function extractHexTxHash(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.startsWith("0x") ? value.slice(2) : value;
    if (/^[0-9a-fA-F]{64}$/.test(normalized)) return normalized;
    return undefined;
}

export function extractTxHashFromRelayerResponse(result: any, depth = 0): string | undefined {
    if (!result || depth > 3) return undefined;
    // Common shapes we see across relayers:
    // 1) { hash: "..." }
    // 2) { transactionHash: "..." }
    // 3) { data: { hash: "..." } }  (OpenZeppelin Channels)
    // 4) { data: { transactionHash: "..." } }
    // Never treat UUID-like transactionId as a tx hash.
    const direct =
        extractHexTxHash(result?.hash) ||
        extractHexTxHash(result?.transactionHash) ||
        extractHexTxHash(result?.txHash) ||
        extractHexTxHash(result?.transaction_hash) ||
        extractHexTxHash(result?.data?.hash) ||
        extractHexTxHash(result?.data?.transactionHash) ||
        extractHexTxHash(result?.data?.txHash) ||
        extractHexTxHash(result?.data?.transaction_hash);

    if (direct) return direct;

    // Some relayers wrap the response as { success, result: { ... } } or { result: { data: { hash } } }.
    return extractTxHashFromRelayerResponse(result?.result, depth + 1);
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
        const kit = await account.get();

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

        // Retry *sending* a signed transaction when the relayer is transiently overloaded.
        // This avoids extra passkey prompts on 503 bursts.
        const sendWithRetries = async () => {
            const isRetryable = (msg: string) =>
                msg.includes("temporarily unavailable") ||
                msg.includes("503") ||
                msg.includes("502") ||
                msg.includes("gateway") ||
                msg.includes("timeout");

            let lastErr: any = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    return await send(signedTx, turnstileToken);
                } catch (e: any) {
                    lastErr = e;
                    const msg = String(e?.message || e);
                    if (!isRetryable(msg) || attempt === 2) throw e;
                    const waitMs = 750 * 2 ** attempt + Math.floor(Math.random() * 200);
                    console.warn("[SignAndSend] Relayer send failed, retrying without re-sign...", {
                        attempt: attempt + 1,
                        waitMs,
                        message: msg.slice(0, 160),
                    });
                    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
                }
            }
            throw lastErr;
        };

        const result = await sendWithRetries();

        if (updateBalance && contractId) {
            console.log('[SignAndSend] Updating all balances...');
            await updateAllBalances(contractId);
        }

        console.log('[SignAndSend] SUCCESS:', {
            hash: result?.hash || result?.transactionHash || result?.data?.hash || result?.data?.transactionHash,
        });

        const txHash = extractTxHashFromRelayerResponse(result);

        return {
            success: true,
            result,
            transactionHash: txHash,
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
