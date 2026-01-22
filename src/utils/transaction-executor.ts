/**
 * Transaction Execution Wrapper
 *
 * Provides a comprehensive wrapper for executing transactions with
 * all optimizations: validation, locking, error handling, logging.
 */

import type { AssembledTransaction } from "@stellar/stellar-sdk/minimal/contract";
import { account, send } from "./passkey-kit";
import { getLatestSequence } from "./base";
import { getSafeRpId } from "./domains";
import { userState } from "../stores/user.svelte";
import {
    acquireTransactionLock,
    releaseTransactionLock,
    updateContractBalance,
} from "../stores/balance.svelte";
import {
    validateAddress,
    validateAmount,
    validateKeyId,
    validateRpId,
    validateTurnstileToken,
    validateSequenceNotExpired,
    calculateExpirationSequence,
} from "./transaction-validation";
import {
    createAuthenticationError,
    createTransactionError,
    createTurnstileError,
    wrapError,
    logError,
    type SmolError,
} from "./errors";

export interface TransactionOptions {
    turnstileToken: string;
    /**
     * Number of ledgers ahead for expiration (default: 60 = ~5 minutes)
     */
    expirationLedgers?: number;
    /**
     * Whether to update balance after transaction (default: true)
     */
    updateBalance?: boolean;
    /**
     * Custom validation function to run before transaction
     */
    preValidation?: () => Promise<void> | void;
    /**
     * Custom callback after successful transaction
     */
    onSuccess?: () => Promise<void> | void;
    /**
     * Custom error handler
     */
    onError?: (error: SmolError) => void;
}

export interface TransactionResult<T = any> {
    success: boolean;
    result?: T;
    error?: SmolError;
    transactionHash?: string;
}

/**
 * Execute a transaction with comprehensive error handling and validation
 *
 * @param transaction The assembled transaction to execute
 * @param options Transaction options including turnstile token
 * @returns Transaction result with success status
 */
export async function executeTransaction<T>(
    transaction: AssembledTransaction<T>,
    options: TransactionOptions
): Promise<TransactionResult<T>> {
    const {
        turnstileToken,
        expirationLedgers = 60,
        updateBalance = true,
        preValidation,
        onSuccess,
        onError,
    } = options;

    // Validate authentication state
    if (!userState.contractId || !userState.keyId) {
        const error = createAuthenticationError('User not authenticated');
        logError(error);
        if (onError) onError(error);
        return { success: false, error };
    }

    // Acquire transaction lock to prevent concurrent transactions
    const lockAcquired = acquireTransactionLock();
    if (!lockAcquired) {
        const error = createTransactionError('Another transaction is already in progress');
        logError(error);
        if (onError) onError(error);
        return { success: false, error };
    }

    try {
        // Validate inputs
        try {
            validateKeyId(userState.keyId);
            validateTurnstileToken(turnstileToken);
            const rpId = getSafeRpId(window.location.hostname);
            validateRpId(rpId);

            // Run custom pre-validation if provided
            if (preValidation) {
                await preValidation();
            }
        } catch (error) {
            const wrappedError = wrapError(error, 'Validation failed');
            logError(wrappedError);
            if (onError) onError(wrappedError);
            return { success: false, error: wrappedError };
        }

        // Get latest sequence and calculate expiration
        let currentSequence: number;
        let expirationSequence: number;

        try {
            currentSequence = await getLatestSequence();
            expirationSequence = calculateExpirationSequence(currentSequence, expirationLedgers);
            console.log(
                `[TxExecutor] Current sequence: ${currentSequence}, Expiration: ${expirationSequence} (+${expirationLedgers} ledgers)`
            );
        } catch (error) {
            const wrappedError = wrapError(error, 'Failed to fetch ledger sequence');
            logError(wrappedError);
            if (onError) onError(wrappedError);
            return { success: false, error: wrappedError };
        }

        // Sign transaction
        let signedTx: AssembledTransaction<T>;

        try {
            const rpId = getSafeRpId(window.location.hostname);
            signedTx = await account.get().sign(transaction, {
                rpId,
                keyId: userState.keyId,
                expiration: expirationSequence,
            });
            console.log('[TxExecutor] Transaction signed successfully');
        } catch (error) {
            const wrappedError = wrapError(error, 'Failed to sign transaction');
            logError(wrappedError);
            if (onError) onError(wrappedError);
            return { success: false, error: wrappedError };
        }

        // Validate expiration one more time before submission (in case signing took long)
        try {
            const currentSeq = await getLatestSequence();
            validateSequenceNotExpired(currentSeq, expirationSequence, 5);
        } catch (error) {
            const wrappedError = wrapError(error, 'Transaction expired before submission');
            logError(wrappedError);
            if (onError) onError(wrappedError);
            return { success: false, error: wrappedError };
        }

        // Submit transaction
        let result: any;

        try {
            result = await send(signedTx, turnstileToken);
            console.log('[TxExecutor] Transaction submitted successfully:', result);
        } catch (error) {
            const wrappedError = wrapError(error, 'Failed to submit transaction');
            logError(wrappedError);
            if (onError) onError(wrappedError);
            return { success: false, error: wrappedError };
        }

        // Update balance if requested
        if (updateBalance && userState.contractId) {
            try {
                await updateContractBalance(userState.contractId);
                console.log('[TxExecutor] Balance updated after transaction');
            } catch (error) {
                console.warn('[TxExecutor] Failed to update balance after transaction:', error);
                // Don't fail the transaction if balance update fails
            }
        }

        // Call success callback if provided
        if (onSuccess) {
            try {
                await onSuccess();
            } catch (error) {
                console.warn('[TxExecutor] Success callback failed:', error);
                // Don't fail the transaction if callback fails
            }
        }

        return {
            success: true,
            result,
            transactionHash: result?.hash,
        };

    } catch (error) {
        // Catch-all for unexpected errors
        const wrappedError = wrapError(error, 'Unexpected error during transaction');
        logError(wrappedError);
        if (onError) onError(wrappedError);
        return { success: false, error: wrappedError };

    } finally {
        // Always release the lock
        releaseTransactionLock();
        console.log('[TxExecutor] Transaction lock released');
    }
}

/**
 * Execute a transfer transaction with built-in validation
 */
export async function executeTransfer(params: {
    from: string;
    to: string;
    amount: bigint;
    turnstileToken: string;
    kaleClient: any; // SACClient instance
    onSuccess?: () => void;
    onError?: (error: SmolError) => void;
}): Promise<TransactionResult> {
    const { from, to, amount, turnstileToken, kaleClient, onSuccess, onError } = params;

    try {
        // Validate inputs
        validateAddress(from, 'From address');
        validateAddress(to, 'To address');
        validateAmount(amount, 'Transfer amount');

        // Build transaction
        const transaction = await kaleClient.transfer({ from, to, amount });

        // Execute with comprehensive error handling
        return await executeTransaction(transaction, {
            turnstileToken,
            onSuccess,
            onError,
        });

    } catch (error) {
        const wrappedError = wrapError(error, 'Failed to prepare transfer transaction');
        logError(wrappedError);
        if (onError) onError(wrappedError);
        return { success: false, error: wrappedError };
    }
}
