import logger, { LogCategory } from "./debug-logger";

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    shouldRetry?: (error: any) => boolean;
    onRetry?: (attempt: number, error: any, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
    shouldRetry: (error: any) => {
        // Intelligent default: Retry on network/server errors, fail on client logic
        const msg = String(error?.message || error || "").toLowerCase();

        // Don't retry user rejections or business logic failures
        if (msg.includes("user rejected") || msg.includes("insufficient balance") || msg.includes("invalid address")) {
            return false;
        }

        // Retry specific known relayer/network issues
        return (
            msg.includes("500") ||
            msg.includes("503") ||
            msg.includes("504") ||
            msg.includes("econnreset") ||
            msg.includes("timeout") ||
            msg.includes("network error") ||
            msg.includes("fetch failed") ||
            msg.includes("gateway")
        );
    },
    onRetry: () => { }
};

/**
 * Intelligent retry wrapper specifically tuned for blockchain/relayer interactions.
 * Uses exponential backoff with jitter to prevent thundering herds.
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
    contextName: string = "Operation"
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: any;

    for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // If we've exhausted retries, throw immediately
            if (attempt > opts.maxRetries) break;

            // Check if we should retry based on the error type
            if (!opts.shouldRetry(error)) {
                logger.warn(LogCategory.GENERAL, `[Retry] Aborting retry for ${contextName}: Fatal error type`, error);
                throw error;
            }

            // Calculate delay with exponential backoff and jitter
            const backoff = Math.min(
                opts.maxDelayMs,
                opts.baseDelayMs * Math.pow(opts.backoffFactor, attempt - 1)
            );
            // Add +- 20% jitter
            const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
            const delay = Math.floor(backoff + jitter);

            logger.warn(LogCategory.GENERAL, `[Retry] ${contextName} failed (Attempt ${attempt}/${opts.maxRetries}). Retrying in ${delay}ms...`, { error });

            if (opts.onRetry) {
                opts.onRetry(attempt, error, delay);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}
