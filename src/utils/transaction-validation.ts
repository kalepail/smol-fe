/**
 * Transaction Validation Utilities
 *
 * Provides validation functions for transactions, addresses, amounts,
 * and other transaction-related data.
 */

import { StrKey } from "@stellar/stellar-sdk/minimal";
import { createValidationError, createSequenceExpirationError } from "./errors";

/**
 * Validate a Stellar address (public key or contract)
 */
export function validateAddress(address: string, fieldName = 'Address'): void {
    if (!address || typeof address !== 'string') {
        throw createValidationError(`${fieldName} is required`, fieldName);
    }

    const trimmed = address.trim();

    if (!trimmed) {
        throw createValidationError(`${fieldName} cannot be empty`, fieldName);
    }

    const isValidPubKey = StrKey.isValidEd25519PublicKey(trimmed);
    const isValidContract = StrKey.isValidContract(trimmed);

    if (!isValidPubKey && !isValidContract) {
        throw createValidationError(
            `${fieldName} must be a valid Stellar address (G... or C...)`,
            fieldName
        );
    }
}

/**
 * Validate a contract address specifically
 */
export function validateContractAddress(address: string, fieldName = 'Contract address'): void {
    if (!address || typeof address !== 'string') {
        throw createValidationError(`${fieldName} is required`, fieldName);
    }

    const trimmed = address.trim();

    if (!trimmed) {
        throw createValidationError(`${fieldName} cannot be empty`, fieldName);
    }

    if (!StrKey.isValidContract(trimmed)) {
        throw createValidationError(
            `${fieldName} must be a valid contract address (C...)`,
            fieldName
        );
    }
}

/**
 * Validate an amount (must be positive bigint)
 */
export function validateAmount(amount: bigint | null | undefined, fieldName = 'Amount'): void {
    if (amount === null || amount === undefined) {
        throw createValidationError(`${fieldName} is required`, fieldName);
    }

    if (typeof amount !== 'bigint') {
        throw createValidationError(`${fieldName} must be a bigint`, fieldName);
    }

    if (amount <= 0n) {
        throw createValidationError(`${fieldName} must be greater than zero`, fieldName);
    }
}

/**
 * Validate amount against balance
 */
export function validateSufficientBalance(
    amount: bigint,
    balance: bigint | null,
    fieldName = 'Amount'
): void {
    if (balance === null) {
        throw createValidationError('Balance is not available', 'Balance');
    }

    if (amount > balance) {
        throw createValidationError(
            `Insufficient balance. Required: ${amount}, Available: ${balance}`,
            fieldName
        );
    }
}

/**
 * Validate sequence number hasn't expired
 * @param currentSequence Current ledger sequence
 * @param expirationSequence Transaction expiration sequence
 * @param bufferLedgers Number of ledgers buffer to keep before expiration (default: 10)
 */
export function validateSequenceNotExpired(
    currentSequence: number,
    expirationSequence: number,
    bufferLedgers = 10
): void {
    // Check if already expired
    if (currentSequence >= expirationSequence) {
        throw createSequenceExpirationError(currentSequence, expirationSequence);
    }

    // Check if will expire soon
    const ledgersRemaining = expirationSequence - currentSequence;
    if (ledgersRemaining < bufferLedgers) {
        console.warn(
            `[TransactionValidation] Transaction will expire soon (${ledgersRemaining} ledgers remaining)`
        );
    }
}

/**
 * Parse and validate a numeric input string to bigint
 * @param input User input string
 * @param decimals Number of decimals for the token
 * @returns Parsed amount in token units (bigint)
 */
