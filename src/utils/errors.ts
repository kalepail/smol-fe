/**
 * Typed Error System for Transaction & Authentication Layer
 *
 * Provides structured error types with proper categorization, user-friendly
 * messages, and recovery suggestions.
 */

export enum ErrorCategory {
    NETWORK = 'NETWORK',
    AUTHENTICATION = 'AUTHENTICATION',
    VALIDATION = 'VALIDATION',
    TRANSACTION = 'TRANSACTION',
    RELAYER = 'RELAYER',
    CONTRACT = 'CONTRACT',
    TIMEOUT = 'TIMEOUT',
    UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
    LOW = 'LOW',           // User can retry immediately
    MEDIUM = 'MEDIUM',     // User should wait before retry
    HIGH = 'HIGH',         // User needs to take action (reconnect, etc.)
    CRITICAL = 'CRITICAL', // System-level issue, contact support
}

export interface SmolErrorDetails {
    category: ErrorCategory;
    severity: ErrorSeverity;
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    recoverySuggestion?: string;
    originalError?: Error;
    metadata?: Record<string, any>;
}

export class SmolError extends Error {
    public readonly category: ErrorCategory;
    public readonly severity: ErrorSeverity;
    public readonly code: string;
    public readonly userMessage: string;
    public readonly retryable: boolean;
    public readonly recoverySuggestion?: string;
    public readonly originalError?: Error;
    public readonly metadata?: Record<string, any>;

    constructor(details: SmolErrorDetails) {
        super(details.message);
        this.name = 'SmolError';
        this.category = details.category;
        this.severity = details.severity;
        this.code = details.code;
        this.userMessage = details.userMessage;
        this.retryable = details.retryable;
        this.recoverySuggestion = details.recoverySuggestion;
        this.originalError = details.originalError;
        this.metadata = details.metadata;

        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, SmolError);
        }
    }

    /**
     * Get a user-friendly error message with recovery suggestion
     */
    getUserFriendlyMessage(): string {
        let message = this.userMessage;
        if (this.recoverySuggestion) {
            message += ` ${this.recoverySuggestion}`;
        }
        return message;
    }

    /**
     * Convert to plain object for logging/telemetry
     */
    toJSON() {
        return {
            name: this.name,
            category: this.category,
            severity: this.severity,
            code: this.code,
            message: this.message,
            userMessage: this.userMessage,
            retryable: this.retryable,
            recoverySuggestion: this.recoverySuggestion,
            metadata: this.metadata,
            stack: this.stack,
        };
    }
}

/**
 * Error Factory Functions
 */

export function createNetworkError(message: string, originalError?: Error): SmolError {
    return new SmolError({
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        code: 'NETWORK_ERROR',
        message,
        userMessage: 'Network connection issue. Please check your internet connection.',
        retryable: true,
        recoverySuggestion: 'Try again in a moment.',
        originalError,
    });
}

export function createAuthenticationError(message: string, originalError?: Error): SmolError {
    return new SmolError({
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        code: 'AUTH_ERROR',
        message,
        userMessage: 'Authentication failed. Your session may have expired.',
        retryable: true,
        recoverySuggestion: 'Please reconnect your wallet.',
        originalError,
    });
}

export function createValidationError(message: string, field?: string): SmolError {
    return new SmolError({
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        code: 'VALIDATION_ERROR',
        message,
        userMessage: message,
        retryable: false,
        metadata: { field },
    });
}

export function createTransactionError(message: string, originalError?: Error): SmolError {
    return new SmolError({
        category: ErrorCategory.TRANSACTION,
        severity: ErrorSeverity.MEDIUM,
        code: 'TRANSACTION_ERROR',
        message,
        userMessage: 'Transaction failed. Please try again.',
        retryable: true,
        recoverySuggestion: 'Check your balance and try again.',
        originalError,
    });
}

export function createRelayerError(
    message: string,
    statusCode?: number,
    originalError?: Error
): SmolError {
    const isServerError = statusCode && statusCode >= 500;
    const isRateLimited = statusCode === 429;

    return new SmolError({
        category: ErrorCategory.RELAYER,
        severity: isServerError ? ErrorSeverity.CRITICAL : ErrorSeverity.MEDIUM,
        code: isRateLimited ? 'RELAYER_RATE_LIMITED' : 'RELAYER_ERROR',
        message,
        userMessage: isRateLimited
            ? 'Too many requests. Please wait a moment.'
            : isServerError
            ? 'Transaction service temporarily unavailable.'
            : 'Failed to submit transaction.',
        retryable: isServerError || isRateLimited,
        recoverySuggestion: isRateLimited
            ? 'Wait a few seconds and try again.'
            : isServerError
            ? 'Please try again in a moment.'
            : 'Please try again.',
        originalError,
        metadata: { statusCode },
    });
}