export function parseAndValidateAmount(input: string, decimals: number): bigint {
    const sanitized = input.trim().replace(/,/g, '');

    if (!sanitized) {
        throw createValidationError('Amount is required', 'Amount');
    }

    // Check for valid number format
    if (!/^\d+(\.\d+)?$/.test(sanitized)) {
        throw createValidationError('Amount must be a valid number', 'Amount');
    }

    const [integerPart, fractionalPart = ''] = sanitized.split('.');

    // Validate integer part
    if (!/^\d+$/.test(integerPart)) {
        throw createValidationError('Invalid amount format', 'Amount');
    }

    // Validate fractional part
    if (fractionalPart && !/^\d+$/.test(fractionalPart)) {
        throw createValidationError('Invalid decimal format', 'Amount');
    }

    // Check decimal places don't exceed token decimals
    if (fractionalPart.length > decimals) {
        throw createValidationError(
            `Amount has too many decimal places (max: ${decimals})`,
            'Amount'
        );
    }

    try {
        const decimalsFactor = 10n ** BigInt(decimals);
        const integerBig = BigInt(integerPart) * decimalsFactor;

        let fractionBig = 0n;
        if (fractionalPart) {
            const paddedFraction = fractionalPart.padEnd(decimals, '0');
            fractionBig = BigInt(paddedFraction);
        }

        const total = integerBig + fractionBig;

        if (total <= 0n) {
            throw createValidationError('Amount must be greater than zero', 'Amount');
        }

        return total;
    } catch (error) {
        if (error instanceof Error && error.name === 'SmolError') {
            throw error;
        }
        throw createValidationError('Failed to parse amount', 'Amount');
    }
}

/**
 * Validate transaction expiration time
 * @param expirationSequence Transaction expiration sequence
 * @param bufferLedgers Minimum ledgers before expiration (default: 10 = ~50s)
 */
export async function validateTransactionExpiration(
    expirationSequence: number,
    bufferLedgers = 10
): Promise<void> {
    try {
        const { getLatestSequence } = await import('./base');
        const currentSequence = await getLatestSequence();
        validateSequenceNotExpired(currentSequence, expirationSequence, bufferLedgers);
    } catch (error) {
        if (error instanceof Error && error.name === 'SmolError') {
            throw error;
        }
        throw createValidationError('Failed to validate transaction expiration', 'Expiration');
    }
}

/**
 * Validate keyId format
 */
export function validateKeyId(keyId: string | null | undefined): void {
    if (!keyId) {
        throw createValidationError('Key ID is required', 'KeyId');
    }

    if (typeof keyId !== 'string') {
        throw createValidationError('Key ID must be a string', 'KeyId');
    }

    // Basic sanity check - keyId should be base64-like
    if (!/^[A-Za-z0-9+/=_-]+$/.test(keyId)) {
        throw createValidationError('Key ID has invalid format', 'KeyId');
    }
}

/**
 * Validate RP ID (relying party ID for WebAuthn)
 */
export function validateRpId(rpId: string | null | undefined): void {
    if (!rpId) {
        throw createValidationError('RP ID is required', 'RpId');
    }

    if (typeof rpId !== 'string') {
        throw createValidationError('RP ID must be a string', 'RpId');
    }

    // Should be a valid domain
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(rpId)) {
        throw createValidationError('RP ID must be a valid domain', 'RpId');
    }
}

/**
 * Validate turnstile token
 */
export function validateTurnstileToken(token: string | null | undefined): void {
    if (!token) {
        throw createValidationError('Turnstile token is required', 'TurnstileToken');
    }

    if (typeof token !== 'string') {
        throw createValidationError('Turnstile token must be a string', 'TurnstileToken');
    }

    if (token.trim().length === 0) {
        throw createValidationError('Turnstile token cannot be empty', 'TurnstileToken');
    }
}

/**
 * Validate contract interaction parameters
 */
export interface ContractCallParams {
    contractId: string;
    method: string;
    args?: any[];
}

export function validateContractCall(params: ContractCallParams): void {
    validateContractAddress(params.contractId, 'Contract ID');

    if (!params.method || typeof params.method !== 'string') {
        throw createValidationError('Contract method is required', 'Method');
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(params.method)) {
        throw createValidationError('Contract method name is invalid', 'Method');
    }
}

/**
 * Calculate transaction expiration sequence
 * @param currentSequence Current ledger sequence
 * @param ledgersAhead Number of ledgers ahead for expiration (default: 60 = ~5 minutes)
 */
export function calculateExpirationSequence(
    currentSequence: number,
    ledgersAhead = 60
): number {
    if (!Number.isInteger(currentSequence) || currentSequence < 0) {
        throw createValidationError('Invalid current sequence', 'Sequence');
    }

    if (!Number.isInteger(ledgersAhead) || ledgersAhead <= 0) {
        throw createValidationError('Invalid ledgers ahead value', 'LedgersAhead');
    }

    return currentSequence + ledgersAhead;
}