export function createTimeoutError(operation: string, timeoutMs: number): SmolError {
    return new SmolError({
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        code: 'TIMEOUT_ERROR',
        message: `${operation} timed out after ${timeoutMs}ms`,
        userMessage: 'Operation timed out. The network may be slow.',
        retryable: true,
        recoverySuggestion: 'Try again or check your connection.',
        metadata: { operation, timeoutMs },
    });
}

export function createContractError(message: string, contractId?: string): SmolError {
    return new SmolError({
        category: ErrorCategory.CONTRACT,
        severity: ErrorSeverity.HIGH,
        code: 'CONTRACT_ERROR',
        message,
        userMessage: 'Smart contract operation failed.',
        retryable: false,
        recoverySuggestion: 'Please contact support if this persists.',
        metadata: { contractId },
    });
}

export function createCircuitBreakerError(): SmolError {
    return new SmolError({
        category: ErrorCategory.RELAYER,
        severity: ErrorSeverity.CRITICAL,
        code: 'CIRCUIT_BREAKER_OPEN',
        message: 'Circuit breaker open - relayer unavailable',
        userMessage: 'Transaction service temporarily unavailable due to repeated failures.',
        retryable: true,
        recoverySuggestion: 'Please wait 30 seconds and try again.',
    });
}

export function createInsufficientBalanceError(
    required: bigint,
    available: bigint
): SmolError {
    return new SmolError({
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance: required ${required}, available ${available}`,
        userMessage: 'Insufficient balance for this transaction.',
        retryable: false,
        recoverySuggestion: 'Please add more funds to your wallet.',
        metadata: { required: required.toString(), available: available.toString() },
    });
}

export function createTurnstileError(message: string): SmolError {
    return new SmolError({
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        code: 'TURNSTILE_ERROR',
        message,
        userMessage: 'CAPTCHA verification failed or expired.',
        retryable: true,
        recoverySuggestion: 'Please complete the CAPTCHA again.',
    });
}

export function createXDRParsingError(message: string, originalError?: Error): SmolError {
    return new SmolError({
        category: ErrorCategory.TRANSACTION,
        severity: ErrorSeverity.HIGH,
        code: 'XDR_PARSING_ERROR',
        message,
        userMessage: 'Failed to process transaction data.',
        retryable: false,
        recoverySuggestion: 'Please try again or contact support.',
        originalError,
    });
}

export function createSequenceExpirationError(
    currentSequence: number,
    expirationSequence: number
): SmolError {
    return new SmolError({
        category: ErrorCategory.TRANSACTION,
        severity: ErrorSeverity.MEDIUM,
        code: 'SEQUENCE_EXPIRED',
        message: `Transaction expired: current ${currentSequence}, expiration ${expirationSequence}`,
        userMessage: 'Transaction took too long and expired.',
        retryable: true,
        recoverySuggestion: 'Please try the transaction again.',
        metadata: { currentSequence, expirationSequence },
    });
}

/**
 * Convert unknown error to SmolError
 */
export function wrapError(error: unknown, defaultMessage = 'An unexpected error occurred'): SmolError {
    if (error instanceof SmolError) {
        return error;
    }

    if (error instanceof Error) {
        // Try to categorize based on error message
        const message = error.message.toLowerCase();

        if (message.includes('network') || message.includes('fetch')) {
            return createNetworkError(error.message, error);
        }

        if (message.includes('auth') || message.includes('wallet') || message.includes('passkey')) {
            return createAuthenticationError(error.message, error);
        }

        if (message.includes('timeout') || message.includes('timed out')) {
            return createTimeoutError(error.message, 60000);
        }

        if (message.includes('balance')) {
            return createValidationError(error.message);
        }

        // Default unknown error
        return new SmolError({
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.MEDIUM,
            code: 'UNKNOWN_ERROR',
            message: error.message,
            userMessage: defaultMessage,
            retryable: true,
            recoverySuggestion: 'Please try again.',
            originalError: error,
        });
    }

    // Non-Error object
    return new SmolError({
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.MEDIUM,
        code: 'UNKNOWN_ERROR',
        message: String(error),
        userMessage: defaultMessage,
        retryable: true,
    });
}

/**
 * Log error with appropriate level based on severity
 */
export function logError(error: SmolError): void {
    const logData = {
        code: error.code,
        category: error.category,
        severity: error.severity,
        message: error.message,
        metadata: error.metadata,
    };

    switch (error.severity) {
        case ErrorSeverity.CRITICAL:
            console.error('[CRITICAL]', logData);
            break;
        case ErrorSeverity.HIGH:
            console.error('[ERROR]', logData);
            break;
        case ErrorSeverity.MEDIUM:
            console.warn('[WARNING]', logData);
            break;
        case ErrorSeverity.LOW:
            console.log('[INFO]', logData);
            break;
    }
}
